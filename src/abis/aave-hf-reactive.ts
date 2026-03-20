/**
 * AaveHFReactive ABI — Reactive Contract on Kopli
 *
 * The RC inherits AbstractPausableReactive (from reactive-lib). Key patterns:
 *   - react(LogRecord) instead of react(uint256, address, ...)
 *   - emit Callback() to trigger CC on destination chain
 *   - self-callbacks for state persistence across react() calls
 *
 * This ABI is only needed if the server queries RC state (e.g., paused status).
 * Most server interactions go through the CC, not the RC directly.
 */

import { parseAbi } from "viem";

export const AAVE_HF_REACTIVE_ABI = parseAbi([
  "function paused() external view returns (bool)",
  "function owner() external view returns (address)",
  "function callbackContract() external view returns (address)",
]);
