# Veridex — the comparable grantee

Emmanuel cited this as a live example of GOAT's recent grant activity: *"The AI Builder Grants Program recently welcomed Veridex while introducing a $2,000 Base Grant"* ([GOATNetwork tweet](https://x.com/GOATNetwork/status/2082472526291107858)).

## What Veridex is

Sources: [DoraHacks buidl page](https://dorahacks.io/buidl/38427), [Veridex Protocol GitHub](https://github.com/veridex-protocol), [Zcash Community Forum grant application](https://forum.zcashcommunity.com/t/grant-application-veridex-passkey-shielded-wallets-ai-agent-payments/54814)

Veridex is infrastructure for **secure, policy-controlled autonomous payments across any blockchain and any payment protocol** — a cross-chain identity + payment authorization layer for AI agents. Specifics:

- **Veridex Agent** handles x402 paywalls, signs EIP-3009 authorizations, and settles USDC.e payments (seen on Cronos in their docs) — gaslessly, without human intervention.
- The SDK bridges **x402 (Coinbase), UCP (Google/Shopify), ACP (OpenAI/Stripe), and AP2 (Google A2A)** — i.e. it's a protocol-agnostic authorization layer, not tied to one payment standard.
- Core value prop: **policy-controlled spend** — "agents can only spend what humans authorize with cryptographic policy enforcement." This is the trust/safety framing GOAT's messaging repeats ("preserving Bitcoin's core principles of security and self-custody").
- Also active in the Zcash grants ecosystem with a passkey-shielded-wallet angle — suggests the team is grant-program-fluent and applies broadly, not GOAT-exclusive.

## Why GOAT funded it — the pattern to match

Veridex is infrastructure *for* the agent economy (an authorization/settlement layer other agent builders plug into), phrased in exactly GOAT's own language: *"GOAT Network supports on-chain actions, x402 payments, ERC-8004 identity, and adapters for major AI frameworks... wallets execute, identity makes agents legible, payments authorize value movement, settlement proves outcomes."* Veridex slots cleanly into the "payments authorize value movement" layer of that stack.

**rc-agents' comparable framing**: rc-agents is not an authorization layer — it's a downstream *service* an authorized agent transaction pays for (automated DeFi execution, not payment authorization itself). That's a different but equally legible layer in the same stack: "settlement proves outcomes" / the actual on-chain work getting done after payment clears. The pitch should lean into that distinction rather than trying to reposition rc-agents as infrastructure it isn't — GOAT's examples list ("coding agents, research tools, workflow automation... applications that pay for APIs or compute, agents that transact with other agents") already covers rc-agents' actual shape without stretching.

## Related
[[02-ai-builder-grants-program]] · [[04-migration-plan]]
