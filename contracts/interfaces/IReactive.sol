// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IReactive
/// @notice Interface for Reactive Smart Contracts on the Reactive Network.
/// @dev A contract implementing this interface can be registered with the Reactive Network
///      and will have its `react()` function called whenever a subscribed event fires.
interface IReactive {
    /// @notice Emitted by the RC to request a callback delivery on a destination chain.
    /// @param chain_id     Destination chain ID (CAIP-2 numeric)
    /// @param _contract    Destination contract address (the Callback Contract)
    /// @param gas_limit    Gas to allocate for the callback execution
    /// @param payload      ABI-encoded calldata to invoke on the destination contract
    event Callback(
        uint256 indexed chain_id,
        address indexed _contract,
        uint64 indexed gas_limit,
        bytes payload
    );

    /// @notice Called by the Reactive Network VM when a subscribed event is observed.
    /// @dev IMPORTANT: `react()` runs inside the Reactive VM. State writes do NOT persist
    ///      on-chain — only emitted `Callback` events trigger real on-chain effects.
    ///      State reads are limited to values set at/before deployment time.
    /// @param chain_id     Chain ID where the triggering event was emitted
    /// @param _contract    Contract that emitted the triggering event
    /// @param topic_0      Event topic 0 (event selector)
    /// @param topic_1      Event topic 1 (indexed param 1)
    /// @param topic_2      Event topic 2 (indexed param 2)
    /// @param topic_3      Event topic 3 (indexed param 3)
    /// @param data         Non-indexed event data (ABI-encoded)
    /// @param block_number Block number on the origin chain
    /// @param op_code      Operation code (0 = standard event, see RN docs for others)
    function react(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        uint256 topic_3,
        bytes calldata data,
        uint256 block_number,
        uint256 op_code
    ) external;
}
