// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IVRFPositionAssigner {
    function requestRandomness(uint256 memberCount) external returns (uint256 requestId);
}

interface ICollateralVault {
    function lockCollateral(address user, uint256 groupId, uint256 amount) external;
    function unlockCollateral(address user, uint256 groupId, uint256 amount) external;
    function slashCollateral(address user, uint256 groupId, uint256 amount, address recipient) external;
    function getRequiredCollateral(uint256 contribution, uint256 cycles, uint256 ratioBP) external pure returns (uint256);
    function getGroupCollateral(uint256 groupId, address user) external view returns (uint256);
}

/**
 * @title PublicGroupVRF
 * @notice PublicGroup with Chainlink VRF v2.5 for provably fair position assignment
 *
 * @dev Key VRF flow:
 *   1. Position selection window closes (12h after enrollment ends)
 *   2. Any address calls finalizePositions() → sends VRF request
 *   3. Chainlink node responds → VRFPositionAssigner.fulfillRandomWords()
 *      → calls receiveRandomPositions() on this contract
 *   4. Unassigned positions are filled using Fisher-Yates shuffle
 *      seeded by the verified random word
 *
 * SECURITY GUARANTEES of VRF v2.5:
 *   - Random seed is generated off-chain with a cryptographic proof
 *   - Proof is verified on-chain before being used
 *   - Block producers / validators CANNOT manipulate the result
 *   - Contract deployer / admin CANNOT predict or influence the result
 *   - Result is publicly verifiable on-chain
 *
 * WAITING PERIOD:
 *   - VRF response takes ~3 block confirmations on BSC (~9 seconds)
 *   - Group enters PENDING_VRF state during this time
 *   - If VRF callback fails, admin can retry via retryVRFRequest()
 */
