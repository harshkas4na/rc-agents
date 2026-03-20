/**
 * AaveHFCallback ABI — Callback Contract on Base Sepolia
 *
 * This is the EXPECTED interface. Update after deploying the actual CC.
 *
 * The CC inherits AbstractCallback (from reactive-lib). Key patterns:
 *   - Callback-target functions receive `address sender` as first param
 *     (injected by the Reactive Network system — it's the RC address)
 *   - `authorizedSenderOnly` modifier on callback-target functions
 *   - `register()` is called by the server (owner), NOT via callback
 *   - `runCycle()` is called via callback from the RC
 *
 * When you deploy the real contract, either:
 *   a) Paste the compiled ABI JSON here, OR
 *   b) Keep this human-readable ABI if the function signatures match
 */

import { parseAbi } from "viem";

export const AAVE_HF_CALLBACK_ABI = parseAbi([
  // ── Owner-called (server registers after x402 payment) ──────────────────
  "function register(address agent, address protectedUser, address collateralAsset, uint256 threshold, uint256 collateralAmount, uint256 duration) external returns (uint256 id)",

  // ── Callback-target (called by RC via Reactive Network) ─────────────────
  // Note: if your CC uses AbstractCallback with `address sender` first param,
  // the actual on-chain signature is: runCycle(address sender)
  // But the RC encodes just: runCycle() — the system prepends sender.
  "function runCycle() external",

  // ── User-facing ─────────────────────────────────────────────────────────
  "function cancelSubscription(uint256 id) external",

  // ── Views ───────────────────────────────────────────────────────────────
  "function getSubscription(uint256 id) external view returns (address agent, address protectedUser, address collateralAsset, uint256 threshold, uint256 collateralAmount, uint256 expiresAt, bool active)",
  "function activeSubscriptionCount() external view returns (uint256)",
  "function getActiveIds() external view returns (uint256[])",
  "function paused() external view returns (bool)",
  "function owner() external view returns (address)",

  // ── Admin ───────────────────────────────────────────────────────────────
  "function pause() external",
  "function unpause() external",

  // ── Events ──────────────────────────────────────────────────────────────
  "event SubscriptionRegistered(uint256 indexed id, address indexed agent, address indexed protectedUser, uint256 threshold, uint256 expiresAt)",
  "event SubscriptionExpired(uint256 indexed id)",
  "event ProtectionTriggered(uint256 indexed id, address indexed protectedUser, uint256 healthFactor)",
  "event HealthCheckFailed(uint256 indexed id, address indexed protectedUser)",
  "event CycleCompleted(uint256 checked, uint256 triggered, uint256 expired)",
]);

/** keccak256 of SubscriptionRegistered event — used for log parsing */
export const SUBSCRIPTION_REGISTERED_TOPIC = "0x" + "SubscriptionRegistered(uint256,address,address,uint256,uint256)";
