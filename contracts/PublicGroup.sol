// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ICollateralVault {
    function lockCollateral(address user, uint256 groupId, uint256 amount) external;
    function unlockCollateral(address user, uint256 groupId, uint256 amount) external;
    function slashCollateral(address user, uint256 groupId, uint256 amount, address recipient) external;
    function getRequiredCollateral(uint256 contribution, uint256 cycles, uint256 ratioBP) external pure returns (uint256);
    function getGroupCollateral(uint256 groupId, address user) external view returns (uint256);
}

interface IHHUSD {
    function balanceOf(address user) external view returns (uint256);
}

/**
 * @title PublicGroup
 * @notice Manages a single public savings group (rotating credit / ROSCa style)
 * @dev Deployed by PublicGroupFactory for each group instance
 */
contract PublicGroup is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Enums ───────────────────────────────────────────────────────────────

    enum GroupState {
        ENROLLING,
        POSITION_SELECTION,
        ACTIVE,
        COMPLETED,
        CANCELLED
    }

    enum MemberStatus {
        ACTIVE,
        WARNED,
        PENALIZED,
        REMOVED
    }

    // ─── Structs ─────────────────────────────────────────────────────────────

    struct Member {
        address wallet;
        uint256 joinTime;
        uint8   position;       // 1-based payout position
        uint256 collateral;     // HHUSD locked
        MemberStatus status;
        uint8   missedPayments; // 0,1,2 → 3rd = removal
        bool    hasReceivedPayout;
    }

    // ─── Immutables ──────────────────────────────────────────────────────────

    uint256 public immutable groupId;
    uint256 public immutable contributionAmount; // per cycle, in HHUSD (18 dec)
    uint256 public immutable totalCycles;
    uint256 public immutable cycleIntervalSeconds;
    uint256 public immutable minMembers;        // 10
    uint256 public immutable maxMembers;        // 20
    uint256 public immutable enrollmentDuration;       // 24 hours
    uint256 public immutable positionSelectionDuration; // 12 hours
    uint256 public immutable collateralRatioBP; // e.g. 10000 = 100%

    // ─── Addresses ───────────────────────────────────────────────────────────

    IHHUSD          public immutable hhusd;
    ICollateralVault public immutable vault;
    address         public immutable factory;

    // ─── State ───────────────────────────────────────────────────────────────

    GroupState public state;

    uint256 public enrollmentDeadline;
    uint256 public positionSelectionDeadline;
    uint256 public currentCycle;           // 1-based
    uint256 public cycleStartTime;

    address[] public memberList;
    mapping(address => Member) public members;
    mapping(uint8 => address) public positionToMember; // position => wallet

    uint256 public totalContributed;       // HHUSD in contract this cycle

    // ─── Events ──────────────────────────────────────────────────────────────

    event MemberJoined(address indexed user, uint256 joinTime);
    event EnrollmentClosed(uint256 memberCount);
    event PositionSelectionStarted(uint256 deadline);
    event PositionSelected(address indexed user, uint8 position);
    event PositionAutoAssigned(address indexed user, uint8 position);
    event GroupStarted(uint256 startTime);
    event ContributionMade(address indexed user, uint256 cycleNumber, uint256 amount);
    event PayoutDistributed(address indexed recipient, uint256 cycleNumber, uint256 amount);
    event PaymentWarned(address indexed user, uint256 cycleNumber);
    event CollateralDeducted(address indexed user, uint256 cycleNumber, uint256 amount);
    event MemberRemoved(address indexed user, uint256 cycleNumber);
    event GroupCompleted();
    event GroupCancelled(string reason);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotInState(GroupState required, GroupState current);
    error EnrollmentFull();
    error AlreadyMember();
    error NotMember();
    error PositionTaken(uint8 position);
    error PositionOutOfRange(uint8 position, uint256 maxPosition);
    error InsufficientHHUSD();
    error EnrollmentNotEnded();
    error PaymentWindowNotOpen();
    error AlreadyPaid();

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        uint256 _groupId,
        uint256 _contributionAmount,
        uint256 _totalCycles,
        uint256 _cycleIntervalSeconds,
        uint256 _collateralRatioBP,
        address _hhusd,
        address _vault
    ) {
        groupId                 = _groupId;
        contributionAmount      = _contributionAmount;
        totalCycles             = _totalCycles;
        cycleIntervalSeconds    = _cycleIntervalSeconds;
        minMembers              = 10;
        maxMembers              = 20;
        enrollmentDuration      = 24 hours;
        positionSelectionDuration = 12 hours;
        collateralRatioBP       = _collateralRatioBP;

        hhusd   = IHHUSD(_hhusd);
        vault   = ICollateralVault(_vault);
        factory = msg.sender;

        state = GroupState.ENROLLING;
        enrollmentDeadline = block.timestamp + enrollmentDuration;
    }

    // ─── Enrollment Phase ────────────────────────────────────────────────────

    /**
     * @notice Join the group during enrollment period
     * @dev User must have sufficient free HHUSD for collateral
     */
    function joinGroup() external nonReentrant {
        if (state != GroupState.ENROLLING) revert NotInState(GroupState.ENROLLING, state);
        if (block.timestamp > enrollmentDeadline) revert EnrollmentNotEnded();
        if (memberList.length >= maxMembers) revert EnrollmentFull();
        if (members[msg.sender].wallet != address(0)) revert AlreadyMember();

        uint256 requiredCollateral = vault.getRequiredCollateral(
            contributionAmount,
            totalCycles,
            collateralRatioBP
        );

        // Lock collateral
        vault.lockCollateral(msg.sender, groupId, requiredCollateral);

        members[msg.sender] = Member({
            wallet: msg.sender,
            joinTime: block.timestamp,
            position: 0,
            collateral: requiredCollateral,
            status: MemberStatus.ACTIVE,
            missedPayments: 0,
            hasReceivedPayout: false
        });
        memberList.push(msg.sender);

        emit MemberJoined(msg.sender, block.timestamp);
    }

    /**
     * @notice Close enrollment and begin position selection
     * @dev Can be called by anyone once enrollment deadline passes
     */
    function closeEnrollment() external {
        if (state != GroupState.ENROLLING) revert NotInState(GroupState.ENROLLING, state);
        if (block.timestamp <= enrollmentDeadline && memberList.length < maxMembers) {
            revert EnrollmentNotEnded();
        }

        if (memberList.length < minMembers) {
            // Cancel: not enough members
            _cancelGroup("Insufficient members");
            return;
        }

        state = GroupState.POSITION_SELECTION;
        positionSelectionDeadline = block.timestamp + positionSelectionDuration;

        emit EnrollmentClosed(memberList.length);
        emit PositionSelectionStarted(positionSelectionDeadline);
    }

    // ─── Position Selection Phase ─────────────────────────────────────────────

    /**
     * @notice Select a payout position
     * @dev Earlier joiners have priority; position is 1-based
     * @param position Desired payout position (1 to memberList.length)
     */
    function selectPosition(uint8 position) external nonReentrant {
        if (state != GroupState.POSITION_SELECTION)
            revert NotInState(GroupState.POSITION_SELECTION, state);
        if (block.timestamp > positionSelectionDeadline) revert EnrollmentNotEnded();
        if (members[msg.sender].wallet == address(0)) revert NotMember();
        if (members[msg.sender].position != 0) revert AlreadyPaid(); // already selected
        if (position == 0 || position > memberList.length)
            revert PositionOutOfRange(position, memberList.length);
        if (positionToMember[position] != address(0))
            revert PositionTaken(position);

        // Check earlier joiners haven't taken this slot (priority enforcement)
        // Earlier join time = lower index = higher priority
        // If the position is taken by someone who joined later, they must relinquish
        // For simplicity: first-come-first-served on selection (earliest joiner selects first in UI)

        members[msg.sender].position = position;
        positionToMember[position] = msg.sender;

        emit PositionSelected(msg.sender, position);
    }

    /**
     * @notice Finalize positions: randomly assign any unselected positions
     * @dev Called after selection deadline
     */
    function finalizeGroup() external {
        if (state != GroupState.POSITION_SELECTION)
            revert NotInState(GroupState.POSITION_SELECTION, state);
        if (block.timestamp <= positionSelectionDeadline) revert EnrollmentNotEnded();

        // Collect unassigned positions and unassigned members
        uint256 memberCount = memberList.length;
        uint8[] memory openPositions = new uint8[](memberCount);
        address[] memory unassignedMembers = new address[](memberCount);
        uint256 openCount;
        uint256 unassignedCount;

        for (uint8 i = 1; i <= memberCount; i++) {
            if (positionToMember[i] == address(0)) {
                openPositions[openCount++] = i;
            }
        }
        for (uint256 i = 0; i < memberCount; i++) {
            if (members[memberList[i]].position == 0) {
                unassignedMembers[unassignedCount++] = memberList[i];
            }
        }

        // Simple pseudo-random assignment (consider Chainlink VRF for production)
        uint256 seed = uint256(
            keccak256(abi.encodePacked(block.timestamp, block.prevrandao, memberCount))
        );
        for (uint256 i = 0; i < unassignedCount; i++) {
            uint256 pick = seed % (openCount - i);
            uint8 assignedPos = openPositions[pick];
            // Swap to avoid re-picking
            openPositions[pick] = openPositions[openCount - i - 1];

            address member = unassignedMembers[i];
            members[member].position = assignedPos;
            positionToMember[assignedPos] = member;
            seed = uint256(keccak256(abi.encodePacked(seed, i)));

            emit PositionAutoAssigned(member, assignedPos);
        }

        state = GroupState.ACTIVE;
        currentCycle = 1;
        cycleStartTime = block.timestamp;

        emit GroupStarted(block.timestamp);
    }

    // ─── Active Phase ─────────────────────────────────────────────────────────

    /**
     * @notice Make your contribution for the current cycle
     */
    function contribute() external nonReentrant {
        if (state != GroupState.ACTIVE) revert NotInState(GroupState.ACTIVE, state);
        Member storage m = members[msg.sender];
        if (m.wallet == address(0)) revert NotMember();
        if (m.status == MemberStatus.REMOVED) revert NotMember();

        // HHUSD is non-transferable; contributions are tracked via balance lock
        // In a full implementation, contributions would transfer HHUSD to this contract
        // via a special protocol transfer function in HHUSD or via USDT directly
        // For now we track it logically
        totalContributed += contributionAmount;

        emit ContributionMade(msg.sender, currentCycle, contributionAmount);
    }

    /**
     * @notice Distribute payout to the scheduled recipient for current cycle
     * @dev Can be called by keeper/automation or any member
     */
    function distributePayout() external nonReentrant {
        if (state != GroupState.ACTIVE) revert NotInState(GroupState.ACTIVE, state);
        if (block.timestamp < cycleStartTime + cycleIntervalSeconds)
            revert PaymentWindowNotOpen();

        address recipient = positionToMember[uint8(currentCycle)];
        uint256 payout = contributionAmount * memberList.length;

        // Transfer HHUSD payout to recipient
        // (In production: use protocol transfer or USDT equivalent)

        members[recipient].hasReceivedPayout = true;
        totalContributed = 0;

        emit PayoutDistributed(recipient, currentCycle, payout);

        if (currentCycle == totalCycles) {
            _completeGroup();
        } else {
            currentCycle++;
            cycleStartTime = block.timestamp;
        }
    }

    /**
     * @notice Issue a warning for missed payment
     */
    function warningMissedPayment(address user) external {
        if (state != GroupState.ACTIVE) revert NotInState(GroupState.ACTIVE, state);
        Member storage m = members[user];
        if (m.wallet == address(0)) revert NotMember();

        if (m.missedPayments == 0) {
            m.status = MemberStatus.WARNED;
            m.missedPayments = 1;
            emit PaymentWarned(user, currentCycle);
        } else if (m.missedPayments == 1) {
            _secondStrike(user);
        } else {
            _removeMember(user);
        }
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    function _secondStrike(address user) internal {
        Member storage m = members[user];
        m.missedPayments = 2;
        m.status = MemberStatus.PENALIZED;

        uint256 slashAmount = contributionAmount; // slash one cycle's contribution
        uint256 locked = vault.getGroupCollateral(groupId, user);
        if (locked < slashAmount) slashAmount = locked;

        if (slashAmount > 0) {
            vault.slashCollateral(user, groupId, slashAmount, address(0));
        }

        emit CollateralDeducted(user, currentCycle, slashAmount);
    }

    function _removeMember(address user) internal {
        Member storage m = members[user];
        m.status = MemberStatus.REMOVED;

        // Slash remaining collateral
        uint256 remaining = vault.getGroupCollateral(groupId, user);
        if (remaining > 0) {
            vault.slashCollateral(user, groupId, remaining, address(0));
        }

        emit MemberRemoved(user, currentCycle);
    }

    function _completeGroup() internal {
        state = GroupState.COMPLETED;

        // Unlock collateral for all active members
        for (uint256 i = 0; i < memberList.length; i++) {
            address member = memberList[i];
            if (members[member].status != MemberStatus.REMOVED) {
                uint256 locked = vault.getGroupCollateral(groupId, member);
                if (locked > 0) {
                    vault.unlockCollateral(member, groupId, locked);
                }
            }
        }

        emit GroupCompleted();
    }

    function _cancelGroup(string memory reason) internal {
        state = GroupState.CANCELLED;

        // Refund collateral to all members
        for (uint256 i = 0; i < memberList.length; i++) {
            address member = memberList[i];
            uint256 locked = vault.getGroupCollateral(groupId, member);
            if (locked > 0) {
                vault.unlockCollateral(member, groupId, locked);
            }
        }

        emit GroupCancelled(reason);
    }

    // ─── View Functions ──────────────────────────────────────────────────────

    function getMember(address user) external view returns (Member memory) {
        return members[user];
    }

    function getMemberCount() external view returns (uint256) {
        return memberList.length;
    }

    function getGroupInfo() external view returns (
        GroupState _state,
        uint256 _currentCycle,
        uint256 _totalCycles,
        uint256 _contribution,
        uint256 _memberCount,
        uint256 _cycleStartTime
    ) {
        return (state, currentCycle, totalCycles, contributionAmount, memberList.length, cycleStartTime);
    }

    function getPayoutSchedule() external view returns (address[] memory schedule) {
        schedule = new address[](totalCycles);
        for (uint256 i = 1; i <= totalCycles; i++) {
            schedule[i - 1] = positionToMember[uint8(i)];
        }
    }
}
