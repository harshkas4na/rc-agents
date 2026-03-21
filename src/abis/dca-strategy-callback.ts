/**
 * DCAStrategyCallback ABI — Callback Contract on Base Sepolia
 *
 * Inherits: AbstractCallback (from reactive-lib) + RescuableBase
 *
 * CRITICAL pattern: every function called via RC callback has `address` as
 * its FIRST parameter (the RVM ID sender slot). The RC passes address(0)
 * and the Reactive Network replaces it with the RVM ID at delivery time.
 *
 * The server (owner) manages configs on behalf of users (agent wallets).
 * createDCAConfig() is owner-only — the server wallet must be the CC owner.
 */

import { parseAbi } from "viem";

export const DCA_STRATEGY_CALLBACK_ABI = parseAbi([
  // ── Owner-called (server creates/manages configs after x402 payment) ──
  "function createDCAConfig(address user, address tokenIn, address tokenOut, uint256 amountPerSwap, uint24 poolFee, uint256 totalSwaps, uint256 swapInterval, uint256 minAmountOut, uint256 duration) external returns (uint256)",

  // ── Callback target (called by RC via Reactive Network) ───────────────
  // address sender IS the first param (RVM ID slot, injected by RN)
  "function executeDCAOrders(address sender) external",

  // ── Config management (owner-only) ─────────────────────────────────────
  "function pauseDCAConfig(uint256 configId) external",
  "function resumeDCAConfig(uint256 configId) external",
  "function cancelDCAConfig(uint256 configId) external",

  // ── Views ─────────────────────────────────────────────────────────────
  "function dcaConfigs(uint256) external view returns (uint256 id, address user, address tokenIn, address tokenOut, uint256 amountPerSwap, uint24 poolFee, uint256 totalSwaps, uint256 swapsExecuted, uint256 totalAmountOut, uint256 swapInterval, uint256 minAmountOut, uint8 status, uint256 createdAt, uint256 expiresAt, uint256 lastSwapAt, uint8 consecutiveFailures, uint256 lastAttemptAt)",
  "function getActiveConfigs() external view returns (uint256[])",
  "function getAllConfigs() external view returns (uint256[])",
  "function getUserConfigs(address user) external view returns (uint256[])",
  "function owner() external view returns (address)",
  "function swapRouter() external view returns (address)",
  "function nextConfigId() external view returns (uint256)",

  // ── Events (RC subscribes to these) ───────────────────────────────────
  "event DCAConfigCreated(uint256 indexed configId, address tokenIn, address tokenOut, uint256 amountPerSwap, uint24 poolFee, uint256 totalSwaps)",
  "event DCASwapExecuted(uint256 indexed configId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)",
  "event DCAConfigCompleted(uint256 indexed configId)",
  "event DCAConfigCancelled(uint256 indexed configId)",
  "event DCAConfigPaused(uint256 indexed configId)",
  "event DCAConfigResumed(uint256 indexed configId)",
  "event DCACycleCompleted(uint256 timestamp, uint256 totalConfigsChecked, uint256 swapsExecuted)",
  "event DCASwapFailed(uint256 indexed configId, string reason)",
]);
