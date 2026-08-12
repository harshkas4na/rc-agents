"use strict";
/**
 * DCAStrategyCallbackGoat ABI — GOAT Testnet3, no Reactive Network dependency.
 *
 * Unlike the Base Sepolia version, executeDCAOrders() is genuinely
 * permissionless — no callback-proxy check, callable by anyone, pays a
 * bounty (if funded) to whoever triggers a successful swap. See
 * /goat-research/06-automation-alternatives.md and
 * /goat-research/07-testnet3-deployment.md.
 *
 * createDCAConfig() is still owner-only — the server wallet must be the
 * contract owner (it is; same wallet that deployed it).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DCA_STRATEGY_CALLBACK_GOAT_ABI = void 0;
const viem_1 = require("viem");
exports.DCA_STRATEGY_CALLBACK_GOAT_ABI = (0, viem_1.parseAbi)([
    // ── Owner-called (server creates/manages configs after x402 payment) ──
    "function createDCAConfig(address user, address tokenIn, address tokenOut, uint256 amountPerSwap, uint24 poolFee, uint256 totalSwaps, uint256 swapInterval, uint256 minAmountOut, uint256 duration) external returns (uint256)",
    "function pauseDCAConfig(uint256 configId) external",
    "function resumeDCAConfig(uint256 configId) external",
    "function cancelDCAConfig(uint256 configId) external",
    "function setExecutionBounty(uint256 _executionBounty) external",
    // ── Permissionless (anyone can call — this is the point) ──────────────
    "function executeDCAOrders() external returns (uint256 swapsExecuted)",
    // ── Views ───────────────────────────────────────────────────────────
    "function dcaConfigs(uint256) external view returns (uint256 id, address user, address tokenIn, address tokenOut, uint256 amountPerSwap, uint24 poolFee, uint256 totalSwaps, uint256 swapsExecuted, uint256 totalAmountOut, uint256 swapInterval, uint256 minAmountOut, uint8 status, uint256 createdAt, uint256 expiresAt, uint256 lastSwapAt, uint8 consecutiveFailures, uint256 lastAttemptAt)",
    "function getActiveConfigs() external view returns (uint256[])",
    "function getUserConfigs(address user) external view returns (uint256[])",
    "function getAllConfigs() external view returns (uint256[])",
    "function nextConfigId() external view returns (uint256)",
    "function executionBounty() external view returns (uint256)",
    "function owner() external view returns (address)",
    // ── Events ──────────────────────────────────────────────────────────
    "event DCAConfigCreated(uint256 indexed configId, address tokenIn, address tokenOut, uint256 amountPerSwap, uint24 poolFee, uint256 totalSwaps)",
    "event DCASwapExecuted(uint256 indexed configId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)",
    "event DCAConfigCompleted(uint256 indexed configId)",
    "event DCAConfigCancelled(uint256 indexed configId)",
    "event BountyPaid(address indexed executor, uint256 amount)",
]);
//# sourceMappingURL=dca-strategy-callback-goat.js.map