// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./CustomGroup.sol";

interface ICollateralVaultRole {
    function grantRole(bytes32 role, address account) external;
    function GROUP_ROLE() external view returns (bytes32);
}

interface IHHUSDRoles {
    function grantRole(bytes32 role, address account) external;
    function MINTER_ROLE() external view returns (bytes32);
    function BURNER_ROLE() external view returns (bytes32);
}

/**
 * @title CustomGroupFactory
 * @notice 커스텀 계모임 방 생성 / 관리
 *
 * 계장이 파라미터를 직접 설정하여 방을 생성:
 *   - 기여금, 최대 인원(2~29), 납입 기한, 모집 기간 자유 설정
 *   - 담보 비율 고정 140%
 *   - 방 생성 시 계장이 첫 번째 멤버로 자동 참가 (담보 선 디파짓 → 장난 방지)
 *
 * 유저는 getAllGroups() / getOpenGroups()로 방을 탐색하여 joinGroup(groupAddr) 호출
 */
contract CustomGroupFactory is ReentrancyGuard, AccessControl {

    bytes32 public constant ADMIN_ROLE  = DEFAULT_ADMIN_ROLE;
    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");

    // ─── 고정 설정 ───────────────────────────────────────────────────────────

    uint256 public constant COLLATERAL_BP = 14000;  // 140% 고정
    uint256 public constant INTEREST_BP   = 500;    // 5% 이자율

    // ─── 핵심 주소 ───────────────────────────────────────────────────────────

    address public immutable vault;
    address public immutable hhusd;
    address public immutable devWallet;
    address public immutable eventWallet;

    // ─── 상태 ────────────────────────────────────────────────────────────────

    uint256 public nextGroupId;

    address[] public allGroups;

    // groupAddress => true (존재 여부)
    mapping(address => bool) public isKnownGroup;

    // ─── Structs ─────────────────────────────────────────────────────────────

    struct GroupInfo {
        address groupAddr;
        address organizer;
        uint256 contributionAmount;
        uint256 maxMembers;
        uint256 memberCount;
        uint256 enrollmentDeadline;
        CustomGroup.GroupState state;
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    event GroupCreated(
        uint256 indexed groupId,
        address indexed groupAddress,
        address indexed organizer,
        uint256 contributionAmount,
        uint256 maxMembers
    );
    event UserJoined(
        address indexed groupAddress,
        address indexed user,
        uint256 memberCount
    );

    // ─── Errors ──────────────────────────────────────────────────────────────

    error UnknownGroup(address group);
    error AlreadyInGroup(address user, address group);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        address _vault,
        address _hhusd,
        address _devWallet,
        address _eventWallet,
        address _admin
    ) {
        require(_vault       != address(0), "vault required");
        require(_hhusd       != address(0), "hhusd required");
        require(_devWallet   != address(0), "devWallet required");
        require(_eventWallet != address(0), "eventWallet required");
        require(_admin       != address(0), "admin required");

        vault        = _vault;
        hhusd        = _hhusd;
        devWallet    = _devWallet;
        eventWallet  = _eventWallet;
        nextGroupId  = 1;

        _grantRole(ADMIN_ROLE,  _admin);
        _grantRole(CONFIG_ROLE, _admin);
        _grantRole(CONFIG_ROLE, _devWallet);
    }

    // ─── 방 생성 ─────────────────────────────────────────────────────────────

    /**
     * @notice 계장이 커스텀 방 생성 → 첫 번째 멤버로 자동 참가 (담보 선 디파짓)
     *
     * @param contributionAmount  사이클당 기여금 (wei 단위)
     * @param maxMembers          최대 인원 (2 ~ 29)
     * @param cycleIntervalSecs   납입 기한 (초 단위, 예: 7일 = 604800)
     * @param enrollmentDuration  모집 기간 (초 단위, 예: 48시간 = 172800)
     * @return groupAddr          생성된 그룹 주소
     */
    function createGroup(
        uint256 contributionAmount,
        uint256 maxMembers,
        uint256 cycleIntervalSecs,
        uint256 enrollmentDuration
    ) external nonReentrant returns (address groupAddr) {
        require(contributionAmount > 0,    "contributionAmount required");
        require(maxMembers >= 2 && maxMembers <= 29, "maxMembers: 2~29");
        require(cycleIntervalSecs > 0,     "cycleInterval required");
        require(enrollmentDuration > 0,    "enrollmentDuration required");

        uint256 gId = nextGroupId++;

        CustomGroup newGroup = new CustomGroup(
            gId,
            contributionAmount,
            maxMembers,
            cycleIntervalSecs,
            COLLATERAL_BP,
            INTEREST_BP,
            enrollmentDuration,
            vault,
            hhusd,
            msg.sender,   // organizer = 계장
            devWallet,
            eventWallet,
            address(this) // factory
        );
        groupAddr = address(newGroup);

        // Vault에 GROUP_ROLE 부여
        ICollateralVaultRole(vault).grantRole(
            ICollateralVaultRole(vault).GROUP_ROLE(),
            groupAddr
        );
        // HHUSD에 MINTER_ROLE + BURNER_ROLE 부여
        IHHUSDRoles(hhusd).grantRole(IHHUSDRoles(hhusd).MINTER_ROLE(), groupAddr);
        IHHUSDRoles(hhusd).grantRole(IHHUSDRoles(hhusd).BURNER_ROLE(), groupAddr);

        allGroups.push(groupAddr);
        isKnownGroup[groupAddr] = true;

        emit GroupCreated(gId, groupAddr, msg.sender, contributionAmount, maxMembers);

        // 계장 첫 번째 멤버 자동 참가 (담보 선 디파짓)
        newGroup.joinFor(msg.sender);
        emit UserJoined(groupAddr, msg.sender, 1);
    }

    // ─── 참가 ────────────────────────────────────────────────────────────────

    /**
     * @notice 유저가 기존 방에 참가
     * @dev HHUSD를 vault에 미리 approve 필요
     *
     * @param groupAddr 참가할 그룹 주소
     */
    function joinGroup(address groupAddr) external nonReentrant {
        if (!isKnownGroup[groupAddr]) revert UnknownGroup(groupAddr);

        CustomGroup g = CustomGroup(groupAddr);

        if (g.getMember(msg.sender).wallet == msg.sender) {
            revert AlreadyInGroup(msg.sender, groupAddr);
        }

        g.joinFor(msg.sender);

        uint256 count = g.getMemberCount();
        emit UserJoined(groupAddr, msg.sender, count);
    }

    // ─── 조회 ────────────────────────────────────────────────────────────────

    /**
     * @notice 전체 방 목록 (생성 순서)
     */
    function getAllGroups() external view returns (address[] memory) {
        return allGroups;
    }

    /**
     * @notice ENROLLING 상태인 방만 반환
     */
    function getOpenGroups() external view returns (address[] memory) {
        uint256 total = allGroups.length;
        address[] memory buf = new address[](total);
        uint256 cnt;
        for (uint256 i = 0; i < total; i++) {
            if (CustomGroup(allGroups[i]).state() == CustomGroup.GroupState.ENROLLING) {
                buf[cnt++] = allGroups[i];
            }
        }
        assembly { mstore(buf, cnt) }
        return buf;
    }

    /**
     * @notice 전체 방 상세 정보 배열 반환
     */
    function getAllGroupInfos() external view returns (GroupInfo[] memory infos) {
        uint256 total = allGroups.length;
        infos = new GroupInfo[](total);
        for (uint256 i = 0; i < total; i++) {
            address addr = allGroups[i];
            CustomGroup g = CustomGroup(addr);
            infos[i] = GroupInfo({
                groupAddr:          addr,
                organizer:          g.organizer(),
                contributionAmount: g.contributionAmount(),
                maxMembers:         g.maxMembers(),
                memberCount:        g.getMemberCount(),
                enrollmentDeadline: g.enrollmentDeadline(),
                state:              g.state()
            });
        }
    }

    /**
     * @notice 특정 방 상세 정보
     */
    function getGroupInfo(address groupAddr) external view returns (GroupInfo memory) {
        if (!isKnownGroup[groupAddr]) revert UnknownGroup(groupAddr);
        CustomGroup g = CustomGroup(groupAddr);
        return GroupInfo({
            groupAddr:          groupAddr,
            organizer:          g.organizer(),
            contributionAmount: g.contributionAmount(),
            maxMembers:         g.maxMembers(),
            memberCount:        g.getMemberCount(),
            enrollmentDeadline: g.enrollmentDeadline(),
            state:              g.state()
        });
    }

    /**
     * @notice 전체 방 수
     */
    function getGroupCount() external view returns (uint256) {
        return allGroups.length;
    }
}
