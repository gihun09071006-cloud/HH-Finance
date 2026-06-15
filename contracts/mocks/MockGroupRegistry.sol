// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice 테스트용 GroupRegistry stub
contract MockGroupRegistry {
    struct GroupData {
        bool    active;
        uint256 contributionAmount;
        uint256 currentCycle;
    }

    mapping(uint256 => GroupData) public groups;

    function setGroup(
        uint256 groupId,
        bool active,
        uint256 contributionAmount,
        uint256 currentCycle
    ) external {
        groups[groupId] = GroupData(active, contributionAmount, currentCycle);
    }

    function isActiveGroup(uint256 groupId) external view returns (bool) {
        return groups[groupId].active;
    }

    function getContributionAmount(uint256 groupId) external view returns (uint256) {
        return groups[groupId].contributionAmount;
    }

    function getCurrentCycle(uint256 groupId) external view returns (uint256) {
        return groups[groupId].currentCycle;
    }
}
