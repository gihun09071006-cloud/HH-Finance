// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ICollateralVault {
    function lockCollateral(address user, uint256 groupId, uint256 amount) external;
    function unlockCollateral(address user, uint256 groupId, uint256 amount) external;
    function slashCollateral(address user, uint256 groupId, uint256 amount, address recipient) external;
    function getRequiredCollateral(uint256 contribution, uint256 cycles, uint256 ratioBP) external pure returns (uint256);
    function getGroupCollateral(uint256 groupId, address user) external view returns (uint256);
}

interface IHHUSD {
    function burn(address user, uint256 amount) external;
    function mint(address to, uint256 amount) external;
}

/**
 * @title CustomGroup
 * @notice 커스텀 계모임 방 — 계장(방장)이 파라미터를 직접 설정
 *
 * 커스터마이징 가능 항목:
 *   - 최대 인원: 2 ~ 29명
 *   - 총 사이클 수 (= 최대 인원수와 동일)
 *   - 사이클 간격 (납입 기한)
 *   - 사이클당 기여금 (계금)
 *
 * 순번 배치 방식:
 *   - 계장이 모집 마감 후 12시간 순번 선택 창 운영
 *   - 미선택자 → 입장 순서대로 남은 후순번 자동 배치
 *
 * 특권 (계장):
 *   - 조기 마감 가능 (최소 인원 충족 시)
 *   - 멤버 강퇴 (ENROLLING 단계에서만)
 *   - 그룹 취소
 */
