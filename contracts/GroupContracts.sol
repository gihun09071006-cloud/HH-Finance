// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./PublicGroup.sol";

/**
 * @title PublicGroupFactory
 * @notice Deploys and tracks public savings group contracts
 */
contract PublicGroupFactory is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // Predefined public group templates: (contributionAmount, totalCycles)
    struct GroupTemplate {
        uint256 contributionAmount;
        uint256 totalCycles;
        uint256 cycleIntervalSeconds;
        uint256 collateralRatioBP; // 10000 = 100%
    }

    address public hhusd;
    address public vault;

    uint256 public nextGroupId;
    GroupTemplate[] public templates;

    mapping(uint256 => address) public groupById;
    mapping(address => uint256[]) public groupsByCreator;

    // all group addresses
    address[] public allGroups;

    event GroupCreated(
        uint256 indexed groupId,
        address indexed groupContract,
        uint256 contributionAmount,
        uint256 totalCycles
    );
    event TemplateAdded(uint256 indexed templateId, uint256 contribution, uint256 cycles);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address admin,
        address _hhusd,
        address _vault
    ) external initializer {
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);

        hhusd = _hhusd;
        vault = _vault;
        nextGroupId = 1;

        // Default templates
        templates.push(GroupTemplate(10e18,  10, 7 days, 10000));
        templates.push(GroupTemplate(20e18,  10, 7 days, 10000));
        templates.push(GroupTemplate(50e18,  10, 7 days, 10000));
        templates.push(GroupTemplate(100e18, 10, 7 days, 10000));
    }

    /**
     * @notice Deploy a new public group from a template
     * @param templateId Index into templates array
     */
    function createGroup(uint256 templateId) external whenNotPaused returns (address) {
        require(templateId < templates.length, "Factory: invalid template");
        GroupTemplate memory t = templates[templateId];

        uint256 gId = nextGroupId++;
        PublicGroup group = new PublicGroup(
            gId,
            t.contributionAmount,
            t.totalCycles,
            t.cycleIntervalSeconds,
            t.collateralRatioBP,
            hhusd,
            vault
        );

        address groupAddr = address(group);
        groupById[gId] = groupAddr;
        groupsByCreator[msg.sender].push(gId);
        allGroups.push(groupAddr);

        emit GroupCreated(gId, groupAddr, t.contributionAmount, t.totalCycles);
        return groupAddr;
    }

    function addTemplate(
        uint256 contribution,
        uint256 cycles,
        uint256 intervalSeconds,
        uint256 ratioBP
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        templates.push(GroupTemplate(contribution, cycles, intervalSeconds, ratioBP));
        emit TemplateAdded(templates.length - 1, contribution, cycles);
    }

    function getGroupCount() external view returns (uint256) { return allGroups.length; }
    function getAllGroups() external view returns (address[] memory) { return allGroups; }

    function pause()   external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}


// ═══════════════════════════════════════════════════════════════════════════════
// PrivateGroup.sol
// ═══════════════════════════════════════════════════════════════════════════════

interface ICollateralVaultMinimal {
    function lockCollateral(address user, uint256 groupId, uint256 amount) external;
    function unlockCollateral(address user, uint256 groupId, uint256 amount) external;
    function slashCollateral(address user, uint256 groupId, uint256 amount, address recipient) external;
    function getRequiredCollateral(uint256 contribution, uint256 cycles, uint256 ratioBP) external pure returns (uint256);
    function getGroupCollateral(uint256 groupId, address user) external view returns (uint256);
}

/**
 * @title PrivateGroup
 * @notice Invitation-only custom savings group
 */
