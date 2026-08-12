# AgentKit, and the two things that don't just port over

This is the load-bearing file. Two findings here directly determine the shape of the migration.

## Finding 1 (blocker): Reactive Network does not support GOAT as a chain

Checked [dev.reactive.network/origins-and-destinations](https://dev.reactive.network/origins-and-destinations) directly.

- **Mainnet origins/destinations**: Abstract, Arbitrum, Avalanche, Base, BSC, Ethereum, HyperEVM, Linea, Plasma, Reactive, Sonic, Unichain.
- **Testnet origins/destinations**: Base Sepolia, Ethereum Sepolia, Reactive Lasna, Unichain Sepolia.
- **GOAT Network (2345 / 48816) is absent from both lists.** No Bitcoin L2 appears in either list.

**Consequence:** the current rc-agents architecture — an RC on Lasna subscribing to CC events on the destination chain via the Callback Proxy — cannot be pointed at GOAT. There's no Callback Proxy deployed there, and Reactive Network's docs note that where no Callback Proxy exists, Hyperlane is used as an alternative transport — but that's a different integration than "redeploy the same RC/CC pair," and there's no evidence GOAT is on Reactive's Hyperlane-transport list either. **This is not a "just redeploy" migration.** The RSC automation layer that is rc-agents' entire technical differentiator (from [[Reactive Smart Contracts]] — "no bots, no keepers, no off-chain oracles") does not exist on GOAT today.

Don't spend time trying to make Reactive Network reach GOAT — treat it as closed unless GOAT/Reactive announce support later (worth a periodic check, not a dependency).

## Finding 2 (opportunity): GOAT ships its own agent framework, "AgentKit," with x402 and ERC-8004 built in

Source: [docs.goat.network/docs/agents/agent-kit/quick-start](https://docs.goat.network/docs/agents/agent-kit/quick-start)

AgentKit is GOAT Network's **official SDK for AI agents**, described as "the central registry for all actions your agent can perform." Three core capabilities:

1. **On-chain actions** — wallet ops and blockchain interactions
2. **x402 payments** — native, first-class (dedicated docs for both "x402 Payments" and "x402 Merchant gateway")
3. **ERC-8004 identity** — standardized on-chain agent identity

Framework integration: exports tool definitions for **OpenAI / OpenAI Agents SDK, LangChain, Vercel AI, MCP**. CLI scaffolding presets: `minimal` (wallet only), `defi` (wallet + bridge + bitcoin), `full`. Targets Node.js 18+.

**Important disambiguation** — do not confuse this with the similarly-named, unrelated **"GOAT SDK" / "Great Onchain Agent Toolkit"** (`goat-sdk` on GitHub, sponsored by Crossmint, MIT licensed, 200+ tools across many chains, includes Aave/Compound/Curve/Uniswap/Lido plugins). That's a different, general-purpose, multi-chain project with an unfortunate name collision. GOAT **Network's** AgentKit is GOAT-specific and its DeFi surface is whatever's actually deployed on GOAT (see below) — it does not inherit the other project's 190+ protocol integrations.

**Why this matters for the grant:** x402 is not something rc-agents needs to bolt onto GOAT — it's a first-party primitive GOAT explicitly wants builders using. Building on AgentKit rather than just redeploying old Foundry contracts is closer to what Emmanuel meant by "implement the GOAT protocol first" and is a more legible signal of GOAT-native seriousness than a Solidity port would be.

## Finding 3: what DeFi actually exists on GOAT chain itself

From [goat.network/ecosystem](https://www.goat.network/ecosystem) (fetched 2026-08-01; the page gives no addresses or mainnet/testnet split, so treat all of this as "exists somewhere in the GOAT ecosystem," to be re-verified against Testnet3 specifically before writing a line of Solidity):

- **GoatSwap** — AMM DEX "built on UNIV3" for GOAT — the closest thing to a Uniswap V3 router equivalent (DCA-strategy contracts could plausibly retarget this, pending address/testnet verification).
- **Sumer**, **DeSyn Protocol** — described as liquidity infrastructure; neither description confirms Aave-style health-factor/liquidation lending. **No protocol on the ecosystem page matches Aave's specific mechanics** (collateral/debt health factor with a liquidation threshold).
- **BIMA**, **bitSmiley** — BTC-collateralized stablecoin/yield protocols; the closest conceptual cousins to a liquidation-protection product (both are "don't get liquidated on your BTC-collateral position" categories), but need direct docs review to confirm they expose a health-factor read function the way Aave's `getUserAccountData` does.
- Others (Artemis Finance, Pell Network, Jasper Vault, Lynx, SolvBTC, Stable Jack, NuDEX, Artura, Aspecta) are staking/restaking/options/stablecoin — not lending-with-liquidation.

**Bottom line: there is no confirmed Aave deployment on GOAT.** The "Aave liquidation protection" product cannot port 1:1. Either (a) find and verify a GOAT-native lending protocol with equivalent health-factor semantics and re-target the CC's Aave calls at it, or (b) lead with the DCA-strategy product (which only needs a Uniswap-V3-shaped router — GoatSwap is a plausible match) and treat Aave-style protection as a phase-2 addition once a specific lending protocol is chosen and verified.

## Finding 4 (verified directly on-chain, 2026-08-01): GoatSwap is mainnet-only — Testnet3 needs a different plan

Checked via Blockscout explorer directly, not docs:

- **GoatSwap V3's `SwapRouter02`** (`0x0d230A6A3E49301F0Ef9663982a529412EAAFAf4`) is a real, verified, actively-used contract on **GOAT Alpha Mainnet** — 48,226 transactions. [Explorer link](https://explorer.goat.network/address/0x0d230A6A3E49301F0Ef9663982a529412EAAFAf4).
- The **same address on Testnet3** is an empty EOA, 0 transactions — not deployed there. Checked the "old" GoatSwap address set too (a prior deployment, `swapRouter02` at `0x2327f9A037C8C44744dCD6D135633DA466576D72`) — also empty on the current Testnet3. **GoatSwap has no presence on the current Testnet3.**
- Testnet3 itself is real and active though — 273,180 total contracts, 1,110 verified, including genuine DeFi infrastructure (e.g. a `LiquidityRouter` contract with 3,339 transactions, GMX-style architecture — a perps/liquidity protocol, not a spot-swap router, verified back in Nov 2025, so Testnet3's history predates the "BitVM2 Testnet V3" relaunch messaging — the chain persisted, only the BitVM2 proving stack is new).
- **BIMA has some Testnet3 presence** — two "Bima Mock BTC" (bmBTC) token contracts turned up in a direct explorer search — but a search for `TroveManager` (BIMA's core market contract, per its Liquity-style "Stability Pool + Earn" architecture) returned zero verified matches by that name. Inconclusive: either BIMA's testnet core contracts use different naming, aren't verified, or aren't deployed yet. Needs a direct check against BIMA's own app/docs with a connected testnet wallet, not just explorer name search.

**Practical consequence for [[05-migration-plan]]:** a Testnet3 demo (which is what the grant program actually asks for) can't lean on GoatSwap or BIMA out of the box — they're mainnet products. Options, in order of preference:
1. **Deploy a small purpose-built Uniswap-V3-shaped pool on Testnet3 ourselves** for the demo (same move the original rc-agents made on Base Sepolia — it didn't wait for a "real" DEX either, Base Sepolia's Uniswap V3 deployment is itself just a testnet instance). Low effort, fully within our control, doesn't block on any third party.
2. **Verify BIMA's actual Testnet3 contracts by connecting a wallet on their app directly** rather than guessing from explorer name search — worth 15 minutes before ruling it out.
3. If neither works out, **demo against GOAT Alpha Mainnet directly** with genuinely small BTC amounts — the grant's "testnet is sufficient" bar is a floor, not a restriction; mainnet is always acceptable too, just a bigger commitment (real BTC, real gas).

## Related
[[01-goat-network-overview]] · [[02-ai-builder-grants-program]] · [[04-migration-plan]]
