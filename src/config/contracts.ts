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

  /** DCAStrategyCallback on Base Sepolia */
  dcaStrategyCallback: (process.env.DCA_STRATEGY_CALLBACK_ADDRESS ?? "") as Address,

  /** DCAStrategyReactive on Reactive Network */
  dcaStrategyReactive: (process.env.DCA_STRATEGY_REACTIVE_ADDRESS ?? "") as Address,
} as const;

// ── Aave Protocol addresses on Base Sepolia ──────────────────────────────────

export const AAVE_ADDRESSES = {
  LENDING_POOL: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27" as Address,
  PROTOCOL_DATA_PROVIDER: "0xBc9f5b7E248451CdD7cA54e717a2BFe1F32b566b" as Address,
  ADDRESSES_PROVIDER: "0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00" as Address,
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
  GOAT_TESTNET3: 48_816,
  // Mainnet
  REACTIVE: 1597,
  ETHEREUM: 1,
  BASE: 8453,
  GOAT_MAINNET: 2345,
} as const;

// ── GOAT Network (Bitcoin L2, BitVM2) ──────────────────────────────────────────
// See /goat-research for full findings. Key facts baked in here:
//
//  - Native gas token is BTC (18 decimals), not ETH — every `--value` in deploy
//    scripts and every funding-pipeline calculation needs re-denominating.
//  - Reactive Network does NOT support GOAT as an origin or destination chain
//    (verified against dev.reactive.network/origins-and-destinations). The
//    RC/CC pattern above cannot be pointed at GOAT as-is — see
//    goat-research/03-agentkit-and-technical-fit.md and
//    goat-research/06-automation-alternatives.md for the replacement pattern
//    (permissionless + bounty-incentivized functions, no privileged caller).
//  - GoatSwap and BIMA turned out to be mainnet-only — verified directly
//    against the Testnet3 explorer, not assumed (goat-research finding 4).
//    So the DCA product's swap venue on Testnet3 is our own real Uniswap V3
//    Core deployment (src/contracts/goat/), not GoatSwap's. Deployed and
//    swap-tested end-to-end 2026-08-01 — see
//    goat-research/07-testnet3-deployment.md for the full record, tx
//    hashes, and the gas-estimation gotcha hit along the way.

export const GOAT_NETWORK = {
  testnet3: {
    chainId: CHAIN_IDS.GOAT_TESTNET3,
    rpcUrl: "https://rpc.testnet3.goat.network",
    rpcBackup: "https://rpc.ankr.com/goat_testnet",
    explorer: "https://explorer.testnet3.goat.network",
    bridge: "https://bridge.testnet3.goat.network",
    faucet: "https://bridge.testnet3.goat.network/faucet",
    nativeCurrency: "BTC",
  },
  mainnet: {
    chainId: CHAIN_IDS.GOAT_MAINNET,
    rpcUrl: "https://rpc.goat.network",
    rpcBackup: "https://rpc.ankr.com/goat_mainnet",
    archiveRpcUrl: "https://archive.goat.network",
    explorer: "https://explorer.goat.network",
    bridge: "https://bridge.goat.network",
    nativeCurrency: "BTC",
  },
} as const;

/** GOAT Testnet3's canonical wrapped-native predeploy — same address as mainnet, confirmed live. */
export const WGBTC_TESTNET3 = "0xbC10000000000000000000000000000000000000" as Address;

// Live on GOAT Testnet3, deployed 2026-08-01 — see goat-research/07-testnet3-deployment.md.
// GoatSwap/BIMA have no Testnet3 deployment to point at (verified, not assumed), so this is
// our own real Uniswap V3 Core (unmodified lib/v3-core) + a minimal permissionless-execution
// DCA contract, not a placeholder.
export const GOAT_TESTNET3_CONTRACTS = {
  uniswapV3Factory: "0x481294586d888EA5E409cd9719E79308c5996775" as Address,
  demoUsdcWgbtcPool: "0x2e99414793de595ad6cdcc1aa0dfc6b33c1bce36" as Address,
  demoUsdc: "0xF35b99BaE312FD59145F5eBE4482fD433d1C7E20" as Address,
  miniSwapRouter: "0xB38E85B614EF50E2A60c9F4781A1b128f0fB7246" as Address,
  liquidityHelper: "0x5f474dB0470e7102072517b0991e487Dd785cA4F" as Address,
  dcaStrategyCallbackGoat: "0xd630cf0E2e9bcB0d76c25Eb87C1cBE9e3eDFdad7" as Address,
} as const;

// Aave-equivalent (liquidation protection) not yet built — BIMA's Testnet3 presence is
// unconfirmed beyond two mock-token contracts, needs direct verification first. See
// goat-research/05-migration-plan.md.
export const GOAT_PROTOCOL_ADDRESSES = {
  bimaMarket: (process.env.BIMA_MARKET_ADDRESS ?? "") as Address,
} as const;

// ── Faucets (send ETH, receive lREACT — max 5 ETH/tx) ────────────────────────

export const FAUCETS = {
  sepolia: "0x9b9BB25f1A81078C544C829c5EB7822d747Cf434" as Address,
  baseSepolia: "0x2afaFD298b23b62760711756088F75B7409f5967" as Address,
} as const;
