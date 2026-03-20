# x402 Protocol — Ecosystem

## SDKs and Libraries

### Official TypeScript / JavaScript (`@x402` npm org)

All packages are under the `@x402` npm organization. Install individually based on need.

#### Core

| Package | Purpose | Install |
|---|---|---|
| `@x402/core` | Types, schemas, `HTTPFacilitatorClient`, `x402ResourceServer`, base64 encoding utils | `npm i @x402/core` |
| `@x402/evm` | EVM exact scheme — EIP-3009, EIP-712 signing, signature verification | `npm i @x402/evm` |
| `@x402/svm` | Solana exact scheme — SPL token transfers, partially-signed transactions | `npm i @x402/svm` |
| `@x402/extensions` | Protocol extensions: Bazaar discovery, SIWx (coming) | `npm i @x402/extensions` |

#### Server Frameworks

| Package | Framework | Install |
|---|---|---|
| `@x402/express` | Express.js middleware | `npm i @x402/express` |
| `@x402/next` | Next.js middleware + API routes | `npm i @x402/next` |
| `@x402/hono` | Hono framework middleware | `npm i @x402/hono` |

#### Client

| Package | Purpose | Install |
|---|---|---|
| `@x402/fetch` | Wraps native `fetch` to auto-handle 402 responses | `npm i @x402/fetch` |
| `@x402/axios` | Axios interceptor for automatic payment handling | `npm i @x402/axios` |
| `@x402/paywall` | Modular paywall component (EVM + Solana) | `npm i @x402/paywall` |

#### Coinbase Official Client

| Package | Version | Install |
|---|---|---|
| `@coinbase/x402` | 2.1.0 | `npm i @coinbase/x402` |

---

### Official Python (`x402` on PyPI)

**Version:** 2.3.0 (March 6, 2026) | **License:** MIT | **Python:** ≥3.10

```bash
pip install x402                       # Core only
pip install "x402[evm]"                # + EVM scheme
pip install "x402[svm]"                # + Solana scheme
pip install "x402[fastapi]"            # + FastAPI middleware
pip install "x402[flask]"              # + Flask middleware
pip install "x402[httpx]"              # + httpx async client
pip install "x402[requests]"           # + requests sync client
pip install "x402[all]"                # Everything
```

Key exports:
- `x402ClientSync` / `x402Client` — sync and async HTTP clients
- `x402ResourceServer` / `x402ResourceServerSync` — server-side handler
- `x402Facilitator` / `x402FacilitatorSync` — facilitator implementation
- `HTTPFacilitatorClient` — client for connecting to external facilitators

---

### Official Go

```bash
go get github.com/coinbase/x402/go
```

Packages:
- `github.com/coinbase/x402/go` — core types and resource server
- `github.com/coinbase/x402/go/http/gin` — Gin middleware
- `github.com/coinbase/x402/go/http/stdlib` — standard `net/http` middleware
- `github.com/coinbase/x402/go/facilitator` — facilitator server implementation

---

### Community Libraries

| Language | Package | Notes |
|---|---|---|
| **Rust** | `x402-rs` | Facilitator + SDK. Available on Avalanche Builder Hub. |
| **Java** | Mogami | Java client + server SDK with Spring Boot support |
| **Ruby** | `x402-rails` | Rails gem for server-side paywall |
| **Ruby** | `x402-payments` | HTTP header parsing and construction |
| **.NET / C#** | `x402-dotnet` | Community implementation |
| **Go** | `x402-go` (mark3labs) | Alternative community Go implementation |
| **Python** | `x402python` (OrbytLabz) | Solana-focused Python library |
| **TypeScript** | `@sei-js/x402` | Sei network-specific integration |
| **TypeScript** | `x402-solana` | Solana-focused package |
| **TypeScript** | MCPay SDK | MCP server monetization |
| **TypeScript** | Faremeter | Lightweight OSS framework with plugin system |

---

## Supported Chains and Tokens

