// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./AutoGroup.sol";

interface ICollateralVaultRole {
    function grantRole(bytes32 role, address account) external;
    function GROUP_ROLE() external view returns (bytes32);
}

/**
 * @title AutoGroupFactory
 * @notice 기여금 티어별 자동 계모임 방 생성 / 관리
 *
 * 티어 (HHUSD 기준):
 *   0: 10 HHUSD
 *   1: 20 HHUSD
 *   2: 50 HHUSD
 *   3: 100 HHUSD
 *   4: 200 HHUSD
 *
 * 동작 방식:
 *   1. 유저가 join(tierIndex) 호출
 *   2. 해당 티어의 활성 방이 없으면 자동 생성 (유저가 첫 번째 참가자)
 *   3. 활성 방이 28명으로 꽉 차면 다음 join 시 새 방 자동 생성
 *   4. 모든 방은 CollateralVault에 GROUP_ROLE이 자동 부여됨
 */
contract AutoGroupFactory is ReentrancyGuard, AccessControl {

    bytes32 public constant ADMIN_ROLE  = DEFAULT_ADMIN_ROLE;
    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");

    // ─── 티어 설정 ────────────────────────────────────────────────────────────

    uint256 public constant TIER_COUNT      = 5;
    uint256 public constant MAX_PER_GROUP   = 28;
    uint256 public constant MIN_TRIGGER     = 10;           // 카운트다운 트리거 인원
    uint256 public constant CYCLE_INTERVAL  = 7 days;       // 납입 기한 (변경 가능)
    uint256 public constant COLLATERAL_BP   = 14000;        // 140%

    uint256[TIER_COUNT] public TIER_AMOUNTS = [
        10  * 1e18,
        20  * 1e18,
        50  * 1e18,
        100 * 1e18,
        200 * 1e18
    ];

    // ─── 핵심 주소 ───────────────────────────────────────────────────────────

    address public immutable vault;
    address public immutable devWallet;
    address public immutable eventWallet;

    // ─── 상태 ────────────────────────────────────────────────────────────────

    uint256 public nextGroupId;

    // tierIndex => 현재 활성 방 주소 (ENROLLING 또는 POSITION_SELECTION)
    mapping(uint8 => address) public activeGroup;

    // tierIndex => 해당 티어의 모든 방 목록 (생성 순서)
    mapping(uint8 => address[]) public groupsByTier;

    // groupAddress => tierIndex
    mapping(address => uint8) public tierOfGroup;

    // ─── Events ──────────────────────────────────────────────────────────────

    event GroupCreated(
        uint8  indexed tierIndex,
        uint256 indexed groupId,
        address indexed groupAddress,
        uint256 contributionAmount
    );
    event UserJoined(
        uint8  indexed tierIndex,
        address indexed groupAddress,
        address indexed user,
        uint256 memberCount
    );
    event ActiveGroupAdvanced(
        uint8 indexed tierIndex,
        address oldGroup,
        address newGroup
    );

    // ─── Errors ──────────────────────────────────────────────────────────────

    error InvalidTier(uint8 tier);
    error AlreadyInGroup(address user, address group);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        address _vault,
        address _devWallet,
        address _eventWallet,
        address _admin
    ) {
        require(_vault       != address(0), "vault required");
        require(_devWallet   != address(0), "devWallet required");
        require(_eventWallet != address(0), "eventWallet required");
        require(_admin       != address(0), "admin required");

        vault        = _vault;
        devWallet    = _devWallet;
        eventWallet  = _eventWallet;
        nextGroupId  = 1;

        _grantRole(ADMIN_ROLE,  _admin);
        _grantRole(CONFIG_ROLE, _admin);
        _grantRole(CONFIG_ROLE, _devWallet);
    }

    // ─── 핵심: 참가 ──────────────────────────────────────────────────────────

    /**
     * @notice 티어 선택 후 참가
     * @dev HHUSD를 vault에 미리 approve 필요
     *      활성 방이 없거나 가득 찬 경우 새 방 자동 생성
     *
     * @param tierIndex 0~4 (10/20/50/100/200 HHUSD)
     */
    function join(uint8 tierIndex) external nonReentrant {
        if (tierIndex >= TIER_COUNT) revert InvalidTier(tierIndex);

        address current = activeGroup[tierIndex];

        // 활성 방 없거나 꽉 찼으면 새 방 생성
        if (current == address(0) || _isFull(current)) {
            current = _createGroup(tierIndex);
        }

        // 이미 해당 방에 있는지 확인
        if (AutoGroup(current).getMember(msg.sender).wallet == msg.sender) {
            revert AlreadyInGroup(msg.sender, current);
        }

        // Factory 이름으로 유저 참가 처리
        AutoGroup(current).joinFor(msg.sender);

        uint256 count = AutoGroup(current).getMemberCount();
        emit UserJoined(tierIndex, current, msg.sender, count);
    }

    /**
     * @notice 현재 티어별 활성 방 조회
     */
    function getActiveGroup(uint8 tierIndex) external view returns (address) {
        if (tierIndex >= TIER_COUNT) revert InvalidTier(tierIndex);
        return activeGroup[tierIndex];
    }

    /**
     * @notice 티어별 전체 방 목록
     */
    function getAllGroups(uint8 tierIndex) external view returns (address[] memory) {
        return groupsByTier[tierIndex];
    }

    /**
     * @notice 티어별 방 개수
     */
    function getGroupCount(uint8 tierIndex) external view returns (uint256) {
        return groupsByTier[tierIndex].length;
    }

    /**
     * @notice 현재 활성 방 상태 요약
     */
    function getActiveGroupInfo(uint8 tierIndex) external view returns (
        address groupAddr,
        uint256 memberCount,
        bool    countdownStarted,
        uint256 enrollmentDeadline,
        AutoGroup.GroupState state
    ) {
        groupAddr = activeGroup[tierIndex];
        if (groupAddr == address(0)) return (address(0), 0, false, 0, AutoGroup.GroupState.ENROLLING);

        AutoGroup g = AutoGroup(groupAddr);
        return (
            groupAddr,
            g.getMemberCount(),
            g.countdownStarted(),
            g.enrollmentDeadline(),
            g.state()
        );
    }

    /**
     * @notice 모든 티어 현황 한번에 조회
     */
    function getAllTierStatus() external view returns (
        address[TIER_COUNT] memory groups,
        uint256[TIER_COUNT] memory memberCounts,
        uint256[TIER_COUNT] memory totalGroupCounts
    ) {
        for (uint8 i = 0; i < TIER_COUNT; i++) {
            groups[i]           = activeGroup[i];
            totalGroupCounts[i] = groupsByTier[i].length;
            if (groups[i] != address(0)) {
                memberCounts[i] = AutoGroup(groups[i]).getMemberCount();
            }
        }
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _createGroup(uint8 tierIndex) internal returns (address groupAddr) {
        uint256 gId    = nextGroupId++;
        uint256 amount = TIER_AMOUNTS[tierIndex];

        AutoGroup newGroup = new AutoGroup(
            gId,
            amount,
            MAX_PER_GROUP,   // totalCycles = 28
            CYCLE_INTERVAL,
            COLLATERAL_BP,
            vault,
            devWallet,
            eventWallet
        );
        groupAddr = address(newGroup);

        // Vault에 GROUP_ROLE 부여
        ICollateralVaultRole(vault).grantRole(
            ICollateralVaultRole(vault).GROUP_ROLE(),
            groupAddr
        );

        activeGroup[tierIndex]          = groupAddr;
        tierOfGroup[groupAddr]          = tierIndex;
        groupsByTier[tierIndex].push(groupAddr);

        emit GroupCreated(tierIndex, gId, groupAddr, amount);

        // 이전 방이 있었다면 전환 이벤트
        if (groupsByTier[tierIndex].length > 1) {
            address prev = groupsByTier[tierIndex][groupsByTier[tierIndex].length - 2];
            emit ActiveGroupAdvanced(tierIndex, prev, groupAddr);
        }
    }

    function _isFull(address groupAddr) internal view returns (bool) {
        AutoGroup g = AutoGroup(groupAddr);
        // ENROLLING 상태가 아니면(=마감됨) 더 이상 참가 불가 → 새 방 필요
        if (g.state() != AutoGroup.GroupState.ENROLLING) return true;
        return g.getMemberCount() >= MAX_PER_GROUP;
    }

    // ─── 관리 ─────────────────────────────────────────────────────────────────

    /**
     * @notice 활성 방이 POSITION_SELECTION 등으로 넘어가 참가 불가 시 수동으로 새 방으로 전환
     */
    function advanceToNextGroup(uint8 tierIndex) external onlyRole(CONFIG_ROLE) {
        if (tierIndex >= TIER_COUNT) revert InvalidTier(tierIndex);
        address old = activeGroup[tierIndex];
        address newG = _createGroup(tierIndex);
        emit ActiveGroupAdvanced(tierIndex, old, newG);
    }
}
