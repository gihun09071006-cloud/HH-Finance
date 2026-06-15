// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ════════════════════════════════════════════════════════════════════════════
//  Chainlink VRF v2.5 imports
//  npm install @chainlink/contracts
// ════════════════════════════════════════════════════════════════════════════
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient}        from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {IVRFCoordinatorV2Plus}  from "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ─── Interface: called back by VRFPositionAssigner after randomness arrives ───
interface IVRFGroupConsumer {
    function receiveRandomPositions(uint256[] calldata randomWords) external;
}

/**
 * @title VRFPositionAssigner
 * @notice Shared Chainlink VRF v2.5 consumer for HH Finance groups.
 *
 * @dev Architecture:
 *   Group Contract finalizeGroup()
 *     --> VRFPositionAssigner.requestRandomness()
 *         --> Chainlink Node generates proof
 *             --> fulfillRandomWords()
 *                 --> group.receiveRandomPositions()
 *
 *  One shared VRFPositionAssigner serves ALL group contracts.
 *  Groups are authorized via GROUP_ROLE by the admin.
 *
 * ─── BSC Network Configuration ─────────────────────────────────────────────
 *  ALWAYS verify current addresses at:
 *  https://docs.chain.link/vrf/v2-5/supported-networks
 *
 *  BSC MAINNET (VRF v2.5)
 *  VRF Coordinator : 0xd691f04bc0C9a24Edb78af9754bE204f869cef3a
 *  LINK Token      : 0x404460C6A5EdE2D891e8297795264fDe62ADBB75
 *  500 gwei keyHash: 0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314
 *
 *  BSC TESTNET (VRF v2.5)
 *  VRF Coordinator : 0x9C22cD2689B24c05cB84BFf34a4eb30Bb42cAA3A
 *  LINK Token      : 0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06
 *  50 gwei keyHash : 0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314
 *
 *  NOTE: BNB Bridge LINK is NOT ERC-677. Use PegSwap: https://pegswap.chain.link
 *
 * ─── Subscription Setup ────────────────────────────────────────────────────
 *  1. Visit https://vrf.chain.link/bsc
 *  2. Create subscription -> get subscriptionId (uint256 in v2.5)
 *  3. Fund with LINK (estimate: ~0.003 LINK per group finalization)
 *  4. Add THIS CONTRACT as consumer
 *  5. Deploy with that subscriptionId
 */
contract VRFPositionAssigner is VRFConsumerBaseV2Plus, AccessControl, ReentrancyGuard {

    bytes32 public constant GROUP_ROLE = keccak256("GROUP_ROLE");

    uint256 public s_subscriptionId;
    bytes32 public s_keyHash;
    uint32  public s_callbackGasLimit = 300_000;
    uint16  public s_requestConfirmations = 3;

    struct VRFRequest {
        address groupContract;
        uint256 memberCount;
        bool    fulfilled;
    }

    mapping(uint256 => VRFRequest) public requests;
    mapping(address => uint256)    public pendingRequest;

    event RandomnessRequested(uint256 indexed requestId, address indexed groupContract, uint256 memberCount);
    event RandomnessFulfilled(uint256 indexed requestId, address indexed groupContract, uint256[] randomWords);
    event CallbackFailed(address indexed group, bytes reason);
    event ConfigUpdated(uint32 callbackGasLimit, uint16 confirmations, bytes32 keyHash);

    error RequestAlreadyPending(address group, uint256 existingRequestId);
    error UnknownRequestId(uint256 requestId);
    error ZeroMemberCount();

    constructor(
        address vrfCoordinator,
        uint256 subscriptionId,
        bytes32 keyHash,
        address admin
    ) VRFConsumerBaseV2Plus(vrfCoordinator) {
        s_subscriptionId = subscriptionId;
        s_keyHash        = keyHash;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /**
     * @notice Request verifiable randomness for position assignment
     * @dev Only authorized group contracts (GROUP_ROLE) may call.
     *      One pending request per group at a time.
     */
    function requestRandomness(uint256 memberCount)
        external
        onlyRole(GROUP_ROLE)
        nonReentrant
        returns (uint256 requestId)
    {
        if (memberCount == 0) revert ZeroMemberCount();
        address group = msg.sender;
        if (pendingRequest[group] != 0)
            revert RequestAlreadyPending(group, pendingRequest[group]);

        requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash:              s_keyHash,
                subId:                s_subscriptionId,
                requestConfirmations: s_requestConfirmations,
                callbackGasLimit:     s_callbackGasLimit,
                numWords:             1,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({ nativePayment: false })
                )
            })
        );

        requests[requestId] = VRFRequest({
            groupContract: group,
            memberCount:   memberCount,
            fulfilled:     false
        });
        pendingRequest[group] = requestId;

        emit RandomnessRequested(requestId, group, memberCount);
    }

    /**
     * @notice Chainlink VRF callback — forwards randomness to group contract
     */
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords)
        internal
        override
    {
        VRFRequest storage req = requests[requestId];
        if (req.groupContract == address(0)) revert UnknownRequestId(requestId);

        req.fulfilled = true;
        pendingRequest[req.groupContract] = 0;

        emit RandomnessFulfilled(requestId, req.groupContract, randomWords);

        try IVRFGroupConsumer(req.groupContract).receiveRandomPositions(randomWords) {}
        catch (bytes memory reason) {
            emit CallbackFailed(req.groupContract, reason);
        }
    }

    function updateConfig(uint32 gasLimit, uint16 confirmations, bytes32 keyHash)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        s_callbackGasLimit      = gasLimit;
        s_requestConfirmations  = confirmations;
        s_keyHash               = keyHash;
        emit ConfigUpdated(gasLimit, confirmations, keyHash);
    }

    function setSubscriptionId(uint256 newSubId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        s_subscriptionId = newSubId;
    }

    function getRequest(uint256 requestId)
        external view
        returns (address groupContract, uint256 memberCount, bool fulfilled)
    {
        VRFRequest storage r = requests[requestId];
        return (r.groupContract, r.memberCount, r.fulfilled);
    }
}