### Official CDP Facilitator

| Network | CAIP-2 | Token | Status |
|---|---|---|---|
| Base Mainnet | `eip155:8453` | USDC | Production |
| Base Sepolia | `eip155:84532` | USDC | Testnet |
| Solana Mainnet | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | USDC (SPL) | Production |
| Solana Devnet | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | USDC (SPL) | Devnet |

### Community-Supported Networks (via Third-Party Facilitators)

| Network | CAIP-2 | Facilitator |
|---|---|---|
| Ethereum Mainnet | `eip155:1` | PayAI, thirdweb |
| Polygon Mainnet | `eip155:137` | PayAI, thirdweb |
| Polygon Amoy (testnet) | `eip155:80002` | PayAI |
| Avalanche C-Chain | `eip155:43114` | x402-rs, PayAI |
| Avalanche Fuji (testnet) | `eip155:43113` | x402-rs |
| Arbitrum One | `eip155:42161` | PayAI, thirdweb |
| Optimism | `eip155:10` | PayAI, fretchen.eu |
| Sei Mainnet | — | `@sei-js/x402` |
| IoTeX | — | Community |
| Etherlink (Tezos L2) | — | TZ APAC / Tez402 |
| SKALE | Various | Community |
| Peaq | — | Community |
| Algorand | — | GoPlausible (non-EVM) |
| Story | — | Community |
| EduChain | — | Community |
| X Layer | — | Community |
| Monad | — | Experimental |

### Token Compatibility

| Token | Standard | EVM Support | Solana Support |
|---|---|---|---|
| **USDC** | EIP-3009 (EVM) / SPL (Solana) | ✅ Native | ✅ Native |
| **EURC** | EIP-3009 | ✅ Native | ✅ Native |
| **USDT** | — | ❌ Incompatible | ✅ (SPL) |
| **DAI** | EIP-2612 | ❌ Incompatible | — |
| **Any SPL token** | SPL / Token-2022 | — | ✅ |
| **Custom ERC-20** | EIP-3009 | ✅ (if EIP-3009 implemented) | — |

**Why USDT doesn't work on EVM:** USDT uses a custom non-standard `approve`/`transferFrom` flow and does not implement EIP-3009. Adding USDT support would require a wrapper contract or a different payment scheme.

---

## Tooling and Developer Infrastructure

### Development Tools

| Tool | Purpose |
|---|---|
| **x402 CLI** | Test x402 endpoints from the command line |
| **x402scan** | On-chain explorer for x402 transactions; SQL API for analytics |
| **x402station** | Real-time monitoring and insights dashboard |
| **x402list.fun** | Ecosystem discovery and analysis |
| **Cloudflare x402 Playground** | Live browser-based demo with testnet USDC |

### Testing Utilities

```bash
# Check if an endpoint requires x402 payment
curl -v https://api.example.com/premium 2>&1 | grep -E "402|PAYMENT"

# Decode a PAYMENT-REQUIRED header
echo "<base64_value>" | base64 -d | python3 -m json.tool

# Get testnet USDC (Base Sepolia)
# Visit: https://faucet.circle.com or Coinbase Base Sepolia faucet
```

---

## Major Platform Integrations

### Cloudflare

Cloudflare co-founded the x402 Foundation and integrated x402 deeply into its developer stack:

- **Cloudflare Agents SDK**: Built-in `paidTool()` for MCP server monetization
- **Cloudflare Workers**: Middleware support for x402 paywall
- **Cloudflare AI Gateway**: Pay-per-inference routing
- **x402 Playground**: Live demo environment
- Proposed the `deferred` payment scheme for batch/subscription settlement

### Vercel

- **`@x402/next`**: Official Next.js middleware (contributed to by Vercel)
- **`@x402/fetch`**: Native fetch wrapper
- **x402-mcp**: MCP SDK with x402 support

### Coinbase Developer Platform (CDP)

