# GOAT AI Agent Builder Grants Program

Source: [goat.network/builder-program](https://www.goat.network/builder-program), corroborated by Emmanuel's (contact, Telegram `@ola_nuell`) messages in-thread.

## What GOAT is funding

> "prioritizing transactional, agent-native applications that solve real user problems and create repeatable economic activity."

Explicit checklist (from Emmanuel, matches the program page):
- Have a working product or MVP
- Already generate revenue **or be ready to generate revenue**
- Have a clear business model and real use case
- Use AI agents to automate workflows, enable transactions, or improve productivity
- Be a good fit for GOAT infrastructure

Examples given: coding agents, research tools, workflow automation, sales/support agents, **applications that pay for APIs or compute**, and **agents that transact with other agents** — the last two are exactly rc-agents' shape (an agent pays another agent-run service for automated DeFi execution).

## Funding tiers

| Tier | Amount | Bar |
|---|---|---|
| Base Grant | **$2,000** | Agent-native app, live product, clear revenue path |
| Singularity Investment | **$1,000,000** (pool) | High-potential apps demonstrating real traction |

Source: program page (fetched 2026-08-01).

## Process, confirmed by Emmanuel directly

- **Application**: [tally.so/r/EkJo42](https://tally.so/r/EkJo42) — drop `@ola_nuell` in the "Where did you hear about the program?" field to get a call with the reviewing team.
- **No deadline** — rolling basis.
- **Testnet MVP is sufficient.** Direct quote: *"your demonstratable mvp doesn't have to be exercised testnet is sufficient."* This matters a lot — it means the migration goal is "working, demoable on GOAT Testnet3," not "audited mainnet deployment."
- Emmanuel's explicit recommendation (given the current repo is backend-only, no frontend, and still shows Base Sepolia): **"improve first and implement on goat... it gives a more serious builder with a clear plan as opposed to testnet [sic — meaning: showing GOAT-native work signals seriousness]."**
- On frontend: *"I wouldn't build a full consumer frontend, it doesn't really fit the scope of your product; I'd suggest you just build a read-only dashboard on top... where it acts as trust/monitoring surface for the people behind the agents."* — i.e. a monitoring dashboard for humans watching their agents, not a consumer app.
- Support offered beyond capital: technical guidance on x402/ERC-8004 integration, deployment/scaling help, ecosystem intros, go-to-market/co-marketing.

## What this means for the pitch

The application isn't being scored on TVL or novelty of the DeFi mechanism — it's scored on: does an AI agent transact with this thing, repeatably, for real economic activity, is it live, and does it use GOAT infrastructure natively (not just deployed-there-incidentally). See [[04-migration-plan]] for how that reshapes the architecture, and [[03-agentkit-and-technical-fit]] for why "deployed there incidentally" is specifically the trap to avoid — GOAT ships its own AgentKit (x402 + ERC-8004 native), and using it instead of just redeploying old contracts is what "implement the GOAT protocol" (Emmanuel's words) actually means.

## Related
[[01-goat-network-overview]] · [[03-agentkit-and-technical-fit]] · [[04-veridex-comparable]]
