# rc-agents → GOAT: migration plan

*Draft plan, not yet executed. Written 2026-08-01 from the research in this folder. Needs your sign-off on the architecture decision below before any code changes.*

## Starting facts (verified, not assumed)

- **rc-agents is not down.** `rc-agents.vercel.app/health` returns 200, the Aave Protection service is live and funded on Base Sepolia + Reactive Lasna, both testnets respond fine. Only `dcaStrategy` shows "not configured" — a stale/missing env var on Vercel, not a broken chain. The "probably down" assumption that started this thread was wrong; nothing needs reviving, it needs extending.
- **Reactive Network does not reach GOAT.** ([[03-agentkit-and-technical-fit]]) The RC/CC architecture — rc-agents' actual technical differentiator — has no path onto GOAT today. This is the one finding that changes everything downstream.
- **GOAT has its own agent-native stack** (AgentKit: x402 + ERC-8004 + on-chain actions, native OpenAI/LangChain/MCP tool export) that the grant program explicitly wants builders to use.
- **No confirmed Aave-equivalent on GOAT**; GoatSwap looks like a plausible Uniswap-V3-shaped target for the DCA product, unverified on Testnet3 specifically.
- Grant bar: live/demoable on **testnet is sufficient**, rolling basis, no deadline, $2,000 base grant with a $1M pool for high-traction apps. Recommended surface: backend + a read-only monitoring dashboard, not a consumer frontend.

## The architecture decision this plan turns on

Because Reactive Network can't reach GOAT, "port the contracts" is not actually an option — there is no autonomous on-chain trigger layer to port them *to*. Two real paths:

### Option A — Off-chain scheduler replaces the RC

Keep the CC-shaped contracts (config storage + execution logic) on GOAT, but replace "Reactive Contract on Lasna watching for events and firing CRON callbacks" with a lightweight scheduler in the existing Express server (`node-cron` or similar) that polls configs and calls the same `checkAndProtectPositions()` / `executeDCAOrders()` functions directly, on a timer, from off-chain.

- **Pro:** minimal rewrite — the CC Solidity is close to reusable, the server already has all the chain-interaction code in `chain.ts`.
- **Con:** loses the "no bots/keepers, pure on-chain automation" story that was rc-agents' actual pitch. It becomes "our server runs a cron job," which is a materially weaker technical claim and a worse fit for what made this project distinctive in the first place.

### Option B — Rebuild the automation loop on AgentKit itself (recommended)

Don't try to preserve the RSC pattern at all. Rebuild rc-agents as what GOAT's program is actually funding: **an AI agent, built on AgentKit, that other agents pay via x402 to hire.** The monitoring/execution loop runs as an actual agent process (using AgentKit's tool-calling surface against GOAT DeFi protocols — GoatSwap for swaps, a verified lending protocol for the Aave-equivalent), not as bare Solidity automation.

- **Pro:** this is exactly the shape the grant page describes ("agents that transact with other agents," "applications that pay for APIs or compute") and dogfoods GOAT's own SDK — which is the single strongest signal of "GOAT-native," per Emmanuel's advice to implement the GOAT protocol before applying.
- **Con:** a real rewrite of the automation layer, not a redeploy. The x402-payment-gated server shell, service catalog, and pricing model carry over close to as-is; the "how does protection actually execute" internals do not.

**Recommendation: Option B.** Option A preserves less of what actually matters (the on-chain-native automation story) while still requiring nearly as much new code (a scheduler, re-pointed contract calls, GOAT-specific gas handling in BTC). Option B costs a bit more but produces something that matches the grant thesis instead of merely running on the right chain ID.

This is a real fork in the road — flag if you want to weigh in before the build starts, otherwise I'll proceed on B.

## Concrete build sequence (Option B)

1. **Fix the live deployment first** (near-zero cost, unblocks nothing else but is an easy immediate win) — find why `DCA_STRATEGY_REACTIVE_ADDRESS` / related env vars are missing on Vercel and restore DCA service status to "live." Costs an hour, and "existing product still works end-to-end" is worth having true before a grant reviewer looks.
2. **Stand up on GOAT Testnet3**: wallet funded from the [faucet](https://bridge.testnet3.goat.network/faucet), `foundry.toml`/`hardhat.config` pointed at chain ID `48816` / `https://rpc.testnet3.goat.network`. Confirm gas is BTC-denominated end to end (deploy scripts, funding math in `bridge.ts` all assume ETH today).
3. **Scaffold AgentKit** (`defi` preset) alongside the existing Express server, not replacing it — the x402-gated HTTP layer (discovery, quote, pay, register) is the part of rc-agents that's already correct and matches what GOAT wants; keep it, swap what's underneath.
4. **Verified directly on-chain (2026-08-01): GoatSwap is mainnet-only, not on Testnet3** ([[03-agentkit-and-technical-fit]] finding 4). Its `SwapRouter02` has 48k+ real transactions on Alpha Mainnet but is an empty, undeployed address on Testnet3 — same for its predecessor deployment. **Plan of record: deploy a small Uniswap-V3-shaped pool on Testnet3 ourselves** for the DCA demo, the same move the original rc-agents made using Base Sepolia's testnet Uniswap V3 instance — no third party to wait on, fully in our control.
5. **BIMA ruled out as the Aave-equivalent (checked 2026-08-01, not just assumed).** Its own docs describe borrowing as "**permissioned** institutional borrowing with 160% over-collateralization" and explicitly "**no smart contract risk, with BTC collateral placed in qualified custody**" — i.e. permissioned/KYC'd institutional lending with off-chain custodial collateral, not an open on-chain money market. That's structurally wrong for this product twice over: an x402-paying AI agent can't get permissioned access, and "liquidation protection" needs a purely on-chain readable health factor to monitor — custodial collateral doesn't give you that. **Liquidation protection is deferred, not just phase-2-someday** — it needs a genuinely open, on-chain, permissionless lending protocol to appear on GOAT (mainnet or testnet) first. Worth rechecking the ecosystem periodically, not worth forcing a fit now. The DCA product (done, see [[07-testnet3-deployment]]) is the flagship GOAT demo.
6. **Replace the RC-side monitoring loop** with an AgentKit-driven agent process: same trigger logic (health factor / swap interval), executed via AgentKit tool calls instead of a Reactive Contract's `react()`.
7. **Ship the read-only monitoring dashboard** Emmanuel suggested — a trust/status surface for humans watching their agents' active configs, not a consumer product.
8. **Apply**: [tally.so/r/EkJo42](https://tally.so/r/EkJo42), credit `@ola_nuell` in the "where did you hear" field, demo on Testnet3.

## Open questions to resolve before coding starts

- Confirm GoatSwap's actual Testnet3 router address and whether it's a genuine Uniswap V3 fork (same interface) or V3-inspired-but-different.
- Confirm BIMA/bitSmiley expose an on-chain health-factor read comparable to Aave's `getUserAccountData`, or whether "liquidation protection" needs to be redefined for whatever GOAT-native mechanic actually exists.
- Decide the AgentKit scheduling cadence (Reactive's CRON_100 was ~12 min; that number was arbitrary to Lasna, not to the product) — pick something appropriate to an off-chain agent process instead of copying it forward unexamined.

## Related
[[01-goat-network-overview]] · [[02-ai-builder-grants-program]] · [[03-agentkit-and-technical-fit]] · [[04-veridex-comparable]]
