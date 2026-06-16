// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TreasuryV2
 * @notice Treasury with group contribution pooling
 *
 * KEY DESIGN PRINCIPLE:
 *   USDT never leaves Treasury except to:
 *     (a) Authorized group payout recipients
 *     (b) Fee receiver
 *     (c) Referral reward recipients
 *
 *   Group contracts CANNOT directly access USDT.
 *   HHUSD is purely a receipt/collateral token.
 *   All real money moves happen here.
 */

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

interface IGroupRegistry {
    function isActiveGroup(uint256 groupId) external view returns (bool);
    function getContributionAmount(uint256 groupId) external view returns (uint256);
    function getCurrentCycle(uint256 groupId) external view returns (uint256);
}

contract TreasuryV2 is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuard,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // ─── Roles ───────────────────────────────────────────────────────────────
    bytes32 public constant PAUSER_ROLE          = keccak256("PAUSER_ROLE");
    bytes32 public constant FEE_MANAGER          = keccak256("FEE_MANAGER");
    bytes32 public constant UPGRADER_ROLE        = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAYOUT_EXECUTOR_ROLE = keccak256("PAYOUT_EXECUTOR_ROLE");

    uint256 public constant MAX_FEE_BP = 1000;
    uint256 public constant BP_BASE    = 10000;

    // ─── Core State ──────────────────────────────────────────────────────────
    IERC20  public usdtToken;
    IHHUSD  public hhusdToken;
    address public groupRegistry;

    uint256 public buyFeeBP;
    uint256 public sellFeeBP;
    uint256 public referralFeeBP;
    address public feeReceiver;

    uint256 public minDepositAmount;
    uint256 public maxDepositAmount;

    mapping(address => address) public referrer;

    // ─── Group Pool State ─────────────────────────────────────────────────────
    //
    // groupPool[groupId] = total USDT currently pooled for this group (모든 사이클 합산)
    mapping(uint256 => uint256) public groupPool;

    // cyclePool[groupId][cycle] = 해당 사이클에 모인 USDT (지급 후 0으로 초기화)
    mapping(uint256 => mapping(uint256 => uint256)) public cyclePool;

    // contributed[groupId][cycle][member] = amount contributed this cycle
    mapping(uint256 => mapping(uint256 => mapping(address => uint256)))
        public contributed;

    // hasPaidCycle[groupId][cycle][member]
    mapping(uint256 => mapping(uint256 => mapping(address => bool)))
        public hasPaidCycle;

    // cyclePayoutExecuted[groupId][cycle]
    mapping(uint256 => mapping(uint256 => bool)) public cyclePayoutExecuted;

    // ─── Events ──────────────────────────────────────────────────────────────
    event DepositCompleted(address indexed user, uint256 usdtIn, uint256 fee, uint256 hhusdMinted);
    event RedeemCompleted(address indexed user, uint256 hhusdBurned, uint256 fee, uint256 usdtOut);
    event FeePaid(address indexed receiver, uint256 amount);
    event ReferralPaid(address indexed user, address indexed ref, uint256 amount);
    event ReferrerSet(address indexed user, address indexed ref);

    event GroupContribution(
        uint256 indexed groupId,
        address indexed member,
        uint256 indexed cycleNumber,
        uint256 amount
    );
    event GroupPayout(
        uint256 indexed groupId,
        uint256 indexed cycleNumber,
        address indexed recipient,
        uint256 amount
    );
    event GroupPoolRefunded(uint256 indexed groupId, uint256 totalRefunded);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error ZeroAmount();
    error BelowMin(uint256 amount, uint256 min);
    error AboveMax(uint256 amount, uint256 max);
    error InsufficientHHUSD();
    error ReferrerAlreadySet();
    error SelfReferral();
    error InvalidAddress();
    error FeeTooHigh();
    error InvalidGroup(uint256 groupId);
    error WrongContributionAmount(uint256 sent, uint256 required);
    error AlreadyPaidThisCycle(address member, uint256 cycle);
    error CycleAlreadyPaidOut(uint256 groupId, uint256 cycle);
    error EmptyPool(uint256 groupId);

    // ─── Init ─────────────────────────────────────────────────────────────────
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address admin,
        address _usdtToken,
        address _hhusdToken,
        address _feeReceiver,
        address _groupRegistry
    ) external initializer {
        require(admin         != address(0), "Admin required");
        require(_usdtToken    != address(0), "USDT required");
        require(_hhusdToken   != address(0), "HHUSD required");
        require(_feeReceiver  != address(0), "FeeReceiver required");
        require(_groupRegistry != address(0), "Registry required");
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(FEE_MANAGER, admin);
        _grantRole(UPGRADER_ROLE, admin);

        usdtToken     = IERC20(_usdtToken);
        hhusdToken    = IHHUSD(_hhusdToken);
        feeReceiver   = _feeReceiver;
        groupRegistry = _groupRegistry;

        buyFeeBP      = 250;
        sellFeeBP     = 250;
        referralFeeBP = 100;
        minDepositAmount = 1e18;
        maxDepositAmount = 100_000e18;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  DEPOSIT / REDEEM
    // ════════════════════════════════════════════════════════════════════════

    function depositUSDT(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (amount < minDepositAmount) revert BelowMin(amount, minDepositAmount);
        if (amount > maxDepositAmount) revert AboveMax(amount, maxDepositAmount);

        usdtToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 buyFee        = (amount * buyFeeBP) / BP_BASE;
        uint256 referralReward = 0;
        address ref           = referrer[msg.sender];

        if (ref != address(0)) {
            referralReward = (amount * referralFeeBP) / BP_BASE;
            buyFee -= referralReward;
        }

        if (buyFee > 0) {
            usdtToken.safeTransfer(feeReceiver, buyFee);
            emit FeePaid(feeReceiver, buyFee);
        }
        if (referralReward > 0) {
            usdtToken.safeTransfer(ref, referralReward);
            emit ReferralPaid(msg.sender, ref, referralReward);
        }

        uint256 netAmount = amount - buyFee - referralReward;
        hhusdToken.mint(msg.sender, netAmount);

        emit DepositCompleted(msg.sender, amount, buyFee + referralReward, netAmount);
    }

    function redeemHHUSD(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (hhusdToken.balanceOf(msg.sender) < amount) revert InsufficientHHUSD();

        uint256 sellFee = (amount * sellFeeBP) / BP_BASE;
        uint256 usdtOut = amount - sellFee;

        hhusdToken.burn(msg.sender, amount);

        if (sellFee > 0) {
            usdtToken.safeTransfer(feeReceiver, sellFee);
            emit FeePaid(feeReceiver, sellFee);
        }
        usdtToken.safeTransfer(msg.sender, usdtOut);

        emit RedeemCompleted(msg.sender, amount, sellFee, usdtOut);
    }

    function setReferrer(address ref) external {
        if (referrer[msg.sender] != address(0)) revert ReferrerAlreadySet();
        if (ref == msg.sender) revert SelfReferral();
        if (ref == address(0)) revert InvalidAddress();
        referrer[msg.sender] = ref;
        emit ReferrerSet(msg.sender, ref);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  GROUP CONTRIBUTION POOLING
    // ════════════════════════════════════════════════════════════════════════

    /**
     * @notice Member pays their contribution for the current cycle
     * @dev USDT stays inside Treasury. Group contract never touches USDT.
     *
     *      SECURITY MODEL:
     *      - GroupRegistry verifies the groupId is active
     *      - Amount must match the group's configured contributionAmount exactly
     *      - Double-pay per cycle prevented by hasPaidCycle mapping
     *      - groupPool accumulates USDT until executeGroupPayout is called
     *
     * @param groupId    The group to contribute to
     * @param cycleNumber The current cycle number (verified against GroupRegistry)
     */
    function contributeToGroup(
        uint256 groupId,
        uint256 cycleNumber
    ) external nonReentrant whenNotPaused {
        // Validate group
        if (!IGroupRegistry(groupRegistry).isActiveGroup(groupId))
            revert InvalidGroup(groupId);

        // Verify cycle matches on-chain group state
        uint256 activeCycle = IGroupRegistry(groupRegistry).getCurrentCycle(groupId);
        require(cycleNumber == activeCycle, "Treasury: wrong cycle");

        // Prevent double contribution
        if (hasPaidCycle[groupId][cycleNumber][msg.sender])
            revert AlreadyPaidThisCycle(msg.sender, cycleNumber);

        // Enforce exact contribution amount
        uint256 required = IGroupRegistry(groupRegistry).getContributionAmount(groupId);
        // Pull USDT from member
        usdtToken.safeTransferFrom(msg.sender, address(this), required);

        hasPaidCycle[groupId][cycleNumber][msg.sender] = true;
        contributed[groupId][cycleNumber][msg.sender]  = required;
        groupPool[groupId]              += required;
        cyclePool[groupId][cycleNumber] += required;

        emit GroupContribution(groupId, msg.sender, cycleNumber, required);
    }

    /**
     * @notice Execute payout to the cycle's scheduled recipient
     * @dev Only PAYOUT_EXECUTOR_ROLE (group contract) can call.
     *      This is the ONLY way USDT leaves Treasury for group payouts.
     *
     *      SECURITY MODEL:
     *      - Group contract cannot pull arbitrary amounts; pool balance is fixed
     *      - Idempotency: cyclePayoutExecuted prevents double payout
     *      - recipient is determined by the GROUP CONTRACT (not Treasury)
     *        → Treasury just executes the transfer; group decides who receives
     *
     * @param groupId     The group
     * @param cycleNumber The cycle being paid out
     * @param recipient   The member receiving this cycle's payout
     */
    function executeGroupPayout(
        uint256 groupId,
        uint256 cycleNumber,
        address recipient
    ) external nonReentrant onlyRole(PAYOUT_EXECUTOR_ROLE) {
        if (cyclePayoutExecuted[groupId][cycleNumber])
            revert CycleAlreadyPaidOut(groupId, cycleNumber);

        uint256 pool = cyclePool[groupId][cycleNumber];
        if (pool == 0) revert EmptyPool(groupId);

        if (recipient == address(0)) revert InvalidAddress();

        cyclePayoutExecuted[groupId][cycleNumber] = true;
        cyclePool[groupId][cycleNumber] = 0;
        groupPool[groupId] -= pool;

        usdtToken.safeTransfer(recipient, pool);

        emit GroupPayout(groupId, cycleNumber, recipient, pool);
    }

    /**
     * @notice Refund all pooled USDT when a group is cancelled
     * @dev Called by group contract when state transitions to CANCELLED.
     *      Refunds contributions already made in the current cycle.
     *
     * @param groupId   The cancelled group
     * @param members   Array of member addresses who paid this cycle
     * @param cycle     The cycle being refunded
     */
    function refundGroupPool(
        uint256 groupId,
        address[] calldata members,
        uint256 cycle
    ) external nonReentrant onlyRole(PAYOUT_EXECUTOR_ROLE) {
        uint256 totalRefunded;
        for (uint256 i = 0; i < members.length; i++) {
            address m   = members[i];
            uint256 amt = contributed[groupId][cycle][m];
            if (amt > 0) {
                contributed[groupId][cycle][m]   = 0;
                hasPaidCycle[groupId][cycle][m] = false;
                groupPool[groupId]              -= amt;
                cyclePool[groupId][cycle]       -= amt;
                usdtToken.safeTransfer(m, amt);
                totalRefunded += amt;
            }
        }
        emit GroupPoolRefunded(groupId, totalRefunded);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setFees(uint256 buyBP, uint256 sellBP, uint256 refBP)
        external onlyRole(FEE_MANAGER)
    {
        require(buyBP <= MAX_FEE_BP && sellBP <= MAX_FEE_BP, "Fee too high");
        require(refBP < buyBP, "Referral >= buy fee");
        buyFeeBP = buyBP; sellFeeBP = sellBP; referralFeeBP = refBP;
    }

    function setFeeReceiver(address r) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (r == address(0)) revert InvalidAddress();
        feeReceiver = r;
    }

    function setGroupRegistry(address r) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (r == address(0)) revert InvalidAddress();
        groupRegistry = r;
    }

    function setDepositLimits(uint256 min_, uint256 max_)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(min_ < max_, "min >= max");
        minDepositAmount = min_;
        maxDepositAmount = max_;
    }

    function pause()   external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    // ─── Views ────────────────────────────────────────────────────────────────

    function getGroupPool(uint256 groupId) external view returns (uint256) {
        return groupPool[groupId];
    }

    function hasMemberPaid(uint256 groupId, uint256 cycle, address member)
        external view returns (bool)
    {
        return hasPaidCycle[groupId][cycle][member];
    }
}
