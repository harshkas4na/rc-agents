# Real on-chain automation without Reactive Network

Direct answer to: *"for real on-chain automation with audited contracts only, they need Reactive Network — unless you can suggest another solution?"*

## Checked the two obvious candidates — neither covers GOAT

- **Chainlink Automation**: current supported-network list (per [Chainlink docs](https://docs.chain.link/chainlink-automation/overview/supported-networks) and the Q1/Q2 2026 quarterly reviews) covers 17 chains — Arbitrum, BNB, Celo, Cronos, Ethereum, Gnosis, Linea, Mantle, MegaETH, Plasma, Scroll, Solana, Sonic, Unichain, X Layer, etc. **GOAT Network is not on it.**
- **Gelato Network**: supported chains are Ethereum, Arbitrum, Optimism, Polygon, Avalanche, Base, zkSync and similar majors. **No confirmed GOAT Network support** — one search result vaguely mentioned "GOAT is integrated for cross-chain operations" in the context of an ElizaOS agent-tooling blog post, but that's agent-framework integration, not Gelato's keeper network running on GOAT specifically. Treat as unconfirmed, not a lead.

GOAT's BitVM2 Testnet3 only went live ~Jan 2026 — it's too new for the major third-party automation networks to have integrated yet. This isn't a gap in the research, it's a real gap in the ecosystem right now.

## The actual answer: you don't need a third-party keeper network — you need a permissionless function

Here's the thing Reactive Network, Chainlink Automation, and Gelato all have in common under the hood: **none of them are magic trustless execution.** They're each a marketplace of off-chain operators who call a public, permissionless on-chain function and get paid for it. What makes it "not just a bot pretending to be decentralized" isn't *who* triggers the call — it's that:

1. The on-chain logic is audited, public, and does exactly what it says (health-factor check, protection execution) — no one, including whoever triggers it, can make it do anything else.
2. The triggering function is **callable by anyone**, not gated to your own server's key.
3. There's an economic incentive for someone other than you to bother calling it, so the system doesn't silently depend on your uptime.

**This is exactly BIMA's own model on GOAT** ([[03-agentkit-and-technical-fit]]): BIMA has no automated keeper at all — liquidations are permissionless and bounty-incentivized (0.5% of collateral + 200 USBD fixed bounty per [BIMA docs](https://docs.bima.money/risk-management-+-liquidations)). Anyone who calls the liquidation function when a position crosses 160% collateralization gets paid. That's the native automation pattern already proven on GOAT.

## Recommended pattern for rc-agents on GOAT

Build the CC-equivalent contracts so `checkAndProtectPositions()` / `executeDCAOrders()` are:
- **`public`**, callable by any address, not access-gated to the server's key (a real change from the current Base Sepolia contracts, where the RC's callback proxy is the only permitted caller).
- **Bounty-incentivized** — a small fee (skimmed from the same x402 payment that funds the config) paid to whichever address successfully calls the check/execute function, mirroring BIMA's liquidator-bounty design.
- **Audited and minimal** — the trust story is "read the contract, verify the function is genuinely permissionless and does only what it claims," not "trust rc-agents' server."

Then: rc-agents' own AgentKit-based agent process is simply the **first, default caller** — reliable, always-on, but not privileged. Anyone (a competing bounty hunter, a future decentralized keeper network once one exists on GOAT, or you running a second redundant instance) could call the same function and get paid the same bounty. That's what makes it "real on-chain automation with audited contracts," independent of Reactive Network: the trustlessness comes from the function being permissionless + incentivized, not from *which* off-chain system happens to trigger it.

**This is arguably a stronger pitch than the original Reactive Network version**, not a downgrade: the current Base Sepolia contracts trust the Reactive Network's RC/CC callback proxy as the sole caller (a single external system you don't control). A permissionless-plus-bounty design trusts *nobody in particular* — which is closer to what "audited contracts only" actually means, and it's a pattern GOAT itself already ships natively via BIMA.

## What's still open

- Confirm BIMA's exact liquidation function signature and bounty mechanics against its real Solidity (not just docs prose) before copying the pattern.
- If Reactive Network or another decentralized automation network announces GOAT support later, that becomes a strict upgrade (more redundant callers) — not a redesign. Worth a periodic check, not a blocker now.

## Related
[[03-agentkit-and-technical-fit]] · [[05-migration-plan]]
