# GOAT Network research — rc-agents pivot

Research for applying to GOAT Network's AI Agent Builder Grants Program with rc-agents. Written 2026-08-01.

| File | Contents |
|---|---|
| [`01-goat-network-overview.md`](./01-goat-network-overview.md) | Chain architecture (BitVM2 Bitcoin L2), network params, dev tooling |
| [`02-ai-builder-grants-program.md`](./02-ai-builder-grants-program.md) | Grant tiers, application process, what GOAT is actually funding |
| [`03-agentkit-and-technical-fit.md`](./03-agentkit-and-technical-fit.md) | **Read this first for the technical decision.** Reactive Network doesn't reach GOAT (blocker); GOAT's own AgentKit ships x402 + ERC-8004 natively (opportunity); no confirmed Aave on GOAT |
| [`04-veridex-comparable.md`](./04-veridex-comparable.md) | The closest recent grantee — what GOAT rewarded and why |
| [`05-migration-plan.md`](./05-migration-plan.md) | The actual build plan and the architecture decision it hinges on |
| [`06-automation-alternatives.md`](./06-automation-alternatives.md) | No Chainlink Automation / Gelato on GOAT yet — the permissionless-plus-bounty pattern (already proven by BIMA on GOAT) that replaces Reactive Network without losing "audited contracts, no trusted off-chain party" |
| [`07-testnet3-deployment.md`](./07-testnet3-deployment.md) | **Live, not a plan.** Real Uniswap V3 Core + a permissionless DCA contract deployed on GOAT Testnet3, swap-tested end-to-end on-chain, 2026-08-01. Addresses, tx hashes, a real gas-estimation gotcha and its fix |

## tl;dr

rc-agents is currently live and working (confirmed 2026-08-01, not down as assumed). The blocker to a GOAT port isn't the chain — Foundry/viem/EVM tooling all work unmodified — it's that **Reactive Network, rc-agents' automation layer, doesn't support GOAT as a destination chain.** GOAT does, however, ship its own agent framework (AgentKit) with x402 and ERC-8004 built in, which the grant program explicitly wants builders using.

The DCA product is now actually deployed on GOAT Testnet3 ([`07-testnet3-deployment.md`](./07-testnet3-deployment.md)): a real Uniswap V3 Core pool (GoatSwap turned out to be mainnet-only, verified on-chain, so we deployed our own) and a `DCAStrategyCallbackGoat` contract whose execution function is genuinely permissionless — no Reactive Network, no privileged relay, callable by anyone, tested end-to-end with a real swap. Liquidation protection (the Aave-equivalent) is the remaining product to build; the server (`src/server/`) still needs wiring to point at GOAT instead of Base Sepolia.
