// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IHHUSD {
    function mint(address user, uint256 amount) external;
    function burn(address user, uint256 amount) external;
    function balanceOf(address user) external view returns (uint256);
}

/**
 * @title Treasury
 * @notice Handles USDT deposits/redemptions, HHUSD minting/burning, fees and referrals
 */
contract Treasury is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuard,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // ─── Roles ───────────────────────────────────────────────────────────────
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");
    bytes32 public constant FEE_MANAGER   = keccak256("FEE_MANAGER");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ─── Fee Constants ───────────────────────────────────────────────────────
    uint256 public constant MAX_FEE_BP = 1000; // 10% hard cap
    uint256 public constant BP_BASE    = 10000;

    // ─── State Variables ─────────────────────────────────────────────────────
    IERC20  public usdtToken;
    IHHUSD  public hhusdToken;

    uint256 public buyFeeBP;       // default 250 = 2.5%
    uint256 public sellFeeBP;      // default 250 = 2.5%
    uint256 public referralFeeBP;  // default 100 = 1%

    address public feeReceiver;

    uint256 public minDepositAmount;  // e.g. 1 USDT = 1e18
    uint256 public maxDepositAmount;  // e.g. 100,000 USDT = 1e23

    uint256 public totalFeesCollected;
    uint256 public totalReferralsPaid;

    // referrer[user] = referrer address; permanent after first registration
    mapping(address => address) public referrer;

    // ─── Events ──────────────────────────────────────────────────────────────
    event DepositCompleted(
        address indexed user,
        uint256 usdtIn,
        uint256 fee,
        uint256 hhusdMinted
    );
    event RedeemCompleted(
        address indexed user,
        uint256 hhusdBurned,
        uint256 fee,
        uint256 usdtOut
    );
    event FeePaid(address indexed feeReceiver, uint256 amount);
    event ReferralPaid(
        address indexed user,
        address indexed referrerAddr,
        uint256 amount
    );
    event ReferrerSet(address indexed user, address indexed referrerAddr);
    event FeesUpdated(uint256 buyBP, uint256 sellBP, uint256 referralBP);
    event FeeReceiverUpdated(address indexed newReceiver);
    event DepositLimitsUpdated(uint256 minAmount, uint256 maxAmount);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error ZeroAmount();
    error BelowMinDeposit(uint256 amount, uint256 minimum);
    error AboveMaxDeposit(uint256 amount, uint256 maximum);
    error InsufficientHHUSD(uint256 balance, uint256 requested);
    error ReferrerAlreadySet();
    error SelfReferral();
    error InvalidFeeReceiver();
    error FeeTooHigh(uint256 feeBP, uint256 maxBP);

    // ─── Initializer ─────────────────────────────────────────────────────────
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address _usdtToken,
        address _hhusdToken,
        address _feeReceiver
    ) external initializer {
        __AccessControl_init();
        
        __Pausable_init();


        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(FEE_MANAGER, admin);
        _grantRole(UPGRADER_ROLE, admin);

        usdtToken   = IERC20(_usdtToken);
        hhusdToken  = IHHUSD(_hhusdToken);
        feeReceiver = _feeReceiver;

        buyFeeBP      = 250;
        sellFeeBP     = 250;
        referralFeeBP = 100;

        minDepositAmount = 1e18;      // 1 USDT
        maxDepositAmount = 100_000e18; // 100,000 USDT
    }

    // ─── Core Functions ──────────────────────────────────────────────────────

    /**
     * @notice Deposit USDT and receive HHUSD
     * @param amount Amount of USDT (18 decimals)
     */
    function depositUSDT(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (amount < minDepositAmount) revert BelowMinDeposit(amount, minDepositAmount);
        if (amount > maxDepositAmount) revert AboveMaxDeposit(amount, maxDepositAmount);

        // Pull USDT from user
        usdtToken.safeTransferFrom(msg.sender, address(this), amount);

        // Calculate fees
        uint256 buyFee = (amount * buyFeeBP) / BP_BASE;
        uint256 referralReward = 0;
        address userReferrer = referrer[msg.sender];

        if (userReferrer != address(0)) {
            referralReward = (amount * referralFeeBP) / BP_BASE;
            buyFee -= referralReward; // referral portion comes out of fee
        }

        uint256 netAmount = amount - buyFee - referralReward;

        // Distribute fees
        if (buyFee > 0) {
            usdtToken.safeTransfer(feeReceiver, buyFee);
            totalFeesCollected += buyFee;
            emit FeePaid(feeReceiver, buyFee);
        }
        if (referralReward > 0) {
            usdtToken.safeTransfer(userReferrer, referralReward);
            totalReferralsPaid += referralReward;
            emit ReferralPaid(msg.sender, userReferrer, referralReward);
        }

        // Mint HHUSD 1:1 with net USDT
        hhusdToken.mint(msg.sender, netAmount);

        emit DepositCompleted(msg.sender, amount, buyFee + referralReward, netAmount);
    }

    /**
     * @notice Redeem HHUSD for USDT
     * @param amount Amount of HHUSD to redeem
     */
    function redeemHHUSD(uint256 amount) external nonReentrant {
        // Note: redemption is allowed even when paused (users can exit)
        if (amount == 0) revert ZeroAmount();

        uint256 balance = hhusdToken.balanceOf(msg.sender);
        if (balance < amount) revert InsufficientHHUSD(balance, amount);

        // Calculate fees
        uint256 sellFee = (amount * sellFeeBP) / BP_BASE;
        uint256 usdtOut = amount - sellFee;

        // Burn HHUSD first (checks-effects-interactions)
        hhusdToken.burn(msg.sender, amount);

        // Distribute fee
        if (sellFee > 0) {
            usdtToken.safeTransfer(feeReceiver, sellFee);
            totalFeesCollected += sellFee;
            emit FeePaid(feeReceiver, sellFee);
        }

        // Send USDT to user
        usdtToken.safeTransfer(msg.sender, usdtOut);

        emit RedeemCompleted(msg.sender, amount, sellFee, usdtOut);
    }

    /**
     * @notice Register a referrer for the caller (permanent, one-time)
     * @param referrerAddr Address of the referrer
     */
    function setReferrer(address referrerAddr) external {
        if (referrer[msg.sender] != address(0)) revert ReferrerAlreadySet();
        if (referrerAddr == msg.sender) revert SelfReferral();
        if (referrerAddr == address(0)) revert InvalidFeeReceiver();

        referrer[msg.sender] = referrerAddr;
        emit ReferrerSet(msg.sender, referrerAddr);
    }

    /**
     * @notice Preview fees for a deposit
     */
    function calculateDepositFees(address user, uint256 amount)
        external
        view
        returns (uint256 buyFee, uint256 referralReward, uint256 netAmount)
    {
        buyFee = (amount * buyFeeBP) / BP_BASE;
        referralReward = referrer[user] != address(0)
            ? (amount * referralFeeBP) / BP_BASE
            : 0;
        if (referralReward > 0) buyFee -= referralReward;
        netAmount = amount - buyFee - referralReward;
    }

    /**
     * @notice Preview fees for a redemption
     */
    function calculateRedeemFees(uint256 amount)
        external
        view
        returns (uint256 sellFee, uint256 usdtOut)
    {
        sellFee = (amount * sellFeeBP) / BP_BASE;
        usdtOut = amount - sellFee;
    }

    // ─── Admin Functions ─────────────────────────────────────────────────────

    function setFees(uint256 _buyBP, uint256 _sellBP, uint256 _referralBP)
        external
        onlyRole(FEE_MANAGER)
    {
        if (_buyBP > MAX_FEE_BP) revert FeeTooHigh(_buyBP, MAX_FEE_BP);
        if (_sellBP > MAX_FEE_BP) revert FeeTooHigh(_sellBP, MAX_FEE_BP);
        if (_referralBP >= _buyBP) revert FeeTooHigh(_referralBP, _buyBP);

        buyFeeBP      = _buyBP;
        sellFeeBP     = _sellBP;
        referralFeeBP = _referralBP;

        emit FeesUpdated(_buyBP, _sellBP, _referralBP);
    }

    function setFeeReceiver(address _feeReceiver)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (_feeReceiver == address(0)) revert InvalidFeeReceiver();
        feeReceiver = _feeReceiver;
        emit FeeReceiverUpdated(_feeReceiver);
    }

    function setDepositLimits(uint256 _min, uint256 _max)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_min < _max, "Treasury: min >= max");
        minDepositAmount = _min;
        maxDepositAmount = _max;
        emit DepositLimitsUpdated(_min, _max);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ─── UUPS Upgrade ────────────────────────────────────────────────────────

    function _authorizeUpgrade(address)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}
}