contract CustomGroup is ReentrancyGuard {

    // ─── Enums ───────────────────────────────────────────────────────────────

    enum GroupState {
        ENROLLING,
        POSITION_SELECTION,
        ACTIVE,
        COMPLETED,
        CANCELLED
    }

    enum MemberStatus { ACTIVE, WARNED, PENALIZED, REMOVED }

    // ─── Structs ─────────────────────────────────────────────────────────────

    struct Member {
        address wallet;
        uint256 joinTime;
        uint256 joinOrder;
        uint8   position;
        MemberStatus status;
        uint16  missedPayments;
        bool    hasReceivedPayout;
    }

    // ─── Immutables ──────────────────────────────────────────────────────────

    uint256 public immutable groupId;
    uint256 public immutable contributionAmount;
    uint256 public immutable totalCycles;       // = maxMembers
    uint256 public immutable maxMembers;
    uint256 public immutable cycleIntervalSeconds;
    uint256 public immutable collateralRatioBP;
    uint256 public immutable interestBP;        // 이자율 (예: 500 = 5%)
    uint256 public immutable interestAmount;    // 사이클당 이자액

    ICollateralVault public immutable vault;
    IHHUSD           public immutable hhusd;
    address          public immutable organizer;   // 계장
    address          public immutable devWallet;
    address          public immutable eventWallet;
    address          public immutable factory_;    // CustomGroupFactory 주소

    uint256 public constant MIN_MEMBERS        = 2;
    uint256 public constant MAX_MEMBERS        = 29;
    uint256 public constant SELECTION_DURATION = 12 hours;

    uint256 public constant PENALTY_DEV_BP     = 3000;
    uint256 public constant PENALTY_EVENT_BP   = 7000;
    uint256 public constant SLASH_THRESHOLD_BP = 8000;

    // ─── Mutable State ───────────────────────────────────────────────────────

    GroupState public state;

    uint256 public enrollmentDeadline;
    uint256 public positionSelectionDeadline;
    uint256 public currentCycle;
    uint256 public cycleStartTime;

    address public keeper;

    address[]              public memberList;
    mapping(address => Member) public members;
    mapping(uint8 => address)  public positionToMember;

    // ─── Events ──────────────────────────────────────────────────────────────

    event MemberJoined(address indexed user, uint256 joinOrder, uint256 joinTime);
    event MemberKicked(address indexed user);
    event EnrollmentClosed(uint256 memberCount);
    event PositionSelectionStarted(uint256 deadline);
    event PositionSelected(address indexed user, uint8 position);
    event PositionAutoAssigned(address indexed user, uint8 position, uint256 joinOrder);
    event GroupStarted(uint256 startTime, uint256 memberCount);
    event ContributionMade(address indexed user, uint256 cycle, uint256 amount);
    event PayoutDistributed(address indexed recipient, uint256 cycle, uint256 amount);
    event PaymentWarned(address indexed user, uint256 cycle);
    event CollateralDeducted(address indexed user, uint256 cycle, uint256 amount);
    event MemberRemoved(address indexed user, uint256 cycle);
    event CollateralAtRisk(address indexed user, uint256 missed, uint256 total, uint256 remaining, string message);
    event CollateralToppedUp(address indexed user, uint256 added, uint256 newTotal);
    event PenaltyDistributed(address indexed user, uint256 devAmt, uint256 eventAmt);
    event CollateralRefundFailed(address indexed user, uint256 amount, string reason);
    event GroupCompleted();
    event GroupCancelled(string reason);
    event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotInState(GroupState required, GroupState current);
    error EnrollmentFull();
    error EnrollmentExpired();
    error AlreadyMember();
    error NotMember();
    error DeadlineNotReached();
    error PositionTaken(uint8 pos);
    error PositionOutOfRange(uint8 pos, uint256 max);
    error AlreadySelectedPosition();
    error Unauthorized();
    error NotOrganizer();
    error NotFactory();

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier inState(GroupState s) {
        if (state != s) revert NotInState(s, state);
        _;
    }

    modifier onlyOrganizer() {
        if (msg.sender != organizer) revert NotOrganizer();
        _;
    }

    modifier onlyKeeperOrDev() {
        if (msg.sender != keeper && msg.sender != devWallet) revert Unauthorized();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param _groupId            그룹 고유 ID
     * @param _contributionAmount 사이클당 기여금 (wei 단위)
     * @param _maxMembers         최대 인원 (2 ~ 29)
     * @param _cycleIntervalSecs  납입 기한 (초 단위, 예: 7일 = 604800)
     * @param _collateralRatioBP  담보 비율 (14000 = 140%)
     * @param _enrollmentDuration 모집 기간 (초 단위)
     * @param _vault              CollateralVault 주소
     * @param _organizer          계장 주소
     * @param _devWallet          개발자 지갑
     * @param _eventWallet        이벤트 지갑
     * @param _factory            CustomGroupFactory 주소 (address(0) = 팩토리 없이 직접 배포)
     */
    constructor(
        uint256 _groupId,
        uint256 _contributionAmount,
        uint256 _maxMembers,
        uint256 _cycleIntervalSecs,
        uint256 _collateralRatioBP,
        uint256 _interestBP,
        uint256 _enrollmentDuration,
        address _vault,
        address _hhusd,
        address _organizer,
        address _devWallet,
        address _eventWallet,
        address _factory
    ) {
        require(_vault       != address(0), "vault required");
        require(_hhusd       != address(0), "hhusd required");
        require(_organizer   != address(0), "organizer required");
        require(_devWallet   != address(0), "devWallet required");
        require(_eventWallet != address(0), "eventWallet required");
        require(_maxMembers >= MIN_MEMBERS && _maxMembers <= MAX_MEMBERS,
                "maxMembers: 2~29");
        require(_contributionAmount > 0, "contributionAmount required");
        require(_cycleIntervalSecs > 0, "cycleInterval required");
        require(_enrollmentDuration > 0, "enrollmentDuration required");

        groupId              = _groupId;
        contributionAmount   = _contributionAmount;
        maxMembers           = _maxMembers;
        totalCycles          = _maxMembers;
        cycleIntervalSeconds = _cycleIntervalSecs;
        collateralRatioBP    = _collateralRatioBP;
        interestBP           = _interestBP;
        interestAmount       = _contributionAmount * _interestBP / 10000;
        vault                = ICollateralVault(_vault);
        hhusd                = IHHUSD(_hhusd);
        organizer            = _organizer;
        devWallet            = _devWallet;
        eventWallet          = _eventWallet;
        factory_             = _factory;
        keeper               = _devWallet;

        state = GroupState.ENROLLING;
        enrollmentDeadline = block.timestamp + _enrollmentDuration;
    }

    // ─── Keeper 관리 ─────────────────────────────────────────────────────────

    function setKeeper(address newKeeper) external {
        if (msg.sender != devWallet && msg.sender != organizer) revert Unauthorized();
        emit KeeperUpdated(keeper, newKeeper);
        keeper = newKeeper;
    }

    // ─── Phase 1: 모집 ───────────────────────────────────────────────────────

    function joinGroup() external nonReentrant inState(GroupState.ENROLLING) {
        if (memberList.length >= maxMembers) revert EnrollmentFull();
        if (block.timestamp > enrollmentDeadline) revert EnrollmentExpired();
        if (members[msg.sender].wallet != address(0)) revert AlreadyMember();

        uint256 required = vault.getRequiredCollateral(
            contributionAmount, totalCycles, collateralRatioBP
        );
        vault.lockCollateral(msg.sender, groupId, required);

        uint256 order = memberList.length + 1;
        members[msg.sender] = Member({
            wallet:             msg.sender,
            joinTime:           block.timestamp,
            joinOrder:          order,
            position:           0,
            status:             MemberStatus.ACTIVE,
            missedPayments:     0,
            hasReceivedPayout:  false
        });
        memberList.push(msg.sender);

        emit MemberJoined(msg.sender, order, block.timestamp);
    }

    /**
     * @notice Factory 전용 — 팩토리가 유저 대신 참가 처리
     */
    function joinFor(address user) external nonReentrant inState(GroupState.ENROLLING) {
        if (factory_ == address(0) || msg.sender != factory_) revert NotFactory();
        if (memberList.length >= maxMembers) revert EnrollmentFull();
        if (block.timestamp > enrollmentDeadline) revert EnrollmentExpired();
        if (members[user].wallet != address(0)) revert AlreadyMember();

        uint256 required = vault.getRequiredCollateral(
            contributionAmount, totalCycles, collateralRatioBP
        );
        vault.lockCollateral(user, groupId, required);

        uint256 order = memberList.length + 1;
        members[user] = Member({
            wallet:             user,
            joinTime:           block.timestamp,
            joinOrder:          order,
            position:           0,
            status:             MemberStatus.ACTIVE,
            missedPayments:     0,
            hasReceivedPayout:  false
        });
        memberList.push(user);

        emit MemberJoined(user, order, block.timestamp);
    }

    /**
     * @notice 계장 전용 — ENROLLING 단계에서 멤버 강퇴 (담보 환불)
     */
    function kickMember(address user) external onlyOrganizer inState(GroupState.ENROLLING) {
        Member storage m = members[user];
        if (m.wallet == address(0)) revert NotMember();

        uint256 locked = vault.getGroupCollateral(groupId, user);
        if (locked > 0) vault.unlockCollateral(user, groupId, locked);

        // memberList에서 제거 (순서 유지)
        uint256 len = memberList.length;
        for (uint256 i = 0; i < len; i++) {
            if (memberList[i] == user) {
                memberList[i] = memberList[len - 1];
                memberList.pop();
                break;
            }
        }
        // joinOrder 재계산
        for (uint256 i = 0; i < memberList.length; i++) {
            members[memberList[i]].joinOrder = i + 1;
        }

        delete members[user];
        emit MemberKicked(user);
    }

    /**
     * @notice 모집 마감 → 순번 선택 창 시작
     * @dev 계장 조기 마감 또는 마감 기한 도래 시 호출
     */
    function closeEnrollment() external inState(GroupState.ENROLLING) {
        bool isOrganizer    = msg.sender == organizer;
        bool deadlinePassed = block.timestamp > enrollmentDeadline;
        bool fullGroup      = memberList.length >= maxMembers;

        require(isOrganizer || deadlinePassed || fullGroup, "Cannot close yet");

        if (memberList.length < MIN_MEMBERS) {
            _cancelGroup("Insufficient members");
            return;
        }

        state = GroupState.POSITION_SELECTION;
        positionSelectionDeadline = block.timestamp + SELECTION_DURATION;

        emit EnrollmentClosed(memberList.length);
        emit PositionSelectionStarted(positionSelectionDeadline);
    }

    /**
     * @notice 계장 전용 — 그룹 취소 (담보 전액 환불)
     */
    function cancelGroup(string calldata reason) external onlyOrganizer {
        require(
            state == GroupState.ENROLLING || state == GroupState.POSITION_SELECTION,
            "Cannot cancel after start"
        );
        _cancelGroup(reason);
    }

    // ─── Phase 2: 순번 선택 ──────────────────────────────────────────────────

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

    // ─── Phase 3: 순번 확정 ──────────────────────────────────────────────────

    function finalizePositions() external inState(GroupState.POSITION_SELECTION) {
        if (block.timestamp <= positionSelectionDeadline) revert DeadlineNotReached();
        _assignUnselectedByJoinOrder();
        _startGroup();
    }

    // ─── Phase 4: 계 진행 ────────────────────────────────────────────────────

    function contribute() external nonReentrant inState(GroupState.ACTIVE) {
        Member storage m = members[msg.sender];
        if (m.wallet == address(0) || m.status == MemberStatus.REMOVED) revert NotMember();
        uint256 amount = m.hasReceivedPayout
            ? contributionAmount + interestAmount
            : contributionAmount;
        hhusd.burn(msg.sender, amount);
        emit ContributionMade(msg.sender, currentCycle, amount);
    }

    function distributePayout() external nonReentrant inState(GroupState.ACTIVE) {
        require(block.timestamp >= cycleStartTime + cycleIntervalSeconds, "Cycle not ended");
        require(currentCycle <= type(uint8).max, "Cycle overflow");

        address recipient = positionToMember[uint8(currentCycle)];
        require(recipient != address(0), "No recipient for cycle");

        // 수령액 = N × C + (currentCycle - 1) × I
        uint256 payout = contributionAmount * memberList.length
            + (currentCycle - 1) * interestAmount;
        members[recipient].hasReceivedPayout = true;
        hhusd.mint(recipient, payout);
        emit PayoutDistributed(recipient, currentCycle, payout);

        if (currentCycle == totalCycles) {
            _completeGroup();
        } else {
            currentCycle++;
            cycleStartTime = block.timestamp;
        }
    }

    function warningMissedPayment(address user)
        external
        onlyKeeperOrDev
        inState(GroupState.ACTIVE)
    {
        Member storage m = members[user];
        if (m.wallet == address(0) || m.status == MemberStatus.REMOVED) revert NotMember();

        address cycleRecipient = positionToMember[uint8(currentCycle)];
        uint256 available = vault.getGroupCollateral(groupId, user);
        uint256 dueAmount = m.hasReceivedPayout
            ? contributionAmount + interestAmount
            : contributionAmount;

        if (available >= dueAmount) {
            vault.slashCollateral(user, groupId, dueAmount, cycleRecipient);
            m.missedPayments++;
            m.status = m.missedPayments == 1 ? MemberStatus.WARNED : MemberStatus.PENALIZED;
            if (m.missedPayments == 1) emit PaymentWarned(user, currentCycle);
            emit CollateralDeducted(user, currentCycle, dueAmount);

            uint256 remaining = vault.getGroupCollateral(groupId, user);
            if (uint256(m.missedPayments) * 10000 >= totalCycles * SLASH_THRESHOLD_BP) {
                emit CollateralAtRisk(
                    user, m.missedPayments, totalCycles, remaining,
                    unicode"경고: 총 사이클의 80% 이상 미납되었습니다."
                );
            }
        } else {
            if (available > 0) vault.slashCollateral(user, groupId, available, cycleRecipient);
            m.missedPayments++;
            m.status = MemberStatus.REMOVED;
            emit MemberRemoved(user, currentCycle);
        }
    }

    function topUpCollateral(uint256 amount) external nonReentrant inState(GroupState.ACTIVE) {
        Member storage m = members[msg.sender];
        if (m.wallet == address(0) || m.status == MemberStatus.REMOVED) revert NotMember();
        require(amount > 0, "Amount must be > 0");
        vault.lockCollateral(msg.sender, groupId, amount);
        uint256 newTotal = vault.getGroupCollateral(groupId, msg.sender);
        emit CollateralToppedUp(msg.sender, amount, newTotal);
    }

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

    // ─── Internal ────────────────────────────────────────────────────────────

    function _assignUnselectedByJoinOrder() internal {
        uint256 count = memberList.length;

        uint8[] memory openPos = new uint8[](count);
        uint256 openCount;
        for (uint8 i = 1; i <= count; i++) {
            if (positionToMember[i] == address(0)) openPos[openCount++] = i;
        }

        uint256 assignIdx;
        for (uint256 i = 0; i < count && assignIdx < openCount; i++) {
            address addr = memberList[i];
            Member storage m = members[addr];
            if (m.position == 0) {
                uint8 pos = openPos[assignIdx++];
                m.position = pos;
                positionToMember[pos] = addr;
                emit PositionAutoAssigned(addr, pos, m.joinOrder);
            }
        }
    }

    function _startGroup() internal {
        state          = GroupState.ACTIVE;
        currentCycle   = 1;
        cycleStartTime = block.timestamp;
        emit GroupStarted(block.timestamp, memberList.length);
    }

    function _completeGroup() internal {
        state = GroupState.COMPLETED;
        for (uint256 i = 0; i < memberList.length; i++) {
            address m = memberList[i];
            uint256 locked = vault.getGroupCollateral(groupId, m);
            if (locked == 0) continue;
            if (members[m].missedPayments == 0) {
                try vault.unlockCollateral(m, groupId, locked) {}
                catch Error(string memory reason) { emit CollateralRefundFailed(m, locked, reason); }
                catch { emit CollateralRefundFailed(m, locked, "unknown"); }
            } else {
                _distributePenalty(m, locked);
            }
        }
        emit GroupCompleted();
    }

    function _distributePenalty(address user, uint256 amount) internal {
        if (amount == 0) return;
        uint256 devAmt   = (amount * PENALTY_DEV_BP) / 10000;
        uint256 eventAmt = amount - devAmt;
        if (devAmt   > 0) vault.slashCollateral(user, groupId, devAmt,   devWallet);
        if (eventAmt > 0) vault.slashCollateral(user, groupId, eventAmt, eventWallet);
        emit PenaltyDistributed(user, devAmt, eventAmt);
    }

    function _cancelGroup(string memory reason) internal {
        state = GroupState.CANCELLED;
        for (uint256 i = 0; i < memberList.length; i++) {
            uint256 locked = vault.getGroupCollateral(groupId, memberList[i]);
            if (locked > 0) vault.unlockCollateral(memberList[i], groupId, locked);
        }
        emit GroupCancelled(reason);
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
        uint256 _maxMembers,
        uint256 _memberCount,
        uint256 _enrollmentDeadline,
        address _organizer
    ) {
        return (
            state, currentCycle, totalCycles, contributionAmount,
            maxMembers, memberList.length, enrollmentDeadline, organizer
        );
    }

    function getPayoutSchedule() external view returns (address[] memory schedule) {
        schedule = new address[](totalCycles);
        for (uint256 i = 1; i <= totalCycles; i++) {
            schedule[i - 1] = positionToMember[uint8(i)];
        }
    }

    function getAvailablePositions() external view returns (uint8[] memory) {
        uint256 count = memberList.length;
        uint8[] memory tmp = new uint8[](count);
        uint256 n;
        for (uint8 i = 1; i <= count; i++) {
            if (positionToMember[i] == address(0)) tmp[n++] = i;
        }
        uint8[] memory result = new uint8[](n);
        for (uint256 i = 0; i < n; i++) result[i] = tmp[i];
        return result;
    }
}
