# rc-agents — x402 x Reactive Smart Contracts

An automation marketplace where AI agents pay for autonomous DeFi protection using x402 micropayments and Reactive Smart Contracts.

**What it does:** An AI agent sends `$0.12` in USDC, and gets Aave liquidation protection that runs autonomously for 24 hours — no accounts, no signup, no human in the loop.

```
AI Agent (wallet = identity)
    |
    |  GET /api/protect/liquidation?threshold=1.5&duration=86400
    |
    v
x402 Server -----> 402: pay $0.12 USDC on Base Sepolia
    |
    |  Agent signs EIP-3009, retries
    |
    v
Payment confirmed ---> registerSubscription() on AaveHFCallback
    |
    v
AaveHFReactive (Kopli) --- CRON tick every ~12 min ---> runCycle()
    |
    v
AaveHFCallback (Base Sepolia) checks health factor
    |  HF < 1.5? ---> supply collateral to Aave
```

---

## Architecture

Each service is a **specialized contract pair** — one Reactive Contract (RC) on the Reactive Network, one Callback Contract (CC) on the destination chain. Services are isolated: a bug in one can't affect another. New services are added by deploying a new pair, not modifying live contracts.

**Phase 1 (current): Aave Liquidation Guard**

| Component | Chain | File | Purpose |
|---|---|---|---|
| AaveHFCallback | Base Sepolia | `contracts/aave-hf-guard/AaveHFCallback.sol` | Registry + executor. Stores subscriptions, checks health factors, supplies collateral. |
| AaveHFReactive | Kopli (Reactive Network) | `contracts/aave-hf-guard/AaveHFReactive.sol` | Stateless trigger. Watches CRON ticks + new registrations, fires `runCycle()` callbacks. |
| x402 Server | — | `src/server/index.ts` | API gateway. x402 payment gate, dynamic pricing, on-chain registration. |

The RC is deliberately **stateless** about per-user thresholds. It fires `runCycle()` blindly on every CRON tick. All filtering happens in the CC. This sidesteps the Reactive Network constraint that `react()` cannot read state written after deployment.

---

## Project Structure

```
contracts/
  interfaces/
    IReactive.sol                 Reactive Network interface
    ISubscriptionService.sol      Event subscription interface
  aave-hf-guard/
    AaveHFCallback.sol            CC: registry + Aave protection
    AaveHFReactive.sol            RC: CRON trigger + event watcher

src/
  config/services.ts              Service catalog, pricing (integer math)
  server/
    index.ts                      Express + x402 middleware, all API routes
    chain.ts                      viem clients, contract interaction helpers
    bridge.ts                     USDC -> ETH -> Kopli gas (Phase 1: stub)

scripts/
  deploy-callback.ts              Deploy CC to Base Sepolia
  deploy-reactive.ts              Deploy RC to Kopli

examples/
  agent-client.ts                 Example AI agent (discover, quote, approve, pay, status)
  AaveProtectionReactive.sol      Self-contained reference implementation

references/
  deployment.md                   Chain IDs, addresses, deploy steps, gas estimates
```

---

## Setup

### Prerequisites

- Node.js 18+
- A wallet with ETH on Base Sepolia (for contract deployment + gas)
- REACT tokens on Kopli testnet (for RC deployment)
- Two addresses from Reactive Network docs (see below)

### 1. Install

```bash
git clone <repo-url>
cd rc-agents
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Fill in your `.env`:

| Variable | Where to get it |
|---|---|
| `SERVER_WALLET_ADDRESS` | Your wallet address (will be the CC owner) |
| `SERVER_PRIVATE_KEY` | Private key for that wallet |
| `DEPLOYER_PRIVATE_KEY` | Same key, or a dedicated deployer |
| `REACTIVE_NETWORK_SENDER` | [Reactive Network docs: callback contracts](https://dev.reactive.network/docs/callback-contracts) |
| `CRON_TICKER_ADDRESS` | [Reactive Network docs: cron](https://dev.reactive.network/docs/cron) |

### 3. Compile contracts

```bash
npm run compile
```

### 4. Deploy

**Step 1 — CC to Base Sepolia:**

```bash
npm run deploy:callback
# Output: AAVE_HF_CALLBACK_ADDRESS=0x...
# Copy into .env
```

**Step 2 — RC to Kopli:**

Get testnet REACT from https://kopli.reactscan.net/faucet first.

```bash
npm run deploy:reactive
# Output: AAVE_HF_REACTIVE_ADDRESS=0x...
# Copy into .env
```

### 5. Start server

```bash
npm run dev
```

Server listens on `http://localhost:3000`.

---

## API

### Free endpoints

**`GET /api/services`** — List services and pricing

```json
{
  "services": [{
    "id": "hf-guard",
    "name": "Aave Liquidation Guard",
    "pricing": { "perDay": "$0.1", "example1Day": "$0.12" },
    "status": "live"
  }]
}
```

**`POST /api/quote`** — Exact price for a duration

```bash
curl -X POST http://localhost:3000/api/quote \
  -H "Content-Type: application/json" \
  -d '{"service": "hf-guard", "durationSeconds": 86400}'
```

**`GET /api/status/:id`** — Subscription state

```bash
curl http://localhost:3000/api/status/0
```

**`GET /health`** — Server + RC balance check

### 402-gated endpoint

**`GET /api/protect/liquidation`** — Register Aave HF guard

| Query param | Required | Default | Description |
|---|---|---|---|
| `threshold` | yes | — | HF threshold (e.g. `1.5`) |
| `duration` | no | `86400` | Seconds (1 hour to 30 days) |
| `protectedUser` | no | payer | Aave user to protect |
| `collateralAsset` | no | WETH | ERC-20 to supply on trigger |
| `collateralAmount` | no | 0.1 ETH | Amount to supply per trigger |

