# x402 Protocol — Use Cases

## Overview

x402 enables a new class of applications where resources are priced per-access rather than per-subscription, and where the buyer can be a machine with no human in the loop. This document covers the main categories with real-world examples.

---

## 1. AI Agent API Consumption

**The core use case x402 was designed for.**

AI agents need data, compute, and tools to complete tasks. Today they either use static API keys (which must be provisioned in advance, managed by humans, and are a security risk) or they can't access paywalled resources at all.

With x402, an agent equipped with a wallet can discover and pay for any resource autonomously. No human needs to pre-approve each API. The agent earns, holds, and spends USDC as part of its operation.

### Real Examples

| Service | What It Offers | x402 Price |
|---|---|---|
| **Firecrawl** | Web search + page scraping | Per search/scrape |
| **Neynar** | Farcaster social graph data | Per API call |
| **CoinGecko** | On-chain token prices and market data | Per API call |
| **DexScreener** | DEX pool analytics and trade data | Per query |
| **RootData** | Web3 project research and VC data | Per lookup |
| **SLAMai** | DeFi intelligence and trade signals | Per query |
| **DiamondClaws** | NFT collection intelligence | Per analysis |
| **BlackSwan** | Security risk intelligence for contracts | Per scan |
| **Rug Munch Intelligence** | Memecoin rug pull risk scoring | Per token |
| **Elsa x402** | Crypto analytics and trend detection | Per query |

### How an Agent Uses It

```
Agent task: "Find the current liquidity depth of USDC/ETH on Uniswap V3"

1. Agent calls GET https://api.dexscreener.com/x402/pools/usdc-eth
2. Receives 402: price = $0.001 in USDC on Base
3. Agent signs EIP-3009 authorization from its wallet
4. Retries request with PAYMENT-SIGNATURE header
5. Receives pool data + tx hash confirmation
6. Continues task with the data
```

The entire flow is ~2 seconds. No human involvement.

---

## 2. Per-Request API Monetization

Any API can add a paywall to any endpoint with ~10 lines of code. This enables pricing models that were previously impossible:

- **Micro-tier pricing**: Charge $0.0001 for simple lookups, $0.01 for complex queries
- **No subscription required**: Occasional users pay for what they use, no monthly commitment
- **Zero churn**: Users who don't use the API this month simply don't pay
- **Instant access**: No signup, no trial period, no billing verification

### Use Case Examples

**Weather data with tiered pricing:**
```
GET /weather/basic   → $0.0001 (current temp + conditions)
GET /weather/hourly  → $0.001  (24-hour hourly forecast)
GET /weather/premium → $0.01   (7-day + severe weather alerts)
```

**Blockchain RPC with per-call billing:**
- QuickNode: Pay per RPC call instead of monthly node subscription
- Access to archive nodes without $300/month commitment
- Agents can use premium RPC endpoints exactly when needed

**Research and intelligence:**
- Heurist Deep Research: Pay per AI-generated research report
- CoinGecko: Pay per on-chain data query
- News APIs: Pay per article fetch instead of monthly subscription

---

## 3. Paywalled Content

x402 enables true micropayment paywalls for content — charge cents or fractions of a cent per piece rather than forcing a monthly subscription.

### Models

**Pay-per-article** ($0.05–$0.25)
- Reader pays only for articles they read
- No subscription conversion required
- Works for international users without payment card infrastructure

**Pay-per-minute of video** ($0.001/minute)
- Stream billing: pay while watching, stop paying when you pause
- Enables very short-form premium content

**Pay-per-research-report** ($0.50–$5.00)
- Independent researchers sell directly to readers
- No publisher intermediary needed

### Real Examples

| Service | Content Type | Approach |
|---|---|---|
| **Snack Money API** | Social media platform paywalls | API for content creators to gate posts |
| **Heurist Deep Research** | AI research reports | Pay-per-report generation |
| **Numbers Protocol** | Digital media licensing | Pay to license images/video |
| **BlockRun.AI** | LLM query results | Pay per inference |

---

## 4. Agent-to-Agent Economy

The most forward-looking use case: AI agents paying other AI agents for specialized subtasks.

**Scenario:**
An orchestrator agent receives a task: "Analyze the top 5 DeFi protocols by TVL and identify security risks."

