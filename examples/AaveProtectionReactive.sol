// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ────────────────────────────────────────────────────────────────────────────
// AaveProtectionReactive.sol — Standalone reference / educational example
//
// Shows the complete pattern for one specialized service:
//   RC (Kopli) watches CRON ticks + new registrations
//   CC (Base Sepolia) checks HF, supplies collateral
//
// For production versions with swap-and-pop, try-catch, and allowance checks,
// see contracts/aave-hf-guard/AaveHFCallback.sol and AaveHFReactive.sol.
// ────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// PART 1: Reactive Contract (deployed on Kopli, chain 5318008)
// ═══════════════════════════════════════════════════════════════════════════

interface ISubscriptionService {
    function subscribe(
        uint256 chain_id, address _contract,
        uint256 topic_0, uint256 topic_1, uint256 topic_2, uint256 topic_3,
        uint256 _type
    ) external payable;
}

/// @title ExampleAaveRC
/// @notice Minimal RC that fires runCycle() on every CRON tick.
///
/// KEY INSIGHT: The RC is stateless. It does NOT know which users exist,
/// what their thresholds are, or which assets they hold. It just fires.
/// All filtering happens in the CC. This is required because react()
/// cannot read state written after deployment.
contract ExampleAaveRC {
    address private constant SERVICE = 0x9b9BB25f1A81078C544C829c5EB7822d747Cf434;
    uint256 private constant RN_CHAIN  = 5318008;
    uint256 private constant BASE_CHAIN = 84532;
    uint64  private constant GAS = 2_000_000;

    address public immutable callback;
    address public immutable owner;

    event Callback(uint256 indexed chain_id, address indexed _contract, uint64 indexed gas_limit, bytes payload);

    constructor(address _callback, address _cronTicker) payable {
        callback = _callback;
        owner = msg.sender;

        ISubscriptionService svc = ISubscriptionService(SERVICE);

        // Watch new registrations → trigger immediate cycle
        svc.subscribe{value: msg.value / 2}(
            BASE_CHAIN, _callback,
            uint256(keccak256("SubscriptionRegistered(uint256,address,address,uint256,uint256)")),
            0, 0, 0, 0
        );

        // Watch CRON ticker → periodic cycles
        svc.subscribe{value: msg.value / 2}(RN_CHAIN, _cronTicker, 0, 0, 0, 0, 0);
    }

    function react(
        uint256 chain_id, address, uint256, uint256, uint256, uint256,
        bytes calldata, uint256, uint256
    ) external {
        // Fire on any matched event — both new-sub and CRON
        emit Callback(BASE_CHAIN, callback, GAS, abi.encodeWithSignature("runCycle()"));
    }

    receive() external payable {}
    function withdraw() external { require(msg.sender == owner); payable(owner).transfer(address(this).balance); }
}


// ═══════════════════════════════════════════════════════════════════════════
// PART 2: Callback Contract (deployed on Base Sepolia, chain 84532)
// ═══════════════════════════════════════════════════════════════════════════

interface IAavePool {
    function getUserAccountData(address user) external view returns (
        uint256, uint256, uint256, uint256, uint256, uint256 healthFactor
    );
    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external;
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title ExampleAaveCC
/// @notice Minimal CC that protects Aave health factors.
///
/// Flow:
///   1. Server calls register() after x402 payment confirmed
///   2. RC fires runCycle() every ~12 minutes via CRON
///   3. runCycle() iterates subscriptions, queries Aave, adds collateral if needed
contract ExampleAaveCC {
    address public constant AAVE_POOL = 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;
    address public owner;
    address public rnSender;

    struct Sub {
        address agent;           // who paid (holds the collateral approval)
        address user;            // whose HF to watch
        address asset;           // collateral to supply
        uint256 threshold;       // WAD (1.5e18 = HF 1.5)
        uint256 amount;          // how much to supply per trigger
        uint256 expiresAt;
        bool active;
    }

    uint256 public nextId;
    mapping(uint256 => Sub) public subs;
    uint256[] public activeIds;
    mapping(uint256 => uint256) internal _idx;

    event SubscriptionRegistered(uint256 indexed id, address indexed agent, address indexed user, uint256 threshold, uint256 expiresAt);
    event ProtectionTriggered(uint256 indexed id, address indexed user, uint256 hf);
    event CycleCompleted(uint256 checked, uint256 triggered, uint256 expired);

    constructor(address _rnSender) { owner = msg.sender; rnSender = _rnSender; }

    modifier auth() { require(msg.sender == rnSender || msg.sender == owner); _; }

    function register(
        address agent, address user, address asset,
        uint256 threshold, uint256 amount, uint256 duration
    ) external returns (uint256 id) {
        require(msg.sender == owner);
        // Fail-fast: verify collateral approval exists
        require(IERC20(asset).allowance(agent, address(this)) >= amount, "Approve first");

        id = nextId++;
        subs[id] = Sub(agent, user, asset, threshold, amount, block.timestamp + duration, true);
        _idx[id] = activeIds.length;
        activeIds.push(id);
        emit SubscriptionRegistered(id, agent, user, threshold, block.timestamp + duration);
    }

    function runCycle() external auth {
        uint256 checked; uint256 triggered; uint256 expired;
        uint256 i = activeIds.length;

        while (i > 0) {
            i--;
            uint256 sid = activeIds[i];
            Sub storage s = subs[sid];

            if (block.timestamp >= s.expiresAt) {
                s.active = false;
                _remove(sid, i);
                expired++;
                continue;
            }

            // try-catch: one bad Aave call can't kill the whole cycle
            try IAavePool(AAVE_POOL).getUserAccountData(s.user)
                returns (uint256, uint256, uint256, uint256, uint256, uint256 hf) {
                checked++;
                if (hf == type(uint256).max || hf == 0) continue;

                if (hf < s.threshold) {
                    if (_protect(s)) {
                        triggered++;
                        emit ProtectionTriggered(sid, s.user, hf);
                    } else {
                        s.active = false;
                        _remove(sid, i);
                        expired++;
                    }
                }
            } catch {}
        }

        emit CycleCompleted(checked, triggered, expired);
    }

    function _protect(Sub storage s) internal returns (bool) {
        IERC20 t = IERC20(s.asset);
        if (t.allowance(s.agent, address(this)) < s.amount) return false;
        try t.transferFrom(s.agent, address(this), s.amount) returns (bool ok) {
            if (!ok) return false;
        } catch { return false; }
        t.approve(AAVE_POOL, s.amount);
        IAavePool(AAVE_POOL).supply(s.asset, s.amount, s.user, 0);
        return true;
    }

    function _remove(uint256 sid, uint256 index) internal {
        uint256 last = activeIds.length - 1;
        if (index != last) {
            uint256 moved = activeIds[last];
            activeIds[index] = moved;
            _idx[moved] = index;
        }
        activeIds.pop();
        delete _idx[sid];
    }
}