**Without payment:** returns `402 Payment Required` with USDC terms.

**With valid x402 payment:** registers the subscription on-chain and returns:

```json
{
  "success": true,
  "subscriptionId": "0",
  "txHash": "0x...",
  "expiresAtISO": "2026-03-21T17:00:00.000Z",
  "message": "Protection active. Health factor monitored every ~12 min."
}
```

---

## Agent Usage

### With @x402/fetch (recommended)

```typescript
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";

const x402Fetch = wrapFetchWithPayment(fetch, AGENT_PRIVATE_KEY, {
  schemes: [{ network: "eip155:84532", scheme: new ExactEvmScheme() }],
});

// Step 1: Approve collateral (one-time)
// Agent must call ERC20.approve(AAVE_HF_CALLBACK_ADDRESS, amount) first

// Step 2: Pay and register — x402 handles 402 -> sign -> retry automatically
const res = await x402Fetch(
  "http://localhost:3000/api/protect/liquidation?threshold=1.5&duration=86400"
);
const result = await res.json();
console.log(result.subscriptionId);
```

### Full example

See [`examples/agent-client.ts`](./examples/agent-client.ts) for a complete working agent that discovers services, approves collateral, pays, and checks status.

```bash
AGENT_PRIVATE_KEY=0x... npm run -- ts-node examples/agent-client.ts
```

---

## How Protection Works

1. **Agent pays** via x402 — USDC is settled on Base Sepolia.
2. **Server calls** `AaveHFCallback.register()` with the agent's params.
3. **AaveHFCallback** emits `SubscriptionRegistered` event.
4. **AaveHFReactive** (on Kopli) sees the event and fires an immediate `runCycle()` callback.
5. **Every ~12 minutes**, the CRON ticker fires another `runCycle()`.
6. **`runCycle()`** iterates all active subscriptions:
   - Queries Aave for each user's health factor
   - If HF < threshold: pulls collateral from agent wallet, supplies it to Aave
   - If Aave call fails: logs `HealthCheckFailed`, continues to next subscription
   - If collateral transfer fails: deactivates subscription, emits `SubscriptionExpired`
   - Expired subscriptions are swap-and-popped from the active array (O(1) removal)

### Safety features

- **Allowance check at registration** — fails fast if agent hasn't approved collateral
- **try-catch on every Aave call** — one failing user can't block others
- **Collateral refund on supply failure** — if Aave rejects the supply, collateral is returned to agent
- **Emergency pause** — owner can `pause()` / `unpause()` all operations
- **RC balance guard** — server refuses new registrations if the RC on Kopli is underfunded

---

## Adding a New Service

Each service gets its own contract pair. No existing contracts are modified.

1. Create `contracts/new-service/NewCallback.sol` + `NewReactive.sol`
2. Add deploy scripts in `scripts/`
3. Add entry to `src/config/services.ts` with `callbackAddressEnv` / `reactiveAddressEnv`
4. Add a 402-gated route in `src/server/index.ts`
5. Deploy, set env vars, restart

Example services for Phase 2+:
- **Stop Loss** — watch price oracle, swap to stablecoin when price drops
- **Take Profit** — swap when price rises above target
- **Auto-Rebalance** — rebalance portfolio when drift exceeds threshold
- **Cron Action** — execute arbitrary CC logic on a schedule

---

## Key Decisions

| Decision | Why |
|---|---|
| Specialized contracts per service | Isolation, independent deployment, no shared state risk |
| RC is stateless | react() can't read post-deployment state; CC handles all threshold logic |
| Integer pricing (bigint) | No floating point drift on sub-day durations |
| Swap-and-pop for expired subs | O(1) removal keeps runCycle() gas constant per active sub |
| Dynamic x402 pricing | Price computed from query params at request time via DynamicPrice function |
| Emergency pause | Owner can halt everything if Aave oracle is compromised |

---

## Phase 1 Limitations

- **RC gas is funded manually** — the USDC-to-REACT bridge (Phase 2) is not yet automated. Operator must keep the RC topped up on Kopli.
- **Single-owner access control** — no multisig or timelock. Good enough for testnet; needs hardening for mainnet.
- **No subscription refunds** — if the RC runs dry or Aave is paused, subscriptions expire without compensation.
- **Base Sepolia only** — mainnet deployment requires verifying all contract addresses, CRON ticker, and RN sender.

---

## x402 Research Docs

This repo also contains comprehensive x402 protocol documentation:

| File | Contents |
|---|---|
| [`01-overview.md`](./01-overview.md) | What x402 is, origin, core concepts, ecosystem stats |
| [`02-how-it-works.md`](./02-how-it-works.md) | Full protocol flow, headers, EIP-712/3009, facilitator API |
| [`03-implementation.md`](./03-implementation.md) | Server + client code examples (TS, Python, Go) |
| [`04-facilitators.md`](./04-facilitators.md) | Facilitator architecture, running your own |
| [`05-use-cases.md`](./05-use-cases.md) | AI agents, micropayments, infrastructure billing |
| [`06-ecosystem.md`](./06-ecosystem.md) | SDKs, chains, tools, platform integrations |
| [`07-limitations.md`](./07-limitations.md) | Token lock-in, latency, audit gaps, centralization risks |

---

## Quick Reference

```
Testnet facilitator:  https://x402.org/facilitator
Base Sepolia RPC:     https://sepolia.base.org
Kopli RPC:            https://kopli-rpc.rkt.ink
Kopli faucet:         https://kopli.reactscan.net/faucet
USDC faucet:          https://faucet.circle.com (Base Sepolia)
x402 npm:             @x402/express @x402/core @x402/evm @x402/fetch
```
