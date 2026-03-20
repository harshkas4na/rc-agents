# x402 Protocol — Research Notes

x402 repurposes the HTTP `402 Payment Required` status code into a fully-functional on-chain micropayment layer for APIs, websites, and autonomous AI agents. Created by Coinbase (May 2025), governed by the x402 Foundation (Coinbase + Cloudflare, September 2025).

---

## Files

| File | Contents |
|---|---|
| [`01-overview.md`](./01-overview.md) | What x402 is, origin, core concepts, ecosystem stats, technology partners |
| [`02-how-it-works.md`](./02-how-it-works.md) | Full protocol flow, header formats, EIP-712/EIP-3009, schemes, Solana differences, facilitator API |
| [`03-implementation.md`](./03-implementation.md) | Code examples for Express, Next.js, Hono, FastAPI, Flask, Go, Python/TS clients, AI agent integration |
| [`04-facilitators.md`](./04-facilitators.md) | What facilitators do, trust model, available facilitators, running your own, gas management |
| [`05-use-cases.md`](./05-use-cases.md) | AI agents, per-request billing, paywalled content, agent economy, MCP tools, infrastructure, enterprise |
| [`06-ecosystem.md`](./06-ecosystem.md) | SDKs, supported chains/tokens, tooling, platform integrations, discovery, version timeline |
| [`07-limitations.md`](./07-limitations.md) | EIP-3009 token lock-in, settlement latency, no audit, atomicity, facilitator economics, KYC gap |

---

## 30-Second Summary

```
Client                    Server                  Facilitator
  |                         |                         |
  |─── GET /resource ──────►|                         |
  |◄── 402 PAYMENT-REQUIRED─|                         |
  |    (price in USDC,       |                         |
  |     chain, recipient)    |                         |
  |                         |                         |
  |─── GET /resource ──────►|                         |
  |    PAYMENT-SIGNATURE:    |──── POST /verify ──────►|
  |    (EIP-712 signed auth) |◄─── {isValid: true} ────|
  |                         |──── POST /settle ──────►|
  |                         |◄─── {txHash: "0x..."} ──|
  |◄── 200 OK ──────────────|                         |
  |    PAYMENT-RESPONSE:     |                         |
  |    (tx hash)             |                         |
```

**Key facts:**
- Settlement on Base: ~1–2 seconds, ~$0.0001 gas
- Primary token: USDC (EIP-3009 required on EVM)
- No accounts/KYC — wallet address is identity
- CDP facilitator: 1,000 free tx/month, then $0.001/tx
- Testnet: `https://x402.org/facilitator` (no API key)
- GitHub: `github.com/coinbase/x402` (Apache 2.0)

---

## Quick Links

- Official site: x402.org
- Spec: github.com/coinbase/x402/blob/main/specs/x402-specification.md
- Coinbase docs: docs.cdp.coinbase.com/x402/welcome
- npm: `@x402/core`, `@x402/express`, `@x402/fetch`
- Python: `pip install "x402[evm,fastapi]"`
- Awesome-x402 (curated list): github.com/Merit-Systems/awesome-x402
