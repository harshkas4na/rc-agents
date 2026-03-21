/**
 * AaveProtectionCallback ABI — Callback Contract on Base Sepolia
 *
 * Inherits: AbstractCallback (from reactive-lib) + RescuableBase
 *
 * CRITICAL pattern: every function called via RC callback has `address` as
 * its FIRST parameter (the RVM ID sender slot). The RC passes address(0)
 * and the Reactive Network replaces it with the RVM ID at delivery time.
 *
 * The server (owner) manages configs on behalf of protectedUsers.
 */

import { parseAbi } from "viem";

export const AAVE_PROTECTION_CALLBACK_ABI = parseAbi([
  // ── Owner-called (server creates/manages configs after x402 payment) ──
  "function createProtectionConfig(address protectedUser, uint8 protectionType, uint256 healthFactorThreshold, uint256 targetHealthFactor, address collateralAsset, address debtAsset, bool preferDebtRepayment, uint256 duration) external returns (uint256)",

  // ── Callback target (called by RC via Reactive Network) ───────────────
  // address sender IS the first param (RVM ID slot, injected by RN)
  "function checkAndProtectPositions(address sender) external",

  // ── Config management (owner-only) ────────────────────────────────────
  "function pauseProtectionConfig(uint256 configId) external",
  "function resumeProtectionConfig(uint256 configId) external",
  "function cancelProtectionConfig(uint256 configId) external",

  // ── Views ─────────────────────────────────────────────────────────────
  "function getCurrentHealthFactor(address user) external view returns (uint256)",
  "function protectionConfigs(uint256) external view returns (uint256 id, address protectedUser, uint8 protectionType, uint256 healthFactorThreshold, uint256 targetHealthFactor, address collateralAsset, address debtAsset, bool preferDebtRepayment, uint8 status, uint256 createdAt, uint256 expiresAt, uint256 lastExecutedAt, uint8 executionCount, uint8 consecutiveFailures, uint256 lastExecutionAttempt)",
  "function getActiveConfigs() external view returns (uint256[])",
  "function getAllConfigs() external view returns (uint256[])",
  "function getAssetPrice(address asset) external view returns (uint256)",
  "function getUserProtection(address user) external view returns (bool isActive, uint8 protectionType, uint256 healthFactorThreshold, uint256 targetHealthFactor, address collateralAsset, address debtAsset, bool preferDebtRepayment)",
  "function owner() external view returns (address)",
  "function nextConfigId() external view returns (uint256)",

  // ── Events (RC subscribes to these) ───────────────────────────────────
  "event ProtectionConfigured(uint256 indexed configId, uint8 protectionType, uint256 healthFactorThreshold, uint256 targetHealthFactor, address collateralAsset, address debtAsset)",
  "event ProtectionExecuted(uint256 indexed configId, string protectionMethod, address asset, uint256 amount, uint256 previousHealthFactor, uint256 newHealthFactor)",
  "event ProtectionCheckFailed(uint256 indexed configId, string reason)",
  "event ProtectionPaused(uint256 indexed configId)",
  "event ProtectionResumed(uint256 indexed configId)",
  "event ProtectionCancelled(uint256 indexed configId)",
  "event ProtectionCycleCompleted(uint256 timestamp, uint256 totalConfigsChecked, uint256 protectionsExecuted)",
]);
