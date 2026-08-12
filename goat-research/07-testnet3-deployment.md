# GOAT Testnet3 — live deployment record

Deployed and verified end-to-end 2026-08-01. This is not a plan — every address below is a real, live contract on GOAT Testnet3 (chain ID `48816`), and a real DCA swap has already executed through the full pipeline on-chain.

## What this proves

The [[05-migration-plan]] recommendation (deploy our own Uniswap-V3-shaped pool on Testnet3, since GoatSwap is mainnet-only — [[03-agentkit-and-technical-fit]] finding 4) is no longer a plan, it's done. And the [[06-automation-alternatives]] permissionless-plus-bounty pattern is no longer a proposal — `DCAStrategyCallbackGoat.executeDCAOrders()` has no access-control modifier at all, was called with a plain wallet, and executed a real swap. No Reactive Network, no privileged relay.

## Deployed contracts (GOAT Testnet3, chain ID 48816)

| Contract | Address | Notes |
|---|---|---|
| UniswapV3Factory | `0x481294586d888EA5E409cd9719E79308c5996775` | Unmodified `lib/v3-core` (Uniswap's own audited source), compiled with the canonical deployment settings (solc 0.7.6, optimizer runs=200, istanbul) — see `[profile.v3core]` in `foundry.toml` |
| WGBTC/dUSDC Pool | `0x2e99414793de595ad6cdcc1aa0dfc6b33c1bce36` | Fee tier 3000 (0.3%), created via the factory, unmodified `UniswapV3Pool` |
| DemoUSDC (dUSDC) | `0xF35b99BaE312FD59145F5eBE4482fD433d1C7E20` | Testnet-only mintable ERC20 stand-in for USDC (6 decimals) — see `src/contracts/goat/DemoUSDC.sol`. GoatSwap/BIMA don't have testnet3 deployments to piggyback real tokens off of ([[03-agentkit-and-technical-fit]]) |
| MiniSwapRouter | `0xB38E85B614EF50E2A60c9F4781A1b128f0fB7246` | `src/contracts/goat/MiniSwapRouter.sol` — thin `exactInputSingle` wrapper against the real pool, same interface shape as the existing `DCAStrategyCallback.sol` already expects |
| LiquidityHelper | `0x5f474dB0470e7102072517b0991e487Dd785cA4F` | `src/contracts/goat/LiquidityHelper.sol` — deployer-only, one-shot liquidity seeding tool (avoids pulling in v3-periphery's NFT-position-manager machinery) |
| DCAStrategyCallbackGoat | `0xd630cf0E2e9bcB0d76c25Eb87C1cBE9e3eDFdad7` | `src/contracts/goat/DCAStrategyCallbackGoat.sol` — the permissionless+bounty automation contract |

WGBTC (GOAT's canonical wrapped-native predeploy) at `0xbC10000000000000000000000000000000000000` — confirmed live on Testnet3 with real bytecode, same address as mainnet, no separate deployment needed.

Pool seeded with real liquidity: 450,000,000 units (full-range position, ticks -887220 to 887220), funded with wrapped tBTC and minted dUSDC from the deployer wallet. Pool `liquidity()` reads back `450000000` on-chain.

## The end-to-end test

1. Created DCA config #0: `user=deployer, tokenIn=dUSDC, tokenOut=WGBTC, amountPerSwap=1 dUSDC, poolFee=3000, totalSwaps=1`. Tx `0x150a1e30eaa2366994c4a1d6c9d2a5e6e3bb6efc3af04d36c156398e3667b262`.
2. Called `executeDCAOrders()` from the same plain EOA that deployed everything — **no owner check, no callback-proxy check, nothing gates this call**. Tx `0x21621fe206697ece337deb29b68c837850d3e1663a07018889eed94cd5e06956`.
3. On-chain result: `DCASwapExecuted` fired (1 dUSDC in, real WGBTC out through the actual pool), `DCAConfigCompleted` fired, config #0 now reads `status: Completed, swapsExecuted: 1` directly from `dcaConfigs(0)`.
4. WGBTC balance of the deployer increased by the swap output — verified via `balanceOf` before/after, not just event logs.

## A real gotcha hit and fixed along the way

The first `executeDCAOrders()` attempt failed silently (caught by the contract's own `try/catch`, emitted `DCASwapFailed("Unexpected error during DCA swap")`) even though every precondition was correct. Root cause: `cast send` without an explicit `--gas-limit` calls `eth_estimateGas`, and this contract's `try this._executeDCASwap(i)` pattern means the *outer* call succeeds even when the *inner* swap fails — so gas estimation can converge on a limit that's enough for the outer call to not revert, but not enough for the inner swap to actually complete, and the failure gets silently swallowed by the try/catch exactly as designed (that's the point of the try/catch — one failing config shouldn't block others). Fixed by passing an explicit `--gas-limit`.

**This is a real production concern, not just a test-script quirk**: `src/server/chain.ts` calls contract functions today without always setting explicit gas limits. Before wiring GOAT into the live server, audit every write call that goes through a `try/catch`-wrapped contract function (this one, and the equivalent Aave-protection function once it exists) and set explicit gas limits rather than trusting `eth_estimateGas`.

## Cost

Total spend across factory deploy, pool creation, 4 more contract deploys, liquidity seeding, token minting/wrapping, config creation, and two `executeDCAOrders()` attempts (one failed, one succeeded): **~5.2 microBTC** (from ~18 microBTC funded via two faucet claims down to ~12.8 microBTC remaining). Testnet3 gas is currently ~0.00013 gwei — three orders of magnitude cheaper than the UI's "<0.1 Gwei" headline figure suggested.

## Reproducing / extending this

- Deployer wallet: `0xA1c4B6BA4C4c1DE524dF0119523cd86BEDaCE4eC` (testnet-only key, in local `.env`, gitignored — do not reuse for anything real)
- To rebuild v3-core with the right settings: `FOUNDRY_PROFILE=v3core forge build`
- All addresses above are also in `.env` under `FACTORY_ADDRESS`, `DEMO_USDC_ADDRESS`, `POOL_ADDRESS`, `MINI_SWAP_ROUTER_ADDRESS`, `LIQUIDITY_HELPER_ADDRESS`, `DCA_CALLBACK_ADDRESS`, and mirrored into `src/config/contracts.ts`

## What's still open

- **Aave-equivalent (liquidation protection) is not built yet.** Per [[05-migration-plan]], BIMA's Testnet3 presence is unconfirmed beyond two mock-token contracts — needs the same direct-verification treatment this DCA product just got before writing `AaveProtectionCallbackGoat.sol`.
- **The bounty pool is unfunded** (`executionBounty` was deployed at `0`). The contract supports it (`receive()` accepts funding, `setExecutionBounty` is owner-settable) but nothing has tested a real non-owner, unincentivized caller executing it for profit — worth doing once there's a second wallet in play, to make the "genuinely permissionless" claim fully demonstrated rather than just true-by-construction.
- **Server wiring** (`src/server/`) still points entirely at Base Sepolia / Reactive Network. None of this is live behind the x402 API yet — that's the next real chunk of work.

## Related
[[01-goat-network-overview]] · [[03-agentkit-and-technical-fit]] · [[05-migration-plan]] · [[06-automation-alternatives]]
