// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title HHUSD
 * @notice Non-transferable internal accounting token for HH Finance
 * @dev Users cannot transfer HHUSD; only approved protocol contracts can mint/burn
 */
contract HHUSD is
    Initializable,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    // ─── Roles ───────────────────────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE   = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE   = keccak256("BURNER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ─── Events ──────────────────────────────────────────────────────────────
    event Minted(address indexed to, uint256 amount);
    event Burned(address indexed from, uint256 amount);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error HHUSDNotTransferable();

    // ─── Initializer ─────────────────────────────────────────────────────────
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        __ERC20_init("HH USD", "HHUSD");
        __AccessControl_init();


        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    // ─── Mint / Burn ─────────────────────────────────────────────────────────

    /**
     * @notice Mint HHUSD to a user
     * @param user Recipient address
     * @param amount Amount in 18-decimal units
     */
    function mint(address user, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(user != address(0), "HHUSD: zero address");
        require(amount > 0, "HHUSD: zero amount");
        _mint(user, amount);
        emit Minted(user, amount);
    }

    /**
     * @notice Burn HHUSD from a user
     * @param user Address to burn from
     * @param amount Amount in 18-decimal units
     */
    function burn(address user, uint256 amount) external onlyRole(BURNER_ROLE) {
        require(user != address(0), "HHUSD: zero address");
        require(amount > 0, "HHUSD: zero amount");
        _burn(user, amount);
        emit Burned(user, amount);
    }

    // ─── Transfer Restrictions ───────────────────────────────────────────────

    function transfer(address, uint256) public pure override returns (bool) {
        revert HHUSDNotTransferable();
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert HHUSDNotTransferable();
    }

    function approve(address, uint256) public pure override returns (bool) {
        revert HHUSDNotTransferable();
    }

    function allowance(address, address) public pure override returns (uint256) {
        return 0;
    }

    // ─── UUPS Upgrade ────────────────────────────────────────────────────────

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}
}
