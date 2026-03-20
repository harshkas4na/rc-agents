// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ────────────────────────────────────────────────────────────────────────────
// AaveHFCallback — Aave Health Factor Guard (Callback Contract)
//
// Deployed on: Base Sepolia (chain 84532)
// Purpose:     Single-service CC that monitors Aave health factors and
//              supplies collateral when they drop below a subscriber's
//              chosen threshold.
//
// Design:
//   - One Subscription struct with ONLY HF-guard-relevant fields
//   - Compact activeIds array with O(1) swap-and-pop removal
//   - try-catch around every Aave call so one bad user can't kill the cycle
//   - Allowance check at registration time (fail fast, not fail silent)
// ────────────────────────────────────────────────────────────────────────────

interface IAavePool {
    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );

    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract AaveHFCallback {
    // ── Constants ─────────────────────────────────────────────────────────────
    /// @dev Aave V3 Pool on Base Sepolia. Change for mainnet deployment.
    address public constant AAVE_POOL = 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;

    // ── State ─────────────────────────────────────────────────────────────────
    address public owner;
    address public reactiveNetworkSender;

    struct Subscription {
        address agent;            // Wallet that paid via x402; holds collateral approval
        address protectedUser;    // Aave user whose HF is monitored
        address collateralAsset;  // ERC-20 to supply on trigger (e.g. WETH)
        uint256 threshold;        // HF threshold in WAD (1.5 HF = 1.5e18)
        uint256 collateralAmount; // Amount to supply per trigger (in token decimals)
        uint256 expiresAt;        // Unix timestamp
        bool    active;
    }

    uint256 public nextId;
    mapping(uint256 => Subscription) public subscriptions;

    /// @dev Compact array of active subscription IDs.
    ///      Expired/cancelled entries are swap-and-popped so the array
    ///      only ever contains IDs that need checking.
    uint256[] public activeIds;
    mapping(uint256 => uint256) internal _activeIndex; // subId → index in activeIds

    // ── Events ────────────────────────────────────────────────────────────────
    event SubscriptionRegistered(
        uint256 indexed id,
        address indexed agent,
        address indexed protectedUser,
        uint256 threshold,
        uint256 expiresAt
    );

    event SubscriptionExpired(uint256 indexed id);

    event ProtectionTriggered(
        uint256 indexed id,
        address indexed protectedUser,
        uint256 healthFactor
    );

    /// @dev Emitted when Aave reverts for a specific user. Non-fatal.
    event HealthCheckFailed(uint256 indexed id, address indexed protectedUser);

    event CycleCompleted(uint256 checked, uint256 triggered, uint256 expired);

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == reactiveNetworkSender || msg.sender == owner,
            "Not authorized"
        );
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    /// @param _reactiveNetworkSender  Address of the Reactive Network relayer
    ///        that delivers callbacks on this chain. Verify from RN docs.
    constructor(address _reactiveNetworkSender) {
        owner = msg.sender;
        reactiveNetworkSender = _reactiveNetworkSender;
    }

    // ── Registration ──────────────────────────────────────────────────────────

    /// @notice Register a new HF guard subscription.
    /// @dev    Called by the server (owner) after confirming x402 USDC payment.
    ///         Reverts if the agent has not approved enough collateral — this is
    ///         intentional: fail at registration, not at trigger time.
    function register(
        address agent,
        address protectedUser,
        address collateralAsset,
        uint256 threshold,
        uint256 collateralAmount,
        uint256 duration
    ) external onlyOwner returns (uint256 id) {
        require(agent != address(0), "Zero agent");
        require(protectedUser != address(0), "Zero user");
        require(collateralAsset != address(0), "Zero asset");
        require(threshold > 0, "Zero threshold");
        require(duration > 0 && duration <= 30 days, "Bad duration");
        require(collateralAmount > 0, "Zero collateral amount");

        // Fail-fast: agent must have pre-approved this contract
        require(
            IERC20(collateralAsset).allowance(agent, address(this)) >= collateralAmount,
            "Insufficient collateral approval"
        );

        id = nextId++;
        uint256 expiresAt = block.timestamp + duration;

        subscriptions[id] = Subscription({
            agent: agent,
            protectedUser: protectedUser,
            collateralAsset: collateralAsset,
            threshold: threshold,
            collateralAmount: collateralAmount,
            expiresAt: expiresAt,
            active: true
        });

        // Add to compact active set
        _activeIndex[id] = activeIds.length;
        activeIds.push(id);

        emit SubscriptionRegistered(id, agent, protectedUser, threshold, expiresAt);
    }

    // ── Reactive Network callback ─────────────────────────────────────────────

    /// @notice Run one protection cycle. Called by the Reactive Network relayer
    ///         (via ServiceReactive emitting a Callback event) or by the owner
    ///         for testing.
    /// @dev    Iterates backwards so swap-and-pop doesn't skip elements.
    ///         Each Aave call is wrapped in try-catch — one reverting user
    ///         cannot block checks for all other users.
    function runCycle() external onlyAuthorized {
        uint256 checked;
        uint256 triggered;
        uint256 expired;

        uint256 i = activeIds.length;
        while (i > 0) {
            i--;
            uint256 subId = activeIds[i];
            Subscription storage sub = subscriptions[subId];

            // ── Expire stale subscriptions ────────────────────────────────
            if (block.timestamp >= sub.expiresAt) {
                _deactivate(subId, i);
                expired++;
                emit SubscriptionExpired(subId);
                continue;
            }

            // ── Check health factor ───────────────────────────────────────
            try IAavePool(AAVE_POOL).getUserAccountData(sub.protectedUser)
                returns (uint256, uint256, uint256, uint256, uint256, uint256 hf)
            {
                checked++;

                // type(uint256).max = no borrows (safe), 0 = unexpected
                if (hf == type(uint256).max || hf == 0) continue;

                if (hf < sub.threshold) {
                    bool ok = _executeProtection(sub);
                    if (ok) {
                        triggered++;
                        emit ProtectionTriggered(subId, sub.protectedUser, hf);
                    } else {
                        // Can't pull collateral — deactivate to stop wasting gas
                        _deactivate(subId, i);
                        expired++;
                        emit SubscriptionExpired(subId);
                    }
                }
            } catch {
                // Aave might be paused, oracle stale, etc. — log and move on
                emit HealthCheckFailed(subId, sub.protectedUser);
            }
        }

        emit CycleCompleted(checked, triggered, expired);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _executeProtection(Subscription storage sub) internal returns (bool) {
        IERC20 token = IERC20(sub.collateralAsset);

        // Re-check allowance (agent might have revoked since registration)
        if (token.allowance(sub.agent, address(this)) < sub.collateralAmount) {
            return false;
        }

        // Pull collateral from agent wallet
        try token.transferFrom(sub.agent, address(this), sub.collateralAmount)
            returns (bool ok)
        {
            if (!ok) return false;
        } catch {
            return false;
        }

        // Supply to Aave on behalf of the protected user
        token.approve(AAVE_POOL, sub.collateralAmount);
        IAavePool(AAVE_POOL).supply(
            sub.collateralAsset,
            sub.collateralAmount,
            sub.protectedUser,
            0
        );

        return true;
    }

    /// @dev Swap-and-pop: move the last element into `index`, then pop.
    ///      O(1) removal that keeps activeIds compact.
    function _deactivate(uint256 subId, uint256 index) internal {
        subscriptions[subId].active = false;

        uint256 lastIndex = activeIds.length - 1;
        if (index != lastIndex) {
            uint256 lastId = activeIds[lastIndex];
            activeIds[index] = lastId;
            _activeIndex[lastId] = index;
        }
        activeIds.pop();
        delete _activeIndex[subId];
    }

    // ── User-facing ───────────────────────────────────────────────────────────

    function cancelSubscription(uint256 id) external {
        Subscription storage sub = subscriptions[id];
        require(sub.active, "Not active");
        require(msg.sender == sub.agent || msg.sender == owner, "Unauthorized");

        uint256 index = _activeIndex[id];
        _deactivate(id, index);
        emit SubscriptionExpired(id);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function updateReactiveNetworkSender(address newSender) external onlyOwner {
        reactiveNetworkSender = newSender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function activeSubscriptionCount() external view returns (uint256) {
        return activeIds.length;
    }

    function getSubscription(uint256 id) external view returns (Subscription memory) {
        return subscriptions[id];
    }

    function getActiveIds() external view returns (uint256[] memory) {
        return activeIds;
    }

    receive() external payable {}
}