contract PrivateGroup {

    enum PositionMode { ManualAssignment, FreeSelection, RandomAssignment }
    enum GroupState   { ENROLLING, ACTIVE, COMPLETED, CANCELLED }
    enum MemberStatus { ACTIVE, WARNED, PENALIZED, REMOVED }

    struct Member {
        address wallet;
        uint256 joinTime;
        uint8   position;
        uint256 collateral;
        MemberStatus status;
        uint8   missedPayments;
        bool    hasReceivedPayout;
    }

    uint256 public immutable groupId;
    address public immutable owner;
    address public immutable hhusd;
    ICollateralVaultMinimal public immutable vault;

    uint256 public contributionAmount;
    uint256 public totalCycles;
    uint256 public cycleIntervalSeconds;
    uint256 public collateralRatioBP;
    uint256 public maxMembers;
    PositionMode public positionMode;

    GroupState public state;
    uint256 public currentCycle;
    uint256 public cycleStartTime;

    bytes32[] public inviteCodes;
    mapping(bytes32 => bool) public validInviteCodes;
    mapping(bytes32 => bool) public usedInviteCodes;

    address[] public memberList;
    mapping(address => Member) public members;
    mapping(uint8 => address) public positionToMember;

    event InviteGenerated(bytes32 indexed code);
    event MemberJoined(address indexed user, bytes32 code);
    event GroupStarted(uint256 startTime);
    event ContributionMade(address indexed user, uint256 cycle);
    event PayoutDistributed(address indexed recipient, uint256 cycle, uint256 amount);
    event GroupCompleted();
    event GroupCancelled(string reason);

    error NotOwner();
    error InvalidInviteCode();
    error AlreadyMember();
    error GroupFull();
    error NotInState(GroupState required, GroupState current);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        uint256 _groupId,
        address _owner,
        uint256 _contributionAmount,
        uint256 _totalCycles,
        uint256 _cycleIntervalSeconds,
        uint256 _collateralRatioBP,
        uint256 _maxMembers,
        PositionMode _positionMode,
        address _hhusd,
        address _vault
    ) {
        groupId              = _groupId;
        owner                = _owner;
        contributionAmount   = _contributionAmount;
        totalCycles          = _totalCycles;
        cycleIntervalSeconds = _cycleIntervalSeconds;
        collateralRatioBP    = _collateralRatioBP;
        maxMembers           = _maxMembers;
        positionMode         = _positionMode;
        hhusd                = _hhusd;
        vault                = ICollateralVaultMinimal(_vault);
        state                = GroupState.ENROLLING;
    }

    // ─── Invite Management ───────────────────────────────────────────────────

    /**
     * @notice Owner generates an invite code
     */
    function generateInviteCode(bytes32 code) external onlyOwner {
        require(!validInviteCodes[code], "PrivateGroup: code exists");
        validInviteCodes[code] = true;
        inviteCodes.push(code);
        emit InviteGenerated(code);
    }

    // ─── Enrollment ──────────────────────────────────────────────────────────

    function joinGroup(bytes32 inviteCode) external {
        if (state != GroupState.ENROLLING) revert NotInState(GroupState.ENROLLING, state);
        if (!validInviteCodes[inviteCode] || usedInviteCodes[inviteCode])
            revert InvalidInviteCode();
        if (members[msg.sender].wallet != address(0)) revert AlreadyMember();
        if (memberList.length >= maxMembers) revert GroupFull();

        usedInviteCodes[inviteCode] = true;

        uint256 requiredCollateral = vault.getRequiredCollateral(
            contributionAmount, totalCycles, collateralRatioBP
        );
        vault.lockCollateral(msg.sender, groupId, requiredCollateral);

        members[msg.sender] = Member({
            wallet: msg.sender,
            joinTime: block.timestamp,
            position: 0,
            collateral: requiredCollateral,
            status: MemberStatus.ACTIVE,
            missedPayments: 0,
            hasReceivedPayout: false
        });
        memberList.push(msg.sender);

        emit MemberJoined(msg.sender, inviteCode);
    }

    // ─── Position Assignment (owner or member depending on mode) ─────────────

    function assignPosition(address user, uint8 position) external onlyOwner {
        require(positionMode == PositionMode.ManualAssignment, "PrivateGroup: not manual mode");
        require(members[user].wallet != address(0), "PrivateGroup: not member");
        require(positionToMember[position] == address(0), "PrivateGroup: position taken");
        members[user].position = position;
        positionToMember[position] = user;
    }

    function startGroup() external onlyOwner {
        if (state != GroupState.ENROLLING) revert NotInState(GroupState.ENROLLING, state);
        require(memberList.length >= 2, "PrivateGroup: need 2+ members");

        // Verify all positions assigned for manual mode
        if (positionMode == PositionMode.ManualAssignment) {
            for (uint256 i = 0; i < memberList.length; i++) {
                require(members[memberList[i]].position != 0, "PrivateGroup: unassigned positions");
            }
        } else if (positionMode == PositionMode.RandomAssignment) {
            _randomAssignPositions();
        }

        state = GroupState.ACTIVE;
        currentCycle = 1;
        cycleStartTime = block.timestamp;
        emit GroupStarted(block.timestamp);
    }

    function _randomAssignPositions() internal {
        uint256 count = memberList.length;
        uint8[] memory positions = new uint8[](count);
        for (uint8 i = 0; i < count; i++) positions[i] = i + 1;

        uint256 seed = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao)));
        for (uint256 i = count - 1; i > 0; i--) {
            uint256 j = seed % (i + 1);
            (positions[i], positions[j]) = (positions[j], positions[i]);
            seed = uint256(keccak256(abi.encodePacked(seed)));
        }
        for (uint256 i = 0; i < count; i++) {
            members[memberList[i]].position = positions[i];
            positionToMember[positions[i]] = memberList[i];
        }
    }

    // ─── View Helpers ────────────────────────────────────────────────────────

    function getMemberCount() external view returns (uint256) { return memberList.length; }
    function getMember(address user) external view returns (Member memory) { return members[user]; }
}