```
Orchestrator Agent
  → pays Data Agent $0.01 → gets TVL data from DeFiLlama
  → pays Analysis Agent $0.05 → gets protocol risk scores
  → pays Security Agent $0.10 → gets smart contract audit summaries
  → assembles final report
  → charges user $0.20
```

Each sub-agent operates autonomously, holds its own wallet, earns USDC, and spends USDC on further subtasks or infrastructure.

### Real Example: Questflow

Questflow built a multi-agent orchestration platform that processed **130,000+ autonomous microtransactions** across 30+ integrated third-party agents. Their agents coordinate work across:
- CoinGecko (market data)
- RootData (project research)
- DexScreener (DEX analytics)
- Notion (knowledge management)
- X/Twitter (social intelligence)

Each agent-to-agent call is a real x402 payment. Questflow reported 95% improvement in wallet setup and coordination time after adopting CDP Server Wallets.

### Emerging Agent Economy Infrastructure

- **Legasi**: Credit and reputation layer for AI agents — credit lines, x402 payments, on-chain reputation scoring. Agents can borrow against their history to pay for more expensive resources.
- **Pincer**: Ad-subsidy protocol — converts advertising budgets into task subsidies, covering x402 paywalls so end users don't pay.
- **Daydreams Router**: LLM inference routing — pay-per-query routing across multiple LLM providers.
- **Spraay**: AI gateway with 200+ models, all accessible via x402.

---

## 5. MCP Server Monetization

**Model Context Protocol (MCP)** — Anthropic's standard for giving AI assistants (Claude, ChatGPT, etc.) access to external tools — has a natural fit with x402. An MCP server can expose paid tools that the AI calls and pays for autonomously.

### How It Works

```
User: "Get me the current price of WBTC on Base"

Claude → MCP Server (DexScreener) → 402 response
Claude → CDP Wallet → sign payment
Claude → MCP Server (with payment) → price data
Claude → User: "WBTC is currently $65,432.10 on Base"
```

### Real Projects

| Project | What It Does |
|---|---|
| **Cloudflare Agents SDK** | `paidTool()` API for monetized MCP tool invocations in Cloudflare Workers |
| **MCPay** | MCP server monetization SDK — add x402 to any MCP tool |
| **ClawPay** | Claude-specific MCP payment integration |
| **Oops!402** | Enable ChatGPT/Claude to pay for MCP tools |
| **Fluora MonetizedMCP** | Marketplace for paid MCP tools |
| **Vercel x402-mcp** | Vercel's MCP SDK with x402 support |

### Cloudflare `paidTool()` Example

```typescript
import { AgentsRouter } from "@cloudflare/agents-sdk";
import { paidTool } from "@cloudflare/agents-sdk/x402";

const router = new AgentsRouter({
  tools: [
    paidTool({
      name: "get_market_data",
      description: "Fetch real-time market data for a token",
      price: "$0.001",
      network: "eip155:8453",
      payTo: "0xYourWallet",
      handler: async ({ symbol }) => {
        return fetchMarketData(symbol);
      },
    }),
  ],
});
```

---

## 6. Infrastructure Billing

Pay for cloud/infrastructure resources per-use without subscription:

### IPFS Storage — Pinata

**Use case:** Store a file on IPFS, pay per GB stored per year.
- Pinata charges $0.10/GB × 12 months for pinning
- No monthly commitment — store a file, pay once, it's pinned
- AI agents can upload generated content (images, documents) without manual payment setup

**Demo (Trendbot):** An AI agent that:
1. Fetches trending Farcaster casts via Neynar (x402 payment)
2. Generates token images using AI
3. Uploads to IPFS via Pinata (x402 payment)
4. Returns the IPFS hash

All three steps paid autonomously.

### GPU Compute — Hyperbolic

- Pay per inference call for GPU-intensive tasks
- No reserved GPU capacity required
- AI agents can run image generation, audio processing, scientific compute on demand

### RPC Endpoints — QuickNode

- Pay per RPC call for blockchain node access
- Access archive nodes, trace APIs, premium endpoints
- No monthly node subscription for occasional users

### Other Infrastructure

