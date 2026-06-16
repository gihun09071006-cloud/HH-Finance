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

/**
 * @title AutoGroup
 * @notice 자동화 계모임 방
 *
 * 핵심 규칙:
 *   - 인원: 최소 10명 ~ 최대 28명
 *   - 10번째 멤버 입장 시 카운트다운(24시간) 자동 시작
 *   - 카운트다운 중에도 입장 가능 (최대 28명까지)
 *   - 카운트다운 종료 후 12시간: 순번 선택 창
 *     · 입장 순서(joinOrder)대로 선택 우선권 부여 (1등이 가장 먼저)
 *   - 선택 창 종료 후: 미선택자 → 입장 순서대로 남은 후순번 자동 배치
 *   - VRF 없음 — 순번 배치는 완전 결정론적(입장 순서 기반)
 *
 * 미납 처리:
 *   - 담보에서 contributionAmount 차감 → 현재 사이클 수령인에게 이전
 *   - 총 사이클의 80% 이상 미납 시 CollateralAtRisk 경고
 *   - 그룹 완료 시 미납 이력 유저 잔여담보 30% dev / 70% event 분배
 */
contract AutoGroup is ReentrancyGuard {

    // ─── Enums ───────────────────────────────────────────────────────────────

    enum GroupState {
        ENROLLING,           // 모집 중 (카운트다운 포함)
        POSITION_SELECTION,  // 순번 선택 창 (12시간)
        ACTIVE,              // 계 진행 중
        COMPLETED,
        CANCELLED
    }

    enum MemberStatus { ACTIVE, WARNED, PENALIZED, REMOVED }

    // ─── Structs ─────────────────────────────────────────────────────────────

    struct Member {
        address wallet;
        uint256 joinTime;
        uint256 joinOrder;   // 1-based 입장 순서
        uint8   position;    // 1-based 수령 순번 (0 = 미선택)
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

    ICollateralVault public immutable vault;
    address          public immutable devWallet;
    address          public immutable eventWallet;

    uint256 public constant MIN_MEMBERS         = 10;
    uint256 public constant MAX_MEMBERS         = 28;
    uint256 public constant COUNTDOWN_DURATION  = 24 hours;  // 10명 달성 후 카운트다운
    uint256 public constant SELECTION_DURATION  = 12 hours;  // 순번 선택 창

    uint256 public constant PENALTY_DEV_BP      = 3000;  // 30%
    uint256 public constant PENALTY_EVENT_BP    = 7000;  // 70%
    uint256 public constant SLASH_THRESHOLD_BP  = 8000;  // 80%
    uint256 public constant MAX_VRF_RETRIES     = 3;

    // ─── Mutable State ───────────────────────────────────────────────────────

    GroupState public state;

    bool    public countdownStarted;
    uint256 public enrollmentDeadline;       // 카운트다운 종료 시각
    uint256 public positionSelectionDeadline;
    uint256 public currentCycle;
    uint256 public cycleStartTime;

    address public keeper;  // warningMissedPayment 호출 권한

    address[]              public memberList;   // 입장 순서 배열
    mapping(address => Member) public members;
    mapping(uint8 => address)  public positionToMember;  // position → wallet

    // ─── Events ──────────────────────────────────────────────────────────────

    event MemberJoined(address indexed user, uint256 joinOrder, uint256 joinTime);
    event CountdownStarted(uint256 deadline);
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
    error EnrollmentClosed_();
    error AlreadyMember();
    error NotMember();
    error DeadlineNotReached();
    error PositionTaken(uint8 pos);
    error PositionOutOfRange(uint8 pos, uint256 max);
    error AlreadySelectedPosition();
    error Unauthorized();

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier inState(GroupState s) {
        if (state != s) revert NotInState(s, state);
        _;
    }

    modifier onlyKeeperOrDev() {
        if (msg.sender != keeper && msg.sender != devWallet) revert Unauthorized();
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
        address _devWallet,
        address _eventWallet
    ) {
        require(_vault       != address(0), "vault required");
        require(_devWallet   != address(0), "devWallet required");
        require(_eventWallet != address(0), "eventWallet required");
        require(_totalCycles >= 2 && _totalCycles <= MAX_MEMBERS,
                "totalCycles: 2~28");

        groupId              = _groupId;
        contributionAmount   = _contributionAmount;
        totalCycles          = _totalCycles;
        cycleIntervalSeconds = _cycleIntervalSeconds;
        collateralRatioBP    = _collateralRatioBP;
        vault                = ICollateralVault(_vault);
        devWallet            = _devWallet;
        eventWallet          = _eventWallet;
        keeper               = _devWallet;

        state = GroupState.ENROLLING;
    }

    // ─── Keeper 관리 ─────────────────────────────────────────────────────────

    function setKeeper(address newKeeper) external {
        if (msg.sender != devWallet) revert Unauthorized();
        emit KeeperUpdated(keeper, newKeeper);
        keeper = newKeeper;
    }

    // ─── Phase 1: 모집 (Enrollment) ──────────────────────────────────────────

    /**
     * @notice 그룹 참가
     * @dev 카운트다운 중에도 최대 28명까지 입장 가능
     *      담보(HHUSD) 사전 approve 필요
     */
    function joinGroup() external nonReentrant inState(GroupState.ENROLLING) {
        if (memberList.length >= totalCycles) revert EnrollmentFull();
        if (members[msg.sender].wallet != address(0)) revert AlreadyMember();

        // 카운트다운이 시작된 경우 deadline 확인
        if (countdownStarted && block.timestamp > enrollmentDeadline) {
            revert EnrollmentClosed_();
        }

        uint256 required = vault.getRequiredCollateral(
            contributionAmount, totalCycles, collateralRatioBP
        );
        vault.lockCollateral(msg.sender, groupId, required);

        uint256 order = memberList.length + 1;  // 1-based
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

        // 10번째 멤버 입장 시 카운트다운 자동 시작
        if (!countdownStarted && memberList.length == MIN_MEMBERS) {
            countdownStarted   = true;
            enrollmentDeadline = block.timestamp + COUNTDOWN_DURATION;
            emit CountdownStarted(enrollmentDeadline);
        }
    }

    /**
     * @notice 모집 마감 → 순번 선택 창 시작
     * @dev 카운트다운 종료 OR 최대 인원(28명) 도달 시 호출 가능
     */
    function closeEnrollment() external inState(GroupState.ENROLLING) {
        bool deadlinePassed = countdownStarted && block.timestamp > enrollmentDeadline;
        bool fullGroup      = memberList.length >= totalCycles;
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

    // ─── Phase 2: 순번 선택 (Position Selection, 12시간) ─────────────────────

    /**
     * @notice 원하는 순번 선택
     * @dev 선착순. 입장 순서 빠른 멤버가 먼저 호출하면 먼저 선택.
     *      중복 선택 불가.
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

    // ─── Phase 3: 순번 확정 → 그룹 시작 ─────────────────────────────────────

    /**
     * @notice 선택 창 종료 후 미선택자를 입장 순서대로 후순번 배치
     * @dev VRF 없음 — 완전 결정론적 (입장 순서 기반)
     *      미선택자는 남은 순번 중 가장 낮은 번호부터 입장 순서대로 배정
     */
    function finalizePositions() external inState(GroupState.POSITION_SELECTION) {
        if (block.timestamp <= positionSelectionDeadline) revert DeadlineNotReached();

        _assignUnselectedByJoinOrder();
        _startGroup();
    }

    // ─── Phase 4: 계 진행 (Active) ───────────────────────────────────────────

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
        require(currentCycle <= type(uint8).max, "Cycle overflow");

        address recipient = positionToMember[uint8(currentCycle)];
        require(recipient != address(0), "No recipient for cycle");

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
     * @notice 미납 처리 (keeper 또는 devWallet만 호출 가능)
     */
    function warningMissedPayment(address user)
        external
        onlyKeeperOrDev
        inState(GroupState.ACTIVE)
    {
        Member storage m = members[user];
        if (m.wallet == address(0) || m.status == MemberStatus.REMOVED) revert NotMember();

        address cycleRecipient = positionToMember[uint8(currentCycle)];
        uint256 available = vault.getGroupCollateral(groupId, user);

        if (available >= contributionAmount) {
            vault.slashCollateral(user, groupId, contributionAmount, cycleRecipient);
            m.missedPayments++;

            if (m.missedPayments == 1) {
                m.status = MemberStatus.WARNED;
                emit PaymentWarned(user, currentCycle);
            } else {
                m.status = MemberStatus.PENALIZED;
            }
            emit CollateralDeducted(user, currentCycle, contributionAmount);

            uint256 remaining = vault.getGroupCollateral(groupId, user);
            if (uint256(m.missedPayments) * 10000 >= totalCycles * SLASH_THRESHOLD_BP) {
                emit CollateralAtRisk(
                    user, m.missedPayments, totalCycles, remaining,
                    unicode"경고: 총 사이클의 80% 이상 미납되었습니다. 담보를 충전하지 않으면 그룹 완료 시 잔여 담보를 몰수당할 수 있습니다."
                );
            }
        } else {
            if (available > 0) vault.slashCollateral(user, groupId, available, cycleRecipient);
            m.missedPayments++;
            m.status = MemberStatus.REMOVED;
            emit MemberRemoved(user, currentCycle);
        }
    }

    /**
     * @notice 담보 추가 충전
     */
    function topUpCollateral(uint256 amount) external nonReentrant inState(GroupState.ACTIVE) {
        Member storage m = members[msg.sender];
        if (m.wallet == address(0) || m.status == MemberStatus.REMOVED) revert NotMember();
        require(amount > 0, "Amount must be > 0");

        vault.lockCollateral(msg.sender, groupId, amount);
        uint256 newTotal = vault.getGroupCollateral(groupId, msg.sender);
        emit CollateralToppedUp(msg.sender, amount, newTotal);
    }

    /**
     * @notice 80% 이상 미납자 즉시 패널티 처리 (devWallet 전용)
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

    // ─── Internal ────────────────────────────────────────────────────────────

    /**
     * @notice 미선택자를 입장 순서대로 남은 후순번에 배치
     * @dev memberList는 이미 입장 순서 배열
     *      남은 포지션 중 가장 낮은 번호부터 순서대로 배정
     */
    function _assignUnselectedByJoinOrder() internal {
        uint256 count = memberList.length;

        // 남은 포지션 수집 (오름차순)
        uint8[] memory openPos = new uint8[](count);
        uint256 openCount;
        for (uint8 i = 1; i <= count; i++) {
            if (positionToMember[i] == address(0)) {
                openPos[openCount++] = i;
            }
        }

        // 입장 순서대로 순회하며 미선택자에게 순서대로 배정
        uint256 assignIdx;
        for (uint256 i = 0; i < count && assignIdx < openCount; i++) {
            address addr = memberList[i];  // memberList는 입장 순서 배열
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
                catch Error(string memory reason) {
                    emit CollateralRefundFailed(m, locked, reason);
                } catch {
                    emit CollateralRefundFailed(m, locked, "unknown");
                }
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
        uint256 _memberCount,
        bool    _countdownStarted,
        uint256 _enrollmentDeadline
    ) {
        return (
            state, currentCycle, totalCycles, contributionAmount,
            memberList.length, countdownStarted, enrollmentDeadline
        );
    }

    function getPayoutSchedule() external view returns (address[] memory schedule) {
        schedule = new address[](totalCycles);
        for (uint256 i = 1; i <= totalCycles; i++) {
            schedule[i - 1] = positionToMember[uint8(i)];
        }
    }

    /**
     * @notice 현재 남은 선택 가능한 순번 목록
     */
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
