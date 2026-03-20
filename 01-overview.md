# x402 Protocol — Overview

## What Is x402?

x402 is an open, internet-native payment protocol that repurposes the long-dormant **HTTP `402 Payment Required`** status code into a fully-functional, on-chain micropayment layer for APIs, websites, and autonomous AI agents.

The HTTP `402` code was reserved in the original 1997 HTTP/1.1 specification with a note: *"reserved for future use"* — specifically anticipated for payment-gating resources. It was never standardized. x402 finally makes that vision real, 28 years later.

---

## Why It Exists

Traditional payment infrastructure (Stripe, PayPal, bank wires) has three fundamental problems for the machine-to-machine economy:

| Problem | Traditional Payments | x402 |
|---|---|---|
| Minimum viable payment | ~$0.50 (fees eat anything smaller) | ~$0.001 |
| Settlement time | 1–3 business days | ~1–2 seconds |
| Account required | Yes (KYC, credentials) | No — wallet address is identity |
| Agent-compatible | No (requires human approval flows) | Yes — fully autonomous |
| Per-transaction fee | 2.9% + $0.30 | ~$0.0001 gas only |

At $0.30 per transaction, charging $0.01 for an API call is mathematically impossible. x402 makes it practical.

---

## Origin and Governance

| Detail | Info |
|---|---|
| Created by | Coinbase Developer Platform (CDP) team |
| Key creators | Erik Reppel (Head of Engineering), Nemil Dalal (Head of CDP), Dan Kim (BD) |
| Initial launch | May 2025 (testnet) |
| V2 specification | January 2026 |
| x402 Foundation | Announced September 23, 2025 |
| Foundation co-founders | Coinbase + Cloudflare |
| License | Apache 2.0 |
| Repository | [github.com/coinbase/x402](https://github.com/coinbase/x402) |
| Spec file | `specs/x402-specification.md` in the repo |

The x402 Foundation models governance after DNS and TLS — neutral, open infrastructure not owned by any single company. Matthew Prince (Cloudflare CEO): *"The Internet's core protocols have always been driven by independent governance."*

---

## Core Concepts

### Two-Sided Market

**Sellers (Resource Servers)** — Any HTTP server that wants to charge for a resource. Add a middleware, specify a price in USDC, done. No payment processor account needed.

**Buyers (Clients)** — Any HTTP client with a wallet. A human browser, a Python script, or an autonomous AI agent. When they hit a `402`, they sign a payment authorization and retry.

### Stateless Identity

There are no accounts, sessions, or API keys in the protocol itself. A wallet address IS the identity. A signed payment authorization IS the credential. This is what makes the protocol work for autonomous agents — no signup, no OAuth flow.

### The Facilitator

A third-party service that bridges HTTP authorization to on-chain settlement. When a server receives a signed payment, it forwards it to a facilitator that:
1. Verifies the signature and checks the payer's balance
2. Executes `transferWithAuthorization` on the USDC contract
3. Returns the transaction hash to the server

Facilitators cannot steal funds — the signed authorization is bound to a specific amount, recipient, and time window.

### EIP-3009 Foundation

The entire EVM payment scheme rests on **EIP-3009** (`transferWithAuthorization`). This standard, implemented natively in USDC and EURC, enables:
- **Gasless transfers** — the facilitator pays gas, not the buyer
- **Off-chain authorization** — user signs a message, never submits a transaction directly
- **Random nonces** — enables parallel non-conflicting authorizations
- **Time-bounded windows** — `validAfter`/`validBefore` timestamps prevent replay attacks

---

## Ecosystem at a Glance (March 2026)

| Metric | Value |
|---|---|
| Total transactions | 75.41M |
| Total volume | $24.24M |
| Unique buyers | 94,060 |
| Unique sellers | 22,000 |
| GitHub dependents | 548+ repos |
| Python package version | 2.3.0 |
| npm package | `@x402/core` (org: `@x402`) |

> Note: Transaction counts include speculative activity around the `$PING` memecoin in Q4 2025. Real utility transactions are a growing subset.

---

## The Three Actors

```
┌─────────────┐     1. GET /resource          ┌─────────────────┐
│             │ ─────────────────────────────► │                 │
│   CLIENT    │                                │ RESOURCE SERVER │
│  (buyer)    │ ◄───────────────────────────── │   (seller)      │
│             │     2. 402 + payment terms     │                 │
│             │                                │                 │
│             │     3. GET /resource           │                 │
│             │        + signed payment        │                 │
│             │ ─────────────────────────────► │                 │
│             │                                │         │       │
│             │                                │    4a. verify   │
│             │                                │    4b. settle   │
│             │                                │         ▼       │
│             │                                │   FACILITATOR   │
│             │                                │   (on-chain     │
│             │                                │   settlement)   │
│             │                                │         │       │
│             │     5. 200 OK + tx hash        │         │       │
│             │ ◄───────────────────────────── │ ◄───────┘       │
└─────────────┘                                └─────────────────┘
```

---

## What Makes It Different

**Works inside HTTP** — No new protocol, no WebSockets, no side channels. Payments flow through standard `GET`/`POST` requests with extra headers. Any existing HTTP infrastructure (CDNs, proxies, load balancers) works unchanged.

**No minimum payment size** — $0.001 per API call is economically viable. $0.0001 is too. This enables pricing models impossible with traditional rails.

**Agent-native** — Built assuming the buyer might not be human. No CAPTCHA, no OAuth redirect, no email verification. A Python script or an LLM agent can pay for resources with the same code path as a human.

**Open and permissionless** — No gatekeeping. Anyone can run a facilitator. Anyone can build a client or server. No whitelist, no approval process.

---

## Technology Partners (as of March 2026)

| Partner | Role |
|---|---|
| **Coinbase** | Creator, CDP facilitator infrastructure |
| **Cloudflare** | x402 Foundation co-founder, Agents SDK + MCP integration |
| **Google** | AP2 integration, hackathon sponsor |
| **AWS** | Launch partner |
| **Vercel** | Next.js middleware, MCP SDK |
| **Circle** | USDC issuer (primary settlement token) |
| **Visa** | TAP (Trusted Agent Protocol) integration |
| **Stripe** | Fiat bridge/complement |
| **Anthropic** | MCP protocol integration |
| **MetaMask** | EVM authorization standard |

---

## Version History

| Version | Date | Key Changes |
|---|---|---|
| V1 | May 2025 | Initial launch. `X-PAYMENT-REQUIRED` / `X-PAYMENT` headers. Testnet only. |
| V2 | January 2026 | Dropped `X-` prefix. All data in headers (body freed). Cleaner layer separation. Mainnet CDP facilitator. Multi-chain expansion. |

---

## Further Reading

| Resource | Link |
|---|---|
| Official website | x402.org |
| GitHub | github.com/coinbase/x402 |
| Whitepaper | x402.org/x402-whitepaper.pdf |
| Coinbase docs | docs.cdp.coinbase.com/x402/welcome |
| Ecosystem directory | x402.org/ecosystem |
| Awesome-x402 (curated) | github.com/Merit-Systems/awesome-x402 |

---

*See also: [`02-how-it-works.md`](./02-how-it-works.md) for the technical protocol flow, [`03-implementation.md`](./03-implementation.md) for developer quickstart.*
