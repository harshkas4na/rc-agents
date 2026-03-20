/**
 * Deployed contract addresses.
 *
 * TODO: Fill in after deploying the correct RC + CC via Foundry.
 *       See the reactive-network-dev skill for the correct contract patterns:
 *       - CC must inherit AbstractCallback, use authorizedSenderOnly,
 *         and have `address` as first param on all callback-target functions.
 *       - RC must inherit AbstractPausableReactive, use react(LogRecord),
 *         emit Callback(), and use self-callbacks for state persistence.
 */

import type { Address } from "viem";

export const CONTRACTS = {
  /** AaveHFCallback on Base Sepolia */
  aaveHFCallback: (process.env.AAVE_HF_CALLBACK_ADDRESS ?? "") as Address,

  /** AaveHFReactive on Reactive Network (Kopli testnet) */
  aaveHFReactive: (process.env.AAVE_HF_REACTIVE_ADDRESS ?? "") as Address,
} as const;

/**
 * Callback Proxy addresses per chain (delivers RC callbacks to CCs).
 * Pass these as `_callbackSender` when deploying CCs.
 */
export const CALLBACK_PROXIES = {
  baseSepolia: "0x0D3E76De6bC44309083cAAFdB49A088B8a250947" as Address,
  sepolia: "0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA" as Address,
} as const;
