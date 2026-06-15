// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice 로컬 테스트용 VRF Coordinator - fulfillRandomWords를 수동으로 호출
contract MockVRFCoordinator {
    uint256 private _nextRequestId = 1;

    struct Request {
        address consumer;
        bool fulfilled;
    }
    mapping(uint256 => Request) public requests;

    event RandomWordsRequested(uint256 indexed requestId, address indexed consumer);
    event RandomWordsFulfilled(uint256 indexed requestId, uint256[] randomWords);

    function requestRandomWords(
        bytes32,   // keyHash
        uint64,    // subId
        uint16,    // minimumRequestConfirmations
        uint32,    // callbackGasLimit
        uint32     // numWords
    ) external returns (uint256 requestId) {
        requestId = _nextRequestId++;
        requests[requestId] = Request({ consumer: msg.sender, fulfilled: false });
        emit RandomWordsRequested(requestId, msg.sender);
    }

    /// @notice 테스트에서 직접 호출해 랜덤값 주입
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        Request storage req = requests[requestId];
        require(!req.fulfilled, "already fulfilled");
        req.fulfilled = true;

        // consumer의 rawFulfillRandomWords 호출
        (bool ok, ) = req.consumer.call(
            abi.encodeWithSignature("rawFulfillRandomWords(uint256,uint256[])", requestId, randomWords)
        );
        require(ok, "fulfillment failed");
        emit RandomWordsFulfilled(requestId, randomWords);
    }
}