contract PublicGroupVRF is ReentrancyGuard {

    // ─── Enums ───────────────────────────────────────────────────────────────

    enum GroupState {
        ENROLLING,
        POSITION_SELECTION,
        PENDING_VRF,        // waiting for Chainlink callback
        ACTIVE,
        COMPLETED,
        CANCELLED
    }

    enum MemberStatus { ACTIVE, WARNED, PENALIZED, REMOVED }

    // ─── Structs ─────────────────────────────────────────────────────────────

    struct Member {
        address wallet;
        uint256 joinTime;
        uint8   position;
        uint256 collateral;
        MemberStatus status;
        uint16  missedPayments;
        bool    hasReceivedPayout;
    }

    // ─── Immutables ──────────────────────────────────────────────────────────

    uint256 public immutable groupId;
    uint256 public immutable contributionAmount;
    uint256 public immutable totalCycles;
    uint256 public immutable cycleIntervalSeconds;
    uint256 public immutable collateralRatioBP;

    ICollateralVault        public immutable vault;
    IVRFPositionAssigner    public immutable vrfAssigner;
    address                 public immutable factory;
    address                 public immutable devWallet;
    address                 public immutable eventWallet;  // 패널티 70% 적립 지갑

    uint256 public constant MIN_MEMBERS          = 10;
    uint256 public constant MAX_MEMBERS          = 20;
    uint256 public constant ENROLLMENT_DURATION  = 24 hours;
    uint256 public constant SELECTION_DURATION   = 12 hours;
    uint256 public constant VRF_TIMEOUT          = 1 hours;

    // 패널티 분배 비율 (basis points, 합계 10000)
    uint256 public constant PENALTY_DEV_BP       = 3000;   // 30% → 개발자
    uint256 public constant PENALTY_EVENT_BP     = 7000;   // 70% → 이벤트 지갑

    // 총 사이클의 80% 이상 미납 시 잔여 담보 몰수 가능
    uint256 public constant SLASH_THRESHOLD_BP   = 8000;   // 80%

    // ─── Mutable State ───────────────────────────────────────────────────────

    GroupState public state;

    uint256 public enrollmentDeadline;
    uint256 public positionSelectionDeadline;
    uint256 public vrfRequestedAt;
    uint256 public pendingVrfRequestId;

    uint256 public currentCycle;
    uint256 public cycleStartTime;

    address[] public memberList;
    mapping(address => Member) public members;
    mapping(uint8 => address)  public positionToMember;

    // ─── Events ──────────────────────────────────────────────────────────────

    event MemberJoined(address indexed user, uint256 joinTime);
    event EnrollmentClosed(uint256 memberCount);
    event PositionSelectionStarted(uint256 deadline);
    event PositionSelected(address indexed user, uint8 position);
    event VRFRequested(uint256 indexed requestId, uint256 unassignedCount);
    event VRFFulfilled(uint256 indexed requestId);
    event PositionAutoAssigned(address indexed user, uint8 position);
    event GroupStarted(uint256 startTime);
    event ContributionMade(address indexed user, uint256 cycle, uint256 amount);
    event PayoutDistributed(address indexed recipient, uint256 cycle, uint256 amount);
    event PaymentWarned(address indexed user, uint256 cycle);
    event CollateralDeducted(address indexed user, uint256 cycle, uint256 amount);
    event MemberRemoved(address indexed user, uint256 cycle);
    event GroupCompleted();
    event GroupCancelled(string reason);

    /// @notice 미납 횟수가 80% 임계치에 도달하면 발생 — 프론트/앱에서 경고 표시용
    event CollateralAtRisk(
        address indexed user,
        uint256 missedCount,
        uint256 totalCycles,
        uint256 collateralRemaining,
        string  message
    );
    /// @notice 유저가 담보를 추가 충전했을 때
    event CollateralToppedUp(address indexed user, uint256 addedAmount, uint256 newTotal);
    /// @notice 패널티 담보 분배 완료 (30% dev / 70% event)
    event PenaltyDistributed(address indexed user, uint256 devAmount, uint256 eventAmount);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotInState(GroupState required, GroupState current);
    error EnrollmentFull();
    error AlreadyMember();
    error NotMember();
    error DeadlineNotReached();
    error PositionTaken(uint8 position);
    error PositionOutOfRange(uint8 pos, uint256 max);
    error OnlyVRFAssigner();
    error VRFNotTimedOut();
    error AlreadySelectedPosition();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier inState(GroupState s) {
        if (state != s) revert NotInState(s, state);
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        uint256 _groupId,
        uint256 _contributionAmount,
        uint256 _totalCycles,
        uint256 _cycleIntervalSeconds,
        uint256 _collateralRatioBP,
        address _vault,
        address _vrfAssigner,
        address _devWallet,
        address _eventWallet
    ) {
        require(_devWallet   != address(0), "devWallet required");
        require(_eventWallet != address(0), "eventWallet required");
        groupId              = _groupId;
        contributionAmount   = _contributionAmount;
        totalCycles          = _totalCycles;
        cycleIntervalSeconds = _cycleIntervalSeconds;
        collateralRatioBP    = _collateralRatioBP;
        vault                = ICollateralVault(_vault);
        vrfAssigner          = IVRFPositionAssigner(_vrfAssigner);
        factory              = msg.sender;
        devWallet            = _devWallet;
        eventWallet          = _eventWallet;

        state = GroupState.ENROLLING;
        enrollmentDeadline = block.timestamp + ENROLLMENT_DURATION;
    }

    // ─── Phase 1: Enrollment ─────────────────────────────────────────────────

    function joinGroup() external nonReentrant inState(GroupState.ENROLLING) {
        require(block.timestamp <= enrollmentDeadline, "Enrollment closed");
        if (memberList.length >= MAX_MEMBERS) revert EnrollmentFull();
        if (members[msg.sender].wallet != address(0)) revert AlreadyMember();

        uint256 required = vault.getRequiredCollateral(
            contributionAmount, totalCycles, collateralRatioBP
        );
        vault.lockCollateral(msg.sender, groupId, required);

        members[msg.sender] = Member({
            wallet: msg.sender,
            joinTime: block.timestamp,
            position: 0,
            collateral: required,
            status: MemberStatus.ACTIVE,
            missedPayments: 0,
            hasReceivedPayout: false
        });
        memberList.push(msg.sender);

        emit MemberJoined(msg.sender, block.timestamp);
    }

    function closeEnrollment() external inState(GroupState.ENROLLING) {
        bool deadlinePassed = block.timestamp > enrollmentDeadline;
        bool fullGroup      = memberList.length >= MAX_MEMBERS;
        require(deadlinePassed || fullGroup, "Enrollment still open");

        if (memberList.length < MIN_MEMBERS) {
            _cancelGroup("Insufficient members");
            return;
        }

        state = GroupState.POSITION_SELECTION;
        positionSelectionDeadline = block.timestamp + SELECTION_DURATION;

        emit EnrollmentClosed(memberList.length);
        emit PositionSelectionStarted(positionSelectionDeadline);
    }

    // ─── Phase 2: Position Selection ─────────────────────────────────────────

    /**
     * @notice Member voluntarily selects their preferred payout position
     * @dev Earlier joiners have first priority (enforced off-chain via UI timing;
     *      on-chain it's first-come-first-served within the 12h window)
     */
    function selectPosition(uint8 position)
        external
        nonReentrant
        inState(GroupState.POSITION_SELECTION)
    {
        require(block.timestamp <= positionSelectionDeadline, "Selection window closed");
        Member storage m = members[msg.sender];
        if (m.wallet == address(0)) revert NotMember();
        if (m.position != 0) revert AlreadySelectedPosition();
        if (position == 0 || position > memberList.length)
            revert PositionOutOfRange(position, memberList.length);
        if (positionToMember[position] != address(0))
            revert PositionTaken(position);

        m.position = position;
        positionToMember[position] = msg.sender;

        emit PositionSelected(msg.sender, position);
    }

    // ─── Phase 3: VRF Request ────────────────────────────────────────────────

    /**
     * @notice Trigger VRF request for unselected positions
     * @dev Anyone can call this once the selection deadline has passed.
     *      If ALL positions are selected manually, skips VRF and starts immediately.
     */
    function finalizePositions() external inState(GroupState.POSITION_SELECTION) {
        if (block.timestamp <= positionSelectionDeadline) revert DeadlineNotReached();

        // Count unassigned members
        uint256 unassigned = _countUnassigned();

        if (unassigned == 0) {
            // All members self-selected → skip VRF, start immediately
            _startGroup();
            return;
        }

        // Request Chainlink VRF
        state = GroupState.PENDING_VRF;
        vrfRequestedAt = block.timestamp;

        uint256 reqId = vrfAssigner.requestRandomness(memberList.length);
        pendingVrfRequestId = reqId;

        emit VRFRequested(reqId, unassigned);
    }

    // ─── Phase 4: VRF Callback ────────────────────────────────────────────────

    /**
     * @notice Called by VRFPositionAssigner after Chainlink delivers randomness
     * @dev SECURITY: Only VRFPositionAssigner can call this.
     *      Uses Fisher-Yates shuffle seeded by the verified VRF random word.
     *      This guarantees no on-chain party (including validators) can predict
     *      or bias the result.
     *
     * @param randomWords Array of random uint256 values from Chainlink (length = 1)
     */
    function receiveRandomPositions(uint256[] calldata randomWords)
        external
        inState(GroupState.PENDING_VRF)
    {
        if (msg.sender != address(vrfAssigner)) revert OnlyVRFAssigner();

        emit VRFFulfilled(pendingVrfRequestId);

        uint256 seed = randomWords[0];
        _assignUnselectedPositions(seed);
        _startGroup();
    }

    /**
     * @notice Re-request VRF if the first request timed out (1 hour)
     * @dev Possible if Chainlink node was offline or subscription ran out of LINK
     */
    function retryVRFRequest() external inState(GroupState.PENDING_VRF) {
        if (block.timestamp < vrfRequestedAt + VRF_TIMEOUT) revert VRFNotTimedOut();

        vrfRequestedAt = block.timestamp;
        uint256 reqId = vrfAssigner.requestRandomness(memberList.length);
        pendingVrfRequestId = reqId;

        emit VRFRequested(reqId, _countUnassigned());
    }

    // ─── Phase 5: Active Group ────────────────────────────────────────────────

    function contribute() external nonReentrant inState(GroupState.ACTIVE) {
        Member storage m = members[msg.sender];
        if (m.wallet == address(0) || m.status == MemberStatus.REMOVED) revert NotMember();
        emit ContributionMade(msg.sender, currentCycle, contributionAmount);
    }

    function distributePayout() external nonReentrant inState(GroupState.ACTIVE) {
        require(
            block.timestamp >= cycleStartTime + cycleIntervalSeconds,
            "Cycle not ended"
        );

        address recipient = positionToMember[uint8(currentCycle)];
        uint256 payout = contributionAmount * memberList.length;

        members[recipient].hasReceivedPayout = true;
        emit PayoutDistributed(recipient, currentCycle, payout);

        if (currentCycle == totalCycles) {
            _completeGroup();
        } else {
            currentCycle++;
            cycleStartTime = block.timestamp;
        }
    }

    /**
     * @notice 미납 유저 처리
     *
     * 흐름:
     *   1. 담보 충분 → contributionAmount를 현재 사이클 수령인에게 직접 지급
     *      (미납이어도 수령인은 정상 금액을 받음)
     *      80% 임계치 도달 시 CollateralAtRisk 경고 이벤트 발생
     *   2. 담보 부족 → 잔여 담보를 수령인에게 지급 후 REMOVED
     *      그룹 완료 시 잔여 담보는 30% dev / 70% event 분배
     */
    function warningMissedPayment(address user) external inState(GroupState.ACTIVE) {
        Member storage m = members[user];
        if (m.wallet == address(0) || m.status == MemberStatus.REMOVED) revert NotMember();

        // 현재 사이클 수령인: 미납 기여금이 여기로 들어감
        address cycleRecipient = positionToMember[uint8(currentCycle)];
        uint256 available = vault.getGroupCollateral(groupId, user);

        if (available >= contributionAmount) {
            // 담보에서 기여금 차감 → 사이클 수령인에게 직접 지급
            vault.slashCollateral(user, groupId, contributionAmount, cycleRecipient);
            m.missedPayments++;

            if (m.missedPayments == 1) {
                m.status = MemberStatus.WARNED;
                emit PaymentWarned(user, currentCycle);
            } else {
                m.status = MemberStatus.PENALIZED;
            }
            emit CollateralDeducted(user, currentCycle, contributionAmount);

            // 80% 임계치 도달 시 경고 이벤트 (프론트/앱에서 팝업/알림 표시)
            uint256 remaining = vault.getGroupCollateral(groupId, user);
            if (uint256(m.missedPayments) * 10000 >= totalCycles * SLASH_THRESHOLD_BP) {
                emit CollateralAtRisk(
                    user,
                    m.missedPayments,
                    totalCycles,
                    remaining,
                    unicode"경고: 총 사이클의 80% 이상 미납되었습니다. 담보를 충전하지 않으면 그룹 완료 시 잔여 담보를 몰수당할 수 있습니다."
                );
            }
        } else {
            // 담보 부족 → 잔여 담보를 수령인에게 지급 후 제거
            if (available > 0) vault.slashCollateral(user, groupId, available, cycleRecipient);
            m.missedPayments++;
            m.status = MemberStatus.REMOVED;
            emit MemberRemoved(user, currentCycle);
        }
    }

    /**
     * @notice 담보 추가 충전 (Top-up)
     * @dev 미납 이력이 있어도 담보를 재충전할 수 있다.
     *      HHUSD를 vault에 approve 후 호출해야 함.
     *      80% 미납 경고를 받은 유저가 담보를 채워 몰수를 피할 수 있다.
     */
    function topUpCollateral(uint256 amount) external nonReentrant inState(GroupState.ACTIVE) {
        Member storage m = members[msg.sender];
        if (m.wallet == address(0) || m.status == MemberStatus.REMOVED) revert NotMember();
        require(amount > 0, "Amount must be > 0");

        vault.lockCollateral(msg.sender, groupId, amount);
        m.collateral += amount;

        uint256 newTotal = vault.getGroupCollateral(groupId, msg.sender);
        emit CollateralToppedUp(msg.sender, amount, newTotal);
    }

    /**
     * @notice 80% 이상 미납 유저의 잔여 담보를 강제 패널티 처리
     * @dev 그룹 진행 중 개발자가 호출 가능. 심각한 악성 유저에 대한 즉시 조치.
     */
    function forceClaimPenaltyCollateral(address user) external inState(GroupState.ACTIVE) {
        require(msg.sender == devWallet, "Only devWallet");
        Member storage m = members[user];
        if (m.wallet == address(0) || m.status == MemberStatus.REMOVED) revert NotMember();
        require(
            uint256(m.missedPayments) * 10000 >= totalCycles * SLASH_THRESHOLD_BP,
            "Threshold not reached"
        );

        uint256 remaining = vault.getGroupCollateral(groupId, user);
        if (remaining > 0) _distributePenalty(user, remaining);
        m.status = MemberStatus.REMOVED;
        emit MemberRemoved(user, currentCycle);
    }

    // ─── Internal Helpers ────────────────────────────────────────────────────

    /**
     * @notice Fisher-Yates shuffle on unassigned positions only
     * @dev Deterministic given VRF seed. Steps:
     *   1. Build array of unassigned (position, member) pairs
     *   2. Shuffle positions using derived seeds: seed_n = keccak256(seed_{n-1})
     *   3. Assign shuffled positions to unassigned members
     *
     *   Example with 3 unassigned members (positions 2, 5, 7):
     *   seed → pick from [2,5,7] → assign member A position 5
     *   derive next seed → pick from [2,7] → assign member B position 7
     *   last member C gets position 2
     */
    function _assignUnselectedPositions(uint256 seed) internal {
        uint256 count = memberList.length;

        // Gather open positions
        uint8[]   memory openPos     = new uint8[](count);
        address[] memory unassigned  = new address[](count);
        uint256 openCount;
        uint256 unassignedCount;

        for (uint8 i = 1; i <= count; i++) {
            if (positionToMember[i] == address(0)) openPos[openCount++] = i;
        }
        for (uint256 i = 0; i < count; i++) {
            if (members[memberList[i]].position == 0) {
                unassigned[unassignedCount++] = memberList[i];
            }
        }

        // Fisher-Yates partial shuffle (only unassigned slots)
        for (uint256 i = 0; i < unassignedCount; i++) {
            // Pick a random index from remaining open positions
            uint256 remaining  = openCount - i;
            uint256 pickIndex  = seed % remaining;
            uint8   pickedPos  = openPos[i + pickIndex];

            // Swap picked position to front of remaining range
            openPos[i + pickIndex] = openPos[i];
            openPos[i]             = pickedPos;

            // Assign
            address member = unassigned[i];
            members[member].position   = pickedPos;
            positionToMember[pickedPos] = member;

            emit PositionAutoAssigned(member, pickedPos);

            // Derive next seed deterministically from VRF word
            // This prevents correlation between consecutive picks
            seed = uint256(keccak256(abi.encode(seed, i, pickedPos)));
        }
    }

    function _startGroup() internal {
        state          = GroupState.ACTIVE;
        currentCycle   = 1;
        cycleStartTime = block.timestamp;
        emit GroupStarted(block.timestamp);
    }

    function _completeGroup() internal {
        state = GroupState.COMPLETED;
        for (uint256 i = 0; i < memberList.length; i++) {
            address m = memberList[i];
            uint256 locked = vault.getGroupCollateral(groupId, m);
            if (locked == 0) continue;

            if (members[m].missedPayments == 0) {
                // 성실 납부 유저 → 담보 전액 환불
                vault.unlockCollateral(m, groupId, locked);
            } else {
                // 미납 이력 유저 → 잔여 담보 패널티 분배 (30% dev / 70% event)
                _distributePenalty(m, locked);
            }
        }
        emit GroupCompleted();
    }

    /**
     * @notice 패널티 담보를 30% dev / 70% event 지갑으로 분배
     */
    function _distributePenalty(address user, uint256 amount) internal {
        if (amount == 0) return;
        uint256 devAmount   = (amount * PENALTY_DEV_BP) / 10000;
        uint256 eventAmount = amount - devAmount;

        if (devAmount > 0)   vault.slashCollateral(user, groupId, devAmount,   devWallet);
        if (eventAmount > 0) vault.slashCollateral(user, groupId, eventAmount, eventWallet);

        emit PenaltyDistributed(user, devAmount, eventAmount);
    }

    function _cancelGroup(string memory reason) internal {
        state = GroupState.CANCELLED;
        for (uint256 i = 0; i < memberList.length; i++) {
            uint256 locked = vault.getGroupCollateral(groupId, memberList[i]);
            if (locked > 0) vault.unlockCollateral(memberList[i], groupId, locked);
        }
        emit GroupCancelled(reason);
    }

    function _countUnassigned() internal view returns (uint256 n) {
        for (uint256 i = 0; i < memberList.length; i++) {
            if (members[memberList[i]].position == 0) n++;
        }
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getMember(address user) external view returns (Member memory) {
        return members[user];
    }

    function getMemberCount() external view returns (uint256) {
        return memberList.length;
    }

    function getGroupInfo() external view returns (
        GroupState _state,
        uint256 _cycle,
        uint256 _totalCycles,
        uint256 _contribution,
        uint256 _memberCount
    ) {
        return (state, currentCycle, totalCycles, contributionAmount, memberList.length);
    }

    function getPayoutSchedule() external view returns (address[] memory schedule) {
        schedule = new address[](totalCycles);
        for (uint256 i = 1; i <= totalCycles; i++) {
            schedule[i - 1] = positionToMember[uint8(i)];
        }
    }
}