| Provider | Service | Model |
|---|---|---|
| **Pinata** | IPFS pinning + retrieval | Per GB stored |
| **Hyperbolic** | GPU inference | Per inference |
| **QuickNode** | RPC endpoints | Per call |
| **dTelecom STT** | Speech-to-text | Per second transcribed |
| **Minifetch** | Web metadata extraction | Per URL |
| **Agent Camo** | Residential proxy sessions | Per session/GB |

---

## 7. Cross-Border and Fiat Bridge

x402 enables payment flows that are difficult or impossible with traditional banking:

### Fiat Settlement Bridges

- **AsterPay**: Accepts USDC via x402, settles in EUR via SEPA. European recipients receive local currency without needing crypto wallets.
- **Laso Finance**: Connects x402 payments to prepaid debit cards and PayPal payouts. Useful for contractors in regions with limited banking access.
- **Bitrefill**: Gift cards, mobile top-ups, and payment cards purchasable via x402.

### Use Case: Global API Marketplace

An API marketplace can accept payments from any country, any currency (as long as it converts to USDC), with settlement in the seller's local currency — no Stripe account in 47 countries required, no FX risk, no chargeback disputes.

---

## 8. Enterprise and Novel Use Cases

### Autonomous Procurement — Lowe's Innovation Lab

Lowe's ran a proof-of-concept where AI agents representing contractors:
- Query inventory availability via x402-gated API
- Check pricing data via x402-gated API
- Place orders autonomously up to a spending limit

No manual account setup per contractor. The agent holds USDC and spends it as needed.

### MMORPG with AI Economies — World of Geneva

Hackathon winner at the SF Agentic Commerce x402 Hackathon:
- Fully AI-controlled MMORPG characters
- Agents fight, trade, and buy items from each other
- All transactions are real USDC micropayments via x402
- Winner: first team to accumulate $10 in USDC from agent-to-agent trades

### Decentralized Payroll — Questflow

- Protocol fee router: automatically distribute revenue shares to contributors
- Instant settlement in USDC to any wallet globally
- No bank account or identity verification required

### Digital Asset Licensing — Numbers Protocol

- Images and video clips with embedded licensing metadata
- Pay once via x402 to license the asset for specific use cases
- Immutable on-chain record of license grant

---

## 9. Comparison: When x402 vs Alternatives

### Use x402 When

- Payment amounts are < $1 (traditional fees make it unviable)
- The buyer might be an autonomous agent (no human in the loop)
- You want zero subscription infrastructure (no billing portal, no invoices)
- You need global reach without per-country payment setup
- Settlement speed matters (1–2 seconds vs 1–3 days)
- You want the payment to be auditable on-chain

### Use Traditional Payment Rails (Stripe, etc.) When

- Payment amounts are > $10 (overhead is negligible relative to value)
- You need refund/chargeback capability
- You need invoicing, receipts, and tax documents
- You're in a regulated industry requiring KYC/AML
- Your buyers are humans who don't have crypto wallets
- You need fiat settlement (though x402 + AsterPay bridges this gap)

### x402 + Stripe Together

Many production systems will use both:
- **Stripe**: Human billing portal, invoicing, subscription management, fiat on/off-ramp
- **x402**: Machine-to-machine API access, AI agent payments, micropayments

---

## 10. Use Case Snapshot Table

| Use Case | Price Range | Buyer | Settlement |
|---|---|---|---|
| AI agent data fetch | $0.0001–$0.01 | AI agent | ~1 second |
| API rate limit bypass | $0.001–$0.10 | Agent or developer | ~1 second |
| Article paywall | $0.05–$0.25 | Human | ~2 seconds |
| GPU inference | $0.01–$1.00 | Agent or human | ~1 second |
| IPFS pinning | $0.10+ | Agent or human | ~2 seconds |
| Agent-to-agent subtask | $0.001–$0.10 | AI agent | ~1 second |
| MCP tool invocation | $0.001–$0.05 | AI assistant | ~1 second |
| Research report | $0.50–$5.00 | Human or agent | ~2 seconds |
| RPC call | $0.0001 | Developer/agent | ~1 second |
| Cross-border fiat bridge | $1.00+ | Any | Minutes (fiat leg) |

---

*See also: [`06-ecosystem.md`](./06-ecosystem.md) for SDKs and tools, [`03-implementation.md`](./03-implementation.md) for implementation details.*
