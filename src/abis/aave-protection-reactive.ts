/**
 * AaveProtectionReactive ABI — Reactive Contract on Reactive Network
 *
 * Inherits: AbstractPausableReactive (from reactive-lib)
 *
 * The RC is deployed on the Reactive Network. Its react(LogRecord) runs
 * in the ReactVM. State persistence happens via self-callbacks to
 * callbackOnly functions.
 *
 * This ABI is only needed if the server queries RC state directly.
 * Most interactions go through the CC.
 */

import { parseAbi } from "viem";

export const AAVE_PROTECTION_REACTIVE_ABI = parseAbi([
  "function owner() external view returns (address)",
  "function paused() external view returns (bool)",
  "function protectionCallback() external view returns (address)",
  "function cronTopic() external view returns (uint256)",
  "function activeConfigCount() external view returns (uint256)",
  "function cronSubscribed() external view returns (bool)",
  "function getActiveConfigs() external view returns (uint256[])",
]);
