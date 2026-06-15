// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IHHUSD {
    function burn(address user, uint256 amount) external;
    function balanceOf(address user) external view returns (uint256);
}

/**
 * @title CollateralVault
 * @notice Stores and manages user collateral (in HHUSD) for group participation
 * @dev Only approved group contracts can lock/unlock/slash collateral
 */
contract CollateralVault is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    // ─── Roles ───────────────────────────────────────────────────────────────
    bytes32 public constant GROUP_ROLE    = keccak256("GROUP_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ─── State ───────────────────────────────────────────────────────────────
    IHHUSD public hhusdToken;

    // user => total locked collateral
    mapping(address => uint256) public lockedCollateral;

    // groupId => user => collateral locked for that specific group
    mapping(uint256 => mapping(address => uint256)) public groupCollateral;

    // groupId => total collateral locked
    mapping(uint256 => uint256) public groupTotalCollateral;

    // ─── Events ──────────────────────────────────────────────────────────────
    event CollateralLocked(
        address indexed user,
        uint256 indexed groupId,
        uint256 amount
    );
    event CollateralUnlocked(
        address indexed user,
        uint256 indexed groupId,
        uint256 amount
    );
    event CollateralSlashed(
        address indexed user,
        uint256 indexed groupId,
        uint256 amount,
        address indexed recipient
    );

    // ─── Errors ──────────────────────────────────────────────────────────────
    error InsufficientHHUSD(uint256 balance, uint256 required);
    error InsufficientLockedCollateral(uint256 locked, uint256 requested);
    error ZeroAmount();

    // ─── Initializer ─────────────────────────────────────────────────────────
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address _hhusdToken) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);

        hhusdToken = IHHUSD(_hhusdToken);
    }

    // ─── Core Functions ──────────────────────────────────────────────────────

    /**
     * @notice Lock HHUSD as collateral for a group
     * @dev Called by group contract; user must have approved sufficient HHUSD balance
     * @param user The user locking collateral
     * @param groupId The group ID
     * @param amount Amount to lock
     */
    function lockCollateral(address user, uint256 groupId, uint256 amount)
        external
        onlyRole(GROUP_ROLE)
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        uint256 balance = hhusdToken.balanceOf(user);
        if (balance < lockedCollateral[user] + amount) {
            revert InsufficientHHUSD(balance, lockedCollateral[user] + amount);
        }

        lockedCollateral[user]              += amount;
        groupCollateral[groupId][user]      += amount;
        groupTotalCollateral[groupId]       += amount;

        emit CollateralLocked(user, groupId, amount);
    }

    /**
     * @notice Unlock and return collateral to user when group ends normally
     * @param user The user
     * @param groupId The group ID
     * @param amount Amount to unlock
     */
    function unlockCollateral(address user, uint256 groupId, uint256 amount)
        external
        onlyRole(GROUP_ROLE)
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        uint256 locked = groupCollateral[groupId][user];
        if (locked < amount) revert InsufficientLockedCollateral(locked, amount);

        lockedCollateral[user]          -= amount;
        groupCollateral[groupId][user]  -= amount;
        groupTotalCollateral[groupId]   -= amount;

        emit CollateralUnlocked(user, groupId, amount);
    }

    /**
     * @notice Slash collateral from a user and burn/redistribute
     * @param user The penalized user
     * @param groupId The group ID
     * @param amount Amount to slash
     * @param recipient Address that receives slashed collateral (or address(0) to burn)
     */
    function slashCollateral(
        address user,
        uint256 groupId,
        uint256 amount,
        address recipient
    )
        external
        onlyRole(GROUP_ROLE)
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        uint256 locked = groupCollateral[groupId][user];
        if (locked < amount) revert InsufficientLockedCollateral(locked, amount);

        lockedCollateral[user]          -= amount;
        groupCollateral[groupId][user]  -= amount;
        groupTotalCollateral[groupId]   -= amount;

        if (recipient == address(0)) {
            // Burn slashed collateral
            hhusdToken.burn(user, amount);
        }
        // If recipient != address(0), the group contract handles redistribution

        emit CollateralSlashed(user, groupId, amount, recipient);
    }

    // ─── View Functions ──────────────────────────────────────────────────────

    function getCollateralBalance(address user) external view returns (uint256) {
        return lockedCollateral[user];
    }

    function getGroupCollateral(uint256 groupId, address user)
        external
        view
        returns (uint256)
    {
        return groupCollateral[groupId][user];
    }

    /**
     * @notice Calculate required collateral for a group position
     * @param contribution Per-cycle contribution amount
     * @param cycles Total number of cycles
     * @param ratioBP Collateral ratio in basis points (e.g. 10000 = 100%)
     */
    function getRequiredCollateral(
        uint256 contribution,
        uint256 cycles,
        uint256 ratioBP
    ) external pure returns (uint256) {
        return (contribution * cycles * ratioBP) / 10000;
    }

    /**
     * @notice Check whether a user has sufficient free HHUSD for additional collateral
     */
    function isCollateralSufficient(address user, uint256 requiredAmount)
        external
        view
        returns (bool)
    {
        uint256 balance = hhusdToken.balanceOf(user);
        return balance >= lockedCollateral[user] + requiredAmount;
    }

    // ─── UUPS Upgrade ────────────────────────────────────────────────────────

    function _authorizeUpgrade(address)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}
}