- **CDP Facilitator**: Production settlement infrastructure for Base + Solana
- **AgentKit**: Agentic wallet SDK with x402 integration
- **Agentic Wallets**: TEE-secured non-custodial wallets for AI agents
- **Server Wallets**: Programmatic wallets (no seed phrase exposure) for agents

### AWS

AWS is a launch partner with integrations planned for:
- Lambda functions with x402 paywall
- API Gateway x402 authorizer
- Bedrock agent integration

---

## Marketplace and Discovery

### x402.org Ecosystem Directory

The official ecosystem directory at `x402.org/ecosystem` lists:
- Sellers (API providers with x402 endpoints)
- Buyers (clients and frameworks)
- Facilitators
- Developer tools

### Bazaar Extension

The `bazaar` protocol extension enables decentralized API discovery. A facilitator with discovery support indexes x402-enabled resources and exposes a `/discovery/resources` endpoint. Clients can query this to find APIs without needing a central registry.

```json
{
  "extensions": {
    "bazaar": {
      "category": "data/blockchain",
      "tags": ["defi", "prices", "realtime"],
      "rating": 4.9,
      "totalCalls": 1420000,
      "seller": "0xSellerAddress"
    }
  }
}
```

### thirdweb Nexus

thirdweb's Nexus layer adds reputation scoring and advanced discovery on top of x402:
- Seller reputation scores based on uptime and payment success rate
- Multi-chain resource indexing across 170+ chains
- SDK-level discovery: clients can find the cheapest/fastest provider for a given data type

---

## Analytics

### x402scan

An on-chain explorer similar to Etherscan but x402-specific:
- View all x402 transactions on Base
- Search by payer, payee, or resource URL
- SQL API for developers: `SELECT * FROM x402_payments WHERE payee = '0x...'`
- Metrics: volume, unique buyers, top sellers, payment success rate

### x402station

Real-time dashboard for API operators:
- Payment success rate per endpoint
- Revenue per day/hour/minute
- Payer geography and wallet distribution
- Facilitator performance metrics

---

## Version and Release Timeline

| Date | Event |
|---|---|
| May 2025 | v1 protocol launched (testnet only) |
| September 2025 | x402 Foundation announced (Coinbase + Cloudflare co-founding) |
| September 2025 | Google, Visa, Stripe partnerships announced |
| October 2025 | 1M+ transactions milestone; $PING speculative activity |
| January 2026 | V2 specification launched; mainnet CDP facilitator goes live |
| March 6, 2026 | x402 Python package v2.3.0 released |
| March 6, 2026 | Etherlink integration (TZ APAC / Tez402) |
| March 2026 | 75M+ total transactions, 22K+ sellers |

---

## Curated Resources

| Resource | URL |
|---|---|
| Official site | x402.org |
| GitHub | github.com/coinbase/x402 |
| Specification | github.com/coinbase/x402/blob/main/specs/x402-specification.md |
| Whitepaper | x402.org/x402-whitepaper.pdf |
| Coinbase docs | docs.cdp.coinbase.com/x402/welcome |
| Seller quickstart | docs.cdp.coinbase.com/x402/quickstart-for-sellers |
| Python PyPI | pypi.org/project/x402 |
| npm (@x402/core) | npmjs.com/package/@x402/core |
| Ecosystem directory | x402.org/ecosystem |
| Awesome-x402 | github.com/Merit-Systems/awesome-x402 |
| Cloudflare blog | blog.cloudflare.com/x402 |
| Solana guide | solana.com/developers/guides/getstarted/intro-to-x402 |
| Avalanche guide | build.avax.network/academy/blockchain/x402-payment-infrastructure |
| QuickNode guide | quicknode.com/guides/infrastructure/how-to-use-x402-payment-required |
| Firecrawl case study | coinbase.com/developer-platform/discover/case-studies/firecrawl |
| Questflow case study | coinbase.com/developer-platform/discover/case-studies/questflow |
| DWF Labs analysis | dwf-labs.com/research/inside-x402 |
