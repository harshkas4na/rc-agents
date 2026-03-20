# rc-agents — x402 x Reactive Smart Contracts

An automation marketplace where AI agents pay for autonomous DeFi protection using x402 micropayments and Reactive Smart Contracts.

**What it does:** An AI agent sends `$0.12` in USDC, and gets Aave liquidation protection that runs autonomously for 24 hours — no accounts, no signup, no human in the loop.

```
AI Agent (wallet = identity)
    |
    |  GET /api/services             ← discover what's available
    |  GET /api/protect/liquidation  ← hit the service endpoint
    |
    v
x402 Server ──> 402: pay $0.12 USDC on Base Sepolia
    |
    |  Agent signs EIP-3009, retries with payment
    |
    v
Payment confirmed (USDC settled on-chain)
    |
    ├─ bridge.ts: split USDC payment
    |    ├─ 20% kept as server margin (USDC)
    |    └─ 80% swapped USDC → ETH (Uniswap V3)
    |         ├─ 15% ETH kept for Base gas
    |         └─ 85% ETH bridged → REACT on Kopli (RC gas)
    |
    └─ chain.ts: registerSubscription() on AaveHFCallback
         |
         v
    CC emits SubscriptionRegistered
         |
         v
    RC (Kopli) picks up event ──> fires immediate runCycle()
    RC CRON ticker ──> fires runCycle() every ~12 min
         |
         v
    CC checks Aave health factor
         |  HF < 1.5? ──> supply collateral to Aave
```

---

## How It Works

### The agent's perspective

1. **Discover** — `GET /api/services` returns available services, pricing, and parameter specs
2. **Quote** — `POST /api/quote` returns the exact USDC cost for a service + duration
3. **Approve collateral** — Agent calls `ERC20.approve(callbackContract, amount)` on Base Sepolia
4. **Pay and register** — Agent hits the service endpoint. x402 middleware returns `402 Payment Required` with USDC terms. Agent signs EIP-3009 authorization and retries. Payment settles on-chain automatically.
5. **Protected** — Subscription is registered on the CC. The RC monitors and acts autonomously until expiry.

### The server's perspective

1. **x402 middleware** intercepts the request, verifies/settles the USDC payment via the facilitator
2. **Payment confirmed** — handler extracts the payer's wallet address from the payment header
3. **RC balance check** — queries the RC on Kopli to verify it has enough REACT for callbacks
4. **Registration** — calls `register()` on the CC (Base Sepolia), parses the subscription ID from the emitted event
5. **Funding pipeline** — splits the USDC payment into server margin, gas reserve, and RC funding. Swaps USDC → ETH via Uniswap V3, bridges ETH → REACT on Kopli.
6. **Response** — returns subscription ID, tx hash, expiry, and next steps to the agent

### The contract's perspective

1. **CC** (`AaveHFCallback` on Base Sepolia) stores subscriptions and executes protection. `runCycle()` iterates active subs, queries Aave health factors, supplies collateral when triggered.
2. **RC** (`AaveHFReactive` on Kopli) is stateless. Subscribes to `SubscriptionRegistered` events + CRON ticks. On any match, emits `Callback` → Reactive Network delivers `runCycle()` to the CC.
3. All per-user threshold logic lives in the CC, not the RC. This sidesteps the Reactive Network constraint that `react()` cannot read state written after deployment.

---

## Architecture

Each service is a **specialized contract pair** — one RC on the Reactive Network, one CC on the destination chain. Services are isolated: a bug in one can't affect another. New services are added by deploying a new pair and adding a route to the server.

The server is the **orchestration layer** between x402 payments and on-chain registration. It does not run the protection logic — that's entirely autonomous in the contracts.

```
┌─────────────────────────────────────────────────────────────────┐
│ Server (this repo)                                              │
│                                                                 │
│  index.ts ─── Express + x402 middleware ─── API routes          │
│     │                                                           │
│     ├── services.ts ─── service catalog + pricing               │
│     ├── chain.ts ────── viem clients + contract calls           │
│     ├── bridge.ts ───── USDC split → Uniswap swap → RN bridge  │
│     ├── contracts.ts ── addresses from .env                     │
│     └── abis/ ───────── expected contract interfaces            │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼                         ▼
    AaveHFCallback (CC)        AaveHFReactive (RC)
    Base Sepolia               Kopli (Reactive Network)
    ─────────────              ──────────────────────
    register()                 react() on events
    runCycle()                 emit Callback()
    getSubscription()          stateless
    pause/unpause
```

**Contracts are deployed separately** (via Foundry). This repo is the server + ABI definitions. After deploying, paste the contract addresses into `.env` and the ABIs into `src/abis/`.

---

## Project Structure

```
src/
  abis/
    aave-hf-callback.ts        Expected CC ABI (update after deploy)
    aave-hf-reactive.ts        RC ABI (minimal views)
  config/
    contracts.ts                Contract addresses from .env + callback proxies
    services.ts                 Service catalog, pricing (integer math, bigint)
  server/
    index.ts                    Express + x402 middleware, all API routes
    chain.ts                    viem clients (Base + Kopli), contract read/write
    bridge.ts                   USDC split → Uniswap V3 swap → Kopli bridge
```

