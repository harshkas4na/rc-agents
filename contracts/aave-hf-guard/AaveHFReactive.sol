// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IReactive.sol";
import "../interfaces/ISubscriptionService.sol";

// ────────────────────────────────────────────────────────────────────────────
// AaveHFReactive — Aave Health Factor Guard (Reactive Contract)
//
// Deployed on: Reactive Network / Kopli (chain 5318008)
// Purpose:     Fires periodic runCycle() callbacks to AaveHFCallback on
//              Base Sepolia. Also fires immediately when a new subscription
//              is registered.
//
// Stateless design:
//   This RC does NOT store per-user thresholds. It fires blindly on every
//   CRON tick and delegates all filtering to the CC. This is required because
//   react() cannot read state written after deployment.
//
// Constructor params (not hardcoded):
//   - callbackContract: AaveHFCallback address on Base Sepolia
//   - cronTicker:       Kopli CRON ticker address (varies by tick interval)
//   - callbackGasLimit: Gas budget for runCycle() on Base Sepolia
// ────────────────────────────────────────────────────────────────────────────

contract AaveHFReactive is IReactive {
    // ── Reactive Network constants ────────────────────────────────────────────
    address private constant RN_SUBSCRIPTION_SERVICE = 0x9b9BB25f1A81078C544C829c5EB7822d747Cf434;
    uint256 private constant REACTIVE_CHAIN_ID = 5318008;
    uint256 private constant BASE_SEPOLIA_CHAIN_ID = 84532;

    // ── Event selectors ───────────────────────────────────────────────────────
    /// @dev keccak256("SubscriptionRegistered(uint256,address,address,uint256,uint256)")
    ///      Must match AaveHFCallback's event signature exactly.
    uint256 private constant TOPIC_REGISTERED =
        uint256(keccak256("SubscriptionRegistered(uint256,address,address,uint256,uint256)"));

    // ── Immutable config (set at construction, readable in react()) ───────────
    address public immutable callbackContract;
    address public immutable cronTicker;
    uint64  public immutable callbackGasLimit;
    address public immutable owner;

    // ── Constructor ───────────────────────────────────────────────────────────
    /// @param _callbackContract  AaveHFCallback address on Base Sepolia.
    /// @param _cronTicker        CRON ticker contract on Kopli.
    ///                           Get this from https://dev.reactive.network/docs/cron
    /// @param _callbackGasLimit  Gas to allocate for runCycle() callback delivery.
    ///                           2_000_000 is safe for ~200 active subscriptions.
    constructor(
        address _callbackContract,
        address _cronTicker,
        uint64 _callbackGasLimit
    ) payable {
        require(_callbackContract != address(0), "Zero callback");
        require(_cronTicker != address(0), "Zero cron");
        require(_callbackGasLimit >= 500_000, "Gas limit too low");

        callbackContract = _callbackContract;
        cronTicker = _cronTicker;
        callbackGasLimit = _callbackGasLimit;
        owner = msg.sender;

        ISubscriptionService svc = ISubscriptionService(RN_SUBSCRIPTION_SERVICE);

        // 1. Watch for new registrations on Base Sepolia
        svc.subscribe{value: msg.value / 2}(
            BASE_SEPOLIA_CHAIN_ID,
            _callbackContract,
            TOPIC_REGISTERED,
            0, 0, 0, // any indexed params
            0         // standard subscription type
        );

        // 2. Watch CRON ticker for periodic health-check cycles
        svc.subscribe{value: msg.value / 2}(
            REACTIVE_CHAIN_ID,
            _cronTicker,
            0, 0, 0, 0, // match all events from ticker
            0
        );
    }

    // ── IReactive ─────────────────────────────────────────────────────────────

    /// @inheritdoc IReactive
    function react(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256, // topic_1
        uint256, // topic_2
        uint256, // topic_3
        bytes calldata, // data
        uint256, // block_number
        uint256  // op_code
    ) external override {
        // ── New subscription registered → immediate check ─────────────────
        if (
            chain_id == BASE_SEPOLIA_CHAIN_ID &&
            _contract == callbackContract &&
            topic_0 == TOPIC_REGISTERED
        ) {
            emit Callback(
                BASE_SEPOLIA_CHAIN_ID,
                callbackContract,
                callbackGasLimit,
                abi.encodeWithSignature("runCycle()")
            );
            return;
        }

        // ── CRON tick → periodic cycle ────────────────────────────────────
        if (chain_id == REACTIVE_CHAIN_ID && _contract == cronTicker) {
            emit Callback(
                BASE_SEPOLIA_CHAIN_ID,
                callbackContract,
                callbackGasLimit,
                abi.encodeWithSignature("runCycle()")
            );
            return;
        }
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    receive() external payable {}

    function withdraw() external {
        require(msg.sender == owner, "Not owner");
        payable(owner).transfer(address(this).balance);
    }
}
