// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISubscriptionService
/// @notice Reactive Network subscription service interface.
/// @dev Deployed on the Reactive Network (Kopli testnet: 0x9b9BB25f1A81078C544C829c5EB7822d747Cf434).
///      Used by Reactive Contracts to subscribe/unsubscribe from external chain events.
interface ISubscriptionService {
    /// @notice Subscribe to events matching the given filter.
    /// @param chain_id  CAIP-2 numeric chain ID of the origin chain
    /// @param _contract Contract address to watch (address(0) = any contract)
    /// @param topic_0   Event topic_0 filter (0 = any)
    /// @param topic_1   Event topic_1 filter (0 = any)
    /// @param topic_2   Event topic_2 filter (0 = any)
    /// @param topic_3   Event topic_3 filter (0 = any)
    /// @param _type     Subscription type (0 = standard, 1 = cron — see RN docs)
    function subscribe(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        uint256 topic_3,
        uint256 _type
    ) external payable;

    /// @notice Unsubscribe from a previously created subscription.
    function unsubscribe(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        uint256 topic_3
    ) external payable;
}
