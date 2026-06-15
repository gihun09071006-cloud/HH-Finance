// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IPublicGroupVRF {
    function groupId() external view returns (uint256);
    function contributionAmount() external view returns (uint256);
    function currentCycle() external view returns (uint256);
    function totalCycles() external view returns (uint256);

    enum GroupState { ENROLLING, PENDING_VRF, ACTIVE, COMPLETED, CANCELLED }
    function state() external view returns (GroupState);
}

/**
 * @title GroupRegistry
 * @notice 모든 그룹 컨트랙트의 등록/검증/조회 허브
 * @dev TreasuryV2의 IGroupRegistry 인터페이스를 구현
 */
contract GroupRegistry is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant UPGRADER_ROLE  = keccak256("UPGRADER_ROLE");

    // ─── Storage ─────────────────────────────────────────────────────────────

    struct GroupInfo {
        address contractAddress;
        uint256 contributionAmount;
        uint256 totalCycles;
        bool    registered;
    }

    mapping(uint256 => GroupInfo) private _groups;
    mapping(address => uint256)   public  contractToGroupId;

    uint256[] public allGroupIds;

    // ─── Events ──────────────────────────────────────────────────────────────

    event GroupRegistered(uint256 indexed groupId, address indexed contractAddress, uint256 contributionAmount, uint256 totalCycles);
    event GroupUnregistered(uint256 indexed groupId);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error GroupAlreadyRegistered(uint256 groupId);
    error GroupNotRegistered(uint256 groupId);
    error ZeroAddress();

    // ─── Init ─────────────────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address admin) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    // ─── Registration ────────────────────────────────────────────────────────

    /**
     * @notice 그룹 컨트랙트를 레지스트리에 등록 (Factory에서 호출)
     * @param groupId          그룹 고유 ID
     * @param contractAddress  그룹 컨트랙트 주소
     * @param contributionAmount 사이클당 기여금 (18 decimals)
     * @param totalCycles      총 사이클 수
     */
    function registerGroup(
        uint256 groupId,
        address contractAddress,
        uint256 contributionAmount,
        uint256 totalCycles
    ) external onlyRole(REGISTRAR_ROLE) {
        if (contractAddress == address(0)) revert ZeroAddress();
        if (_groups[groupId].registered) revert GroupAlreadyRegistered(groupId);

        _groups[groupId] = GroupInfo({
            contractAddress:    contractAddress,
            contributionAmount: contributionAmount,
            totalCycles:        totalCycles,
            registered:         true
        });
        contractToGroupId[contractAddress] = groupId;
        allGroupIds.push(groupId);

        emit GroupRegistered(groupId, contractAddress, contributionAmount, totalCycles);
    }

    /**
     * @notice 그룹 등록 해제 (긴급 시 관리자)
     */
    function unregisterGroup(uint256 groupId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_groups[groupId].registered) revert GroupNotRegistered(groupId);
        address ca = _groups[groupId].contractAddress;
        delete contractToGroupId[ca];
        delete _groups[groupId];
        emit GroupUnregistered(groupId);
    }

    // ─── IGroupRegistry 구현 (TreasuryV2가 호출) ─────────────────────────────

    /**
     * @notice 그룹이 활성 상태인지 확인
     * @dev ENROLLING / PENDING_VRF / ACTIVE 상태이고 등록된 경우 true
     */
    function isActiveGroup(uint256 groupId) external view returns (bool) {
        GroupInfo storage info = _groups[groupId];
        if (!info.registered) return false;

        IPublicGroupVRF.GroupState s = IPublicGroupVRF(info.contractAddress).state();
        return (
            s == IPublicGroupVRF.GroupState.ENROLLING ||
            s == IPublicGroupVRF.GroupState.PENDING_VRF ||
            s == IPublicGroupVRF.GroupState.ACTIVE
        );
    }

    /**
     * @notice 그룹의 사이클당 기여금 반환
     */
    function getContributionAmount(uint256 groupId) external view returns (uint256) {
        if (!_groups[groupId].registered) revert GroupNotRegistered(groupId);
        return _groups[groupId].contributionAmount;
    }

    /**
     * @notice 그룹의 현재 사이클 번호 반환
     */
    function getCurrentCycle(uint256 groupId) external view returns (uint256) {
        if (!_groups[groupId].registered) revert GroupNotRegistered(groupId);
        return IPublicGroupVRF(_groups[groupId].contractAddress).currentCycle();
    }

    // ─── View 함수 ────────────────────────────────────────────────────────────

    function getGroupInfo(uint256 groupId) external view returns (GroupInfo memory) {
        if (!_groups[groupId].registered) revert GroupNotRegistered(groupId);
        return _groups[groupId];
    }

    function getGroupContract(uint256 groupId) external view returns (address) {
        return _groups[groupId].contractAddress;
    }

    function isRegistered(uint256 groupId) external view returns (bool) {
        return _groups[groupId].registered;
    }

    function totalGroups() external view returns (uint256) {
        return allGroupIds.length;
    }

    // ─── UUPS ────────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