---

## Setup

### Prerequisites

- Node.js 18+
- A wallet with ETH on Base Sepolia (for `registerSubscription()` gas)
- Deployed CC + RC contracts (see contract deployment section)
- REACT tokens funding the RC on Kopli

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

| Variable | What it is | Where to get it |
|---|---|---|
| `SERVER_WALLET_ADDRESS` | Wallet that receives x402 USDC and owns the CC | Your wallet |
| `SERVER_PRIVATE_KEY` | Private key for that wallet | Never commit this |
| `AAVE_HF_CALLBACK_ADDRESS` | CC address on Base Sepolia | After deploying the CC |
| `AAVE_HF_REACTIVE_ADDRESS` | RC address on Kopli | After deploying the RC |
| `X402_FACILITATOR_URL` | x402 facilitator | `https://x402.org/facilitator` (testnet) |

### 3. Deploy contracts

Contracts are deployed separately using Foundry or Hardhat. The CC and RC must follow Reactive Network patterns:

- **CC**: inherits `AbstractCallback`, uses `authorizedSenderOnly` modifier. The callback proxy address for Base Sepolia is `0x0D3E76De6bC44309083cAAFdB49A088B8a250947` (set in `src/config/contracts.ts`).
- **RC**: inherits `AbstractPausableReactive`, uses `react(LogRecord)`, emits `Callback()`.

After deploying, set `AAVE_HF_CALLBACK_ADDRESS` and `AAVE_HF_REACTIVE_ADDRESS` in `.env`.

If the deployed contract's ABI differs from the expected interface in `src/abis/aave-hf-callback.ts`, update the ABI file to match.

### 4. Start server

```bash
npm run dev
```

Server listens on `http://localhost:3000`.

---

## API Reference

### Free endpoints

**`GET /api/services`** — Service catalog

Returns all available services with pricing examples, duration limits, and status.

```bash
curl http://localhost:3000/api/services
```

```json
{
  "services": [{
    "id": "hf-guard",
    "name": "Aave Liquidation Guard",
    "description": "Monitors your Aave health factor and automatically supplies collateral...",
    "trigger": "Aave Health Factor < threshold",
    "action": "Supply collateral to Aave on your behalf",
    "pricing": {
      "perDay": "$0.1",
      "perDayBaseUnits": 100000,
      "example1Day": "$0.12",
      "example7Days": "$0.84"
    },
    "limits": { "minDurationSeconds": 3600, "maxDurationSeconds": 2592000 },
    "network": "eip155:84532",
    "status": "live"
  }]
}
```

**`POST /api/quote`** — Exact price

```bash
curl -X POST http://localhost:3000/api/quote \
  -H "Content-Type: application/json" \
  -d '{"service": "hf-guard", "durationSeconds": 86400}'
```

```json
{
  "service": "hf-guard",
  "durationSeconds": 86400,
  "price": "$0.12",
  "priceBaseUnits": "120000",
  "currency": "USDC",
  "network": "eip155:84532"
}
```

**`GET /api/status/:subscriptionId`** — Subscription state

```bash
curl http://localhost:3000/api/status/0
```

```json
{
  "subscriptionId": "0",
  "agent": "0x...",
  "protectedUser": "0x...",
  "threshold": "1.5000",
  "active": true,
  "expired": false,
  "timeRemaining": 82341
}
```

**`GET /health`** — Server health + RC balance

### 402-gated endpoints

**`GET /api/protect/liquidation`** — Register Aave HF guard

| Query param | Required | Default | Description |
|---|---|---|---|
| `threshold` | yes | — | HF threshold, e.g. `1.5` (range: 1.01–3.0) |
| `duration` | no | `86400` | Duration in seconds (1 hour to 30 days) |
| `protectedUser` | no | payer's address | Aave user to protect |
| `collateralAsset` | no | WETH | ERC-20 to supply on trigger |
| `collateralAmount` | no | `100000000000000000` (0.1 ETH) | Amount per trigger (in token base units) |

**Without payment:** returns `402 Payment Required` with USDC terms in headers.

**With valid x402 payment:** registers the subscription on-chain:

```json
{
  "success": true,
  "subscriptionId": "0",
  "txHash": "0x...",
  "agent": "0x...",
  "protectedUser": "0x...",
  "threshold": 1.5,
  "expiresAtISO": "2026-03-21T17:00:00.000Z",
  "message": "Protection active. Health factor monitored every ~12 min.",
  "nextSteps": ["Approve AaveHFCallback (0x...) to spend your collateral."]
}
```

---

## Agent Integration

### With @x402/fetch (recommended)

