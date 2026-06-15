// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPublicGroupVRF {
    function receiveRandomPositions(uint256[] calldata randomWords) external;
}

/// @notice 테스트용 VRFPositionAssigner - fulfill을 수동으로 호출
contract MockVRFAssigner {
    uint256 private _nextRequestId = 1;

    function requestRandomness(uint256) external returns (uint256 requestId) {
        return _nextRequestId++;
    }

    /// @notice 테스트에서 직접 호출해 랜덤값 주입
    function fulfill(address groupContract, uint256[] calldata randomWords) external {
        IPublicGroupVRF(groupContract).receiveRandomPositions(randomWords);
    }
}