// ═══════════════════════════════════════════════════════════════════════════════
// PrivateGroupFactory.sol
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @title PrivateGroupFactory
 * @notice Deploys custom private savings groups
 */
contract PrivateGroupFactory is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    address public hhusd;
    address public vault;

    uint256 public nextGroupId;
    address[] public allGroups;
    mapping(address => address[]) public groupsByOwner;

    event PrivateGroupCreated(
        uint256 indexed groupId,
        address indexed groupContract,
        address indexed creator
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address admin,
        address _hhusd,
        address _vault
    ) external initializer {
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);

        hhusd = _hhusd;
        vault = _vault;
        nextGroupId = 100_000; // Separate ID space from public groups
    }

    function createPrivateGroup(
        uint256 contributionAmount,
        uint256 totalCycles,
        uint256 cycleIntervalSeconds,
        uint256 collateralRatioBP,
        uint256 maxMembers,
        PrivateGroup.PositionMode positionMode
    ) external whenNotPaused returns (address) {
        require(contributionAmount > 0,   "Factory: zero contribution");
        require(totalCycles > 0,          "Factory: zero cycles");
        require(maxMembers >= 2,          "Factory: need 2+ members");
        require(collateralRatioBP >= 5000, "Factory: collateral too low"); // min 50%

        uint256 gId = nextGroupId++;
        PrivateGroup group = new PrivateGroup(
            gId,
            msg.sender,
            contributionAmount,
            totalCycles,
            cycleIntervalSeconds,
            collateralRatioBP,
            maxMembers,
            positionMode,
            hhusd,
            vault
        );

        address groupAddr = address(group);
        allGroups.push(groupAddr);
        groupsByOwner[msg.sender].push(groupAddr);

        emit PrivateGroupCreated(gId, groupAddr, msg.sender);
        return groupAddr;
    }

    function getGroupsByOwner(address owner) external view returns (address[] memory) {
        return groupsByOwner[owner];
    }

    function pause()   external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