```typescript
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";

const x402Fetch = wrapFetchWithPayment(fetch, AGENT_PRIVATE_KEY, {
  schemes: [{ network: "eip155:84532", scheme: new ExactEvmScheme() }],
});

// 1. Discover services
const services = await (await fetch("http://localhost:3000/api/services")).json();

// 2. Approve collateral (one-time, on Base Sepolia)
// await walletClient.writeContract({ ... ERC20.approve(CALLBACK_ADDRESS, amount) ... })

// 3. Pay and register — x402 handles 402 → sign → retry automatically
const res = await x402Fetch(
  "http://localhost:3000/api/protect/liquidation?threshold=1.5&duration=86400"
);
const result = await res.json();
console.log(result.subscriptionId); // "0"
```

### Manual flow

1. `GET /api/protect/liquidation?threshold=1.5` → receive `402` + `PAYMENT-REQUIRED` header
2. Decode payment terms (base64 JSON): amount, network, recipient
3. Sign EIP-3009 `TransferWithAuthorization` for USDC
4. Retry the same request with `PAYMENT-SIGNATURE` header
5. Server verifies, settles USDC, registers subscription, returns result

---

## Funding Pipeline

When a payment comes in, `bridge.ts` handles the USDC → REACT conversion:

```
$0.12 USDC payment
  │
  ├─ 20% ($0.024) ──> server margin (stays as USDC)
  │
  └─ 80% ($0.096) ──> Uniswap V3 swap ──> ETH
                         │
                         ├─ 15% ETH ──> gas reserve (stays on Base Sepolia)
                         │
                         └─ 85% ETH ──> Reactive Network bridge ──> REACT on Kopli
                                         (funds RC for callback delivery)
```

**Phase 1 (current):** The split is computed and logged. The operator funds the RC manually. Set `BRIDGE_MODE=live` in `.env` to activate automated swap (requires Uniswap V3 pool on Base Sepolia).

**Phase 2:** Full automation including the Reactive Network ETH → REACT bridge.

---

## Adding a New Service

Each service gets its own contract pair and ABI. No existing contracts or routes are modified.

1. **Deploy** CC + RC for the new service (via Foundry)
2. **Add ABI** — create `src/abis/new-service-callback.ts` with the CC's ABI
3. **Add config** — add entry to `src/config/services.ts`:
   ```typescript
   "stop-loss": {
     id: "stop-loss",
     name: "Stop Loss",
     pricePerDay: 50_000, // $0.05/day
     callbackAddressEnv: "STOP_LOSS_CALLBACK_ADDRESS",
     reactiveAddressEnv: "STOP_LOSS_REACTIVE_ADDRESS",
     // ...
   }
   ```
4. **Add route** — add x402-gated route in `src/server/index.ts`
5. **Add chain helper** — add registration function in `src/server/chain.ts`
6. **Set env vars** — contract addresses in `.env`
7. **Restart server**

Example future services:
- **Stop Loss** — watch price oracle, swap to stablecoin when price drops
- **Take Profit** — swap when price rises above target
- **Auto-Rebalance** — rebalance portfolio when drift exceeds threshold
- **Cron Action** — execute arbitrary CC logic on a schedule

---

## Design Decisions

| Decision | Why |
|---|---|
| Server is separate from contracts | Contracts deploy via Foundry; server is the API + bridge layer |
| Specialized contracts per service | Isolation, independent deployment, no shared state risk |
| RC is stateless | `react()` can't read post-deployment state; CC handles all threshold logic |
| Integer pricing (bigint) | No floating point drift on sub-day durations. Multiply before divide. |
| Dynamic x402 pricing | Price computed from query params at request time via `DynamicPrice` function |
| ABI as expected interface | `src/abis/` defines the expected contract interface. Update after deploy if needed. |
| `BRIDGE_MODE` toggle | Dry-run by default. Set `live` only after testing swap + bridge. |
| Swap-and-pop for expired subs | O(1) removal keeps `runCycle()` gas constant per active subscription |
| Emergency pause on CC | Owner can halt everything if Aave oracle is compromised |

---

## Current Limitations

- **Kopli bridge not automated** — `bridgeEthToKopli()` in bridge.ts needs the actual RN bridge contract. Fund RC manually until implemented.
- **Single-owner access control** — no multisig or timelock. Testnet-appropriate; harden for mainnet.
- **No subscription refunds** — if the RC runs dry, subscriptions expire without compensation.
- **Base Sepolia only** — mainnet deployment requires verifying all addresses, pools, and bridge contracts.
- **ABIs are expected interfaces** — must match the deployed contracts. If your CC has different function signatures, update `src/abis/aave-hf-callback.ts`.

---

## x402 Protocol Reference

This repo includes comprehensive x402 documentation:

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
Testnet facilitator:   https://x402.org/facilitator
Base Sepolia RPC:      https://sepolia.base.org
Kopli RPC:             https://kopli-rpc.rkt.ink
Kopli faucet:          https://kopli.reactscan.net/faucet
USDC faucet:           https://faucet.circle.com (Base Sepolia)
Callback proxy (Base): 0x0D3E76De6bC44309083cAAFdB49A088B8a250947
x402 npm:              @x402/express @x402/core @x402/evm @x402/fetch
```
