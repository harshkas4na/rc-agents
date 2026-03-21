/**
 * Deployed contract addresses and Reactive Network constants.
 *
 * CC must inherit AbstractCallback, use authorizedSenderOnly,
 * and have `address` as first param on all callback-target functions.
 *
 * RC must inherit AbstractPausableReactive, use react(LogRecord),
 * emit Callback(), and use self-callbacks for state persistence.
 */

import type { Address } from "viem";

// ── Deployed service contracts (set after deploy) ─────────────────────────────

export const CONTRACTS = {
  /** AaveProtectionCallback on Base Sepolia */
  aaveProtectionCallback: (process.env.AAVE_PROTECTION_CALLBACK_ADDRESS ?? "") as Address,

  /** AaveProtectionReactive on Reactive Network */
  aaveProtectionReactive: (process.env.AAVE_PROTECTION_REACTIVE_ADDRESS ?? "") as Address,
} as const;

// ── Aave Protocol addresses on Base Sepolia ──────────────────────────────────

export const AAVE_ADDRESSES = {
  LENDING_POOL: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951" as Address,
  PROTOCOL_DATA_PROVIDER: "0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac" as Address,
  ADDRESSES_PROVIDER: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D" as Address,
} as const;

// ── Callback Proxy addresses (delivers RC callbacks to CCs on each chain) ─────
// Pass these as `_callbackSender` when deploying CCs via AbstractCallback.

export const CALLBACK_PROXIES = {
  // Testnet
  baseSepolia: "0xa6eA49Ed671B8a4dfCDd34E36b7a75Ac79B8A5a6" as Address,
  sepolia: "0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA" as Address,
  // Mainnet
  base: "0x0D3E76De6bC44309083cAAFdB49A088B8a250947" as Address,
  ethereum: "0x1D5267C1bb7D8bA68964dDF3990601BDB7902D76" as Address,
  arbitrum: "0x4730c58FDA9d78f60c987039aEaB7d261aAd942E" as Address,
} as const;

// ── Reactive Network system addresses ─────────────────────────────────────────

/** System contract on RN (used for subscriptions + cron) */
export const SERVICE_ADDR = "0x0000000000000000000000000000000000FFFFFF" as Address;

/** Self-callback proxy on RN (for RC → RC state persistence callbacks) */
export const RN_CALLBACK_PROXY = "0x0000000000000000000000000000000000fffFfF" as Address;

// ── Cron topic hashes (protocol-defined, immutable) ───────────────────────────
// Subscribe to address(service) with one of these as topic_0.

export const CRON_TOPICS = {
  /** Every block (~7 seconds) */
  CRON_1: "0xf02d6ea5c22a71cffe930a4523fcb4f129be6c804db50e4202fb4e0b07ccb514",
  /** Every 10 blocks (~1 minute) */
  CRON_10: "0x04463f7c1651e6b9774d7f85c85bb94654e3c46ca79b0c16fb16d4183307b687",
  /** Every 100 blocks (~12 minutes) — default for HF guard */
  CRON_100: "0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70",
  /** Every 1000 blocks (~2 hours) */
  CRON_1000: "0xe20b31294d84c3661ddc8f423abb9c70310d0cf172aa2714ead78029b325e3f4",
  /** Every 10000 blocks (~28 hours) */
  CRON_10000: "0xd214e1d84db704ed42d37f538ea9bf71e44ba28bc1cc088b2f5deca654677a56",
} as const;

// ── Chain IDs ─────────────────────────────────────────────────────────────────

export const CHAIN_IDS = {
  // Testnet
  LASNA: 5_318_007,
  SEPOLIA: 11_155_111,
  BASE_SEPOLIA: 84_532,
  // Mainnet
  REACTIVE: 1597,
  ETHEREUM: 1,
  BASE: 8453,
} as const;

// ── Faucets (send ETH, receive lREACT — max 5 ETH/tx) ────────────────────────

export const FAUCETS = {
  sepolia: "0x9b9BB25f1A81078C544C829c5EB7822d747Cf434" as Address,
  baseSepolia: "0x2afaFD298b23b62760711756088F75B7409f5967" as Address,
} as const;
