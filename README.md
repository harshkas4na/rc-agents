# rc-agents — x402 × Reactive Smart Contracts

An automation marketplace where AI agents pay for autonomous DeFi protection using x402 micropayments and Reactive Smart Contracts.

**What it does:** An AI agent sends `$0.30` in USDC, and gets Aave liquidation protection that runs autonomously for 24 hours — no accounts, no signup, no human in the loop.

```
AI Agent (wallet = identity)
    |
    |  GET  /api/services                    ← discover available services
    |  POST /api/protect/liquidation         ← hit the service endpoint
    |
    v
x402 Server ──> 402: pay $0.30 USDC on Base Sepolia
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
    |         └─ 85% ETH bridged → REACT on Lasna (RC gas)
    |
    └─ chain.ts: createProtectionConfig() on AaveProtectionCallback
         |
         v
    CC emits ProtectionConfigured
         |
         v
    RC (Lasna) picks up event
    ├─ self-callback: persistConfigCreated() → subscribes to CRON
    └─ CRON fires every ~12 min → checkAndProtectPositions() on CC
         |
         v
    CC checks Aave health factor
         HF < threshold? → supply collateral / repay debt / both
```

---

## How It Works

### The agent's perspective

1. **Discover** — `GET /api/services` returns available services, pricing, and parameter specs
2. **Quote** — `POST /api/quote` returns the exact USDC cost for a service + duration
3. **Approve assets** — Agent calls `ERC20.approve(callbackContract, amount)` for collateral and/or debt assets
4. **Pay and register** — Agent POSTs to the service endpoint with protection params. x402 middleware returns `402 Payment Required`. Agent signs EIP-3009 and retries. Payment settles on-chain.
5. **Manage** — Agent can pause, resume, or cancel the config via dedicated endpoints
6. **Protected** — The RC monitors and acts autonomously every ~12 minutes until cancelled

### The server's perspective

1. **x402 middleware** intercepts the request, verifies/settles USDC via the facilitator
2. **Payment confirmed** — handler extracts the payer's address from the payment header
3. **RC balance check** — queries the RC on Lasna to verify it has enough REACT for callbacks
4. **Config creation** — calls `createProtectionConfig()` on the CC (Base Sepolia), parses the config ID from the `ProtectionConfigured` event
5. **Funding pipeline** — splits the USDC into server margin, gas reserve, and RC funding
6. **Response** — returns config ID, tx hash, and next steps to the agent

### The contracts' perspective

**CC** (`AaveProtectionCallback` on Base Sepolia):
- Stores protection configs with health factor thresholds, target HF, asset choices
- `checkAndProtectPositions(address sender)` is called by the RC via Reactive Network
- Checks each active config against Aave, executes protection (collateral deposit, debt repayment, or both)
- Emits lifecycle events: `ProtectionConfigured`, `ProtectionExecuted`, `ProtectionCancelled`, `ProtectionPaused`, `ProtectionResumed`, `ProtectionCycleCompleted`
- Auto-cancels after 5 consecutive failures. 30s retry cooldown.

**RC** (`AaveProtectionReactive` on Lasna):
- Subscribes to CC lifecycle events + CRON_100 (~12 min) tick
- `react(LogRecord)` routes events to self-callback functions for state persistence
- Lazy cron subscription: subscribes when first config created, unsubscribes when last config cancelled
- `getPausableSubscriptions()` returns the cron subscription for pause/resume support

---

## Architecture

Each service is a **specialized contract pair** — one RC on the Reactive Network (Lasna testnet), one CC on the destination chain (Base Sepolia). Contracts are deployed separately via Foundry. This repo is the **server layer** that bridges x402 payments to on-chain registration.

```
┌─────────────────────────────────────────────────────────────────┐
│ Server (this repo)                                              │
│                                                                 │
│  index.ts ─── Express + x402 middleware ─── API routes          │
│     │                                                           │
│     ├── services.ts ─── service catalog + integer pricing       │
│     ├── chain.ts ────── viem clients + contract calls           │
│     ├── bridge.ts ───── USDC split → Uniswap swap → RN bridge  │
│     ├── contracts.ts ── addresses, proxies, cron topics, chains │
│     └── abis/ ───────── CC + RC ABIs (update after deploy)     │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼                         ▼
   AaveProtectionCallback      AaveProtectionReactive
   Base Sepolia (84532)        Lasna Testnet (5318007)
   ─────────────────────       ─────────────────────────
   AbstractCallback            AbstractPausableReactive
   authorizedSenderOnly        react(LogRecord)
   createProtectionConfig()    self-callbacks for state
   checkAndProtectPositions()  lazy cron subscribe/unsub
   pause/resume/cancel         getPausableSubscriptions()
```

---

## Project Structure

```
src/
  abis/
    aave-protection-callback.ts   CC ABI (parseAbi, update after deploy)
    aave-protection-reactive.ts   RC ABI (minimal views)
  config/
    contracts.ts                  Addresses, callback proxies, cron topics,
                                  chain IDs, faucets, Aave protocol addresses
    services.ts                   Service catalog, pricing (bigint math)
  contracts/
    AaveProtectionCallback.sol    CC source (deploy via Foundry)
    AaveProtectionReactive.sol    RC source (deploy via Foundry)
    RescuableBase.sol             Base contract for asset rescue
  server/
    index.ts                      Express + x402, all API routes
    chain.ts                      viem clients (Base Sepolia + Lasna),
                                  createProtectionConfig, pause/resume/cancel,
                                  getProtectionConfig, getHealthFactor
    bridge.ts                     USDC → ETH → REACT funding pipeline
```

---

## Deployed Contracts (Base Sepolia Testnet)

| Contract | Address |
|---|---|
| AaveProtectionCallback (CC) | `0x24df0bBC9c4b95e8643848EC6B7f0Ac638BD3476` |
| AaveProtectionReactive (RC) | `0xb1d20ecA7e6e6998A985C41Ae69695125F67619D` |

| Aave V3 Contract | Address |
|---|---|
| Pool (LendingPool) | `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27` |
| PoolAddressesProvider | `0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00` |
| AaveProtocolDataProvider | `0xBc9f5b7E248451CdD7cA54e717a2BFe1F32b566b` |

**Important — two different USDC addresses:**
| Token | Address | Used for |
|---|---|---|
| USDC (Circle testnet) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | x402 payment to server |
| USDC (Aave testnet) | `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f` | debt repayment via Aave |

---

## Setup

### Prerequisites

- Node.js 18+
- A wallet with ETH on Base Sepolia (for `createProtectionConfig()` gas)
- Deployed CC + RC contracts via Foundry (see below)
- lREACT tokens funding the RC on Lasna

### 1. Install

```bash
git clone <repo-url>
cd rc-agents
npm install
```

### 2. Deploy contracts (via Foundry)

```bash
# Get lREACT tokens for Lasna gas (send ETH to faucet on Base Sepolia)
cast send 0x2afaFD298b23b62760711756088F75B7409f5967 \
  --value 0.1ether \
  --rpc-url https://sepolia.base.org \
  --private-key $PRIVATE_KEY

# Build bytecode then deploy CC to Base Sepolia
# Constructor: owner, callbackProxy, lendingPool, dataProvider, addressesProvider
cast send \
  --rpc-url https://sepolia.base.org \
  --private-key $PRIVATE_KEY \
  --value 0.0001ether \
  --create $(forge inspect src/contracts/AaveProtectionCallback.sol:AaveProtectionCallback bytecode)$(cast abi-encode \
    "constructor(address,address,address,address,address)" \
    $DEPLOYER_ADDR \
    0xa6eA49Ed671B8a4dfCDd34E36b7a75Ac79B8A5a6 \
    0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27 \
    0xBc9f5b7E248451CdD7cA54e717a2BFe1F32b566b \
    0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00 | cut -c3-)

# Deploy RC to Lasna
# Constructor: owner, ccAddress, cronTopic (CRON_100), destChainId (Base Sepolia)
cast send \
  --rpc-url https://lasna-rpc.rnk.dev/ \
  --private-key $PRIVATE_KEY \
  --value 1ether \
  --create $(forge inspect src/contracts/AaveProtectionReactive.sol:AaveProtectionReactive bytecode)$(cast abi-encode \
    "constructor(address,address,uint256,uint256)" \
    $DEPLOYER_ADDR \
    $CC_ADDRESS \
    0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70 \
    84532 | cut -c3-)
```

### 3. Configure

```bash
cp .env.example .env
```

| Variable | What it is |
|---|---|
| `SERVER_WALLET_ADDRESS` | Wallet that receives x402 USDC and owns the CC |
| `SERVER_PRIVATE_KEY` | Private key for that wallet (with or without `0x` prefix) |
| `AAVE_PROTECTION_CALLBACK_ADDRESS` | CC address on Base Sepolia |
| `AAVE_PROTECTION_REACTIVE_ADDRESS` | RC address on Lasna |

### 4. Start server

```bash
npm run dev
```

---

## API Reference

### Machine-readable spec

```
GET /openapi.yaml   (serve statically) — OpenAPI 3.1 spec for agent tool registration
```

For AI agent frameworks that auto-discover tools from OpenAPI specs (OpenClaw, LangChain tools, Claude tools), point them at the spec. All endpoints, request/response schemas, and the x402 payment flow are documented there.

### Free endpoints

**`GET /api/services`** — Service catalog with pricing

**`POST /api/quote`** — Exact price for a duration
```json
{ "service": "aave-protection", "durationSeconds": 86400 }
```

**`GET /api/status/config/:configId`** — Protection config details

**`GET /api/status/health/:userAddress`** — Current Aave health factor

**`GET /api/status/configs`** — All active config IDs

**`GET /health`** — Server health + RC balance check

### 402-gated endpoint

**`POST /api/protect/liquidation`** — Create protection config

```json
{
  "protectedUser": "0x...",
  "protectionType": 0,
  "healthFactorThreshold": "1500000000000000000",
  "targetHealthFactor": "2000000000000000000",
  "collateralAsset": "0x4200000000000000000000000000000000000006",
  "debtAsset": "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
  "preferDebtRepayment": false,
  "duration": 86400
}
```

Protection types: `0` = collateral deposit, `1` = debt repayment, `2` = both

### Config management (free, owner-only)

**`POST /api/protect/liquidation/pause`** — Pause a config
```json
{ "configId": 0 }
```

**`POST /api/protect/liquidation/resume`** — Resume a paused config

**`POST /api/protect/liquidation/cancel`** — Cancel a config permanently

---

## AI Agent Integration

### What an agent needs

An AI agent needs three things to use this service:

1. **A wallet with USDC on Base Sepolia** — Get from [faucet.circle.com](https://faucet.circle.com). The x402 payment is 0.30 USDC for 1 day of protection.
2. **x402 payment capability** — The `@x402/fetch` SDK handles 402 responses automatically: it sees the 402, signs the EIP-3009 authorization with the agent's private key, and retries the request. No separate facilitator interaction needed by the agent.
3. **One on-chain approval** — Before protection can execute, the agent must call `ERC20.approve(callbackContract, amount)` for the collateral and/or debt assets on Base Sepolia. This is the only step that requires direct chain interaction beyond x402.

### Is the OpenAPI spec enough?

**Almost.** The spec covers full discovery and interaction. But the token approval step (step 3 above) is a direct EVM transaction — not an API call. An agent that can only make HTTP requests will need to be told: *"after registering, approve the callback contract to spend your tokens."* The `nextSteps` array in the API response tells it exactly which contract to approve and which assets.

For a fully autonomous agent (one that can also sign EVM transactions), the OpenAPI spec is sufficient — it documents the approval requirement in the endpoint description.

### OpenClaw / Claude / LangChain integration

```typescript
// 1. Register the OpenAPI spec as a tool source
// Point your agent framework at: http://localhost:3000/openapi.yaml
// The agent will discover: listServices, getQuote, createLiquidationProtection,
//   pauseLiquidationProtection, resumeLiquidationProtection, cancelLiquidationProtection,
//   getProtectionConfig, getHealthFactor, listActiveConfigs, getServerHealth

// 2. The agent needs x402 fetch wrapper for payment
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(AGENT_PRIVATE_KEY);
const client = new x402Client();
registerExactEvmScheme(client, { signer: account });
const x402Fetch = wrapFetchWithPayment(fetch, client);

// All HTTP calls go through x402Fetch — 402 responses are handled transparently.
// Free endpoints (services, quote, status) work with plain fetch too.

// 3. One-time approval before protection can execute
// Agent calls this on Base Sepolia for each asset it wants to use:
//   ERC20(collateralAsset).approve(callbackContractAddress, largeAmount)
//   ERC20(debtAsset).approve(callbackContractAddress, largeAmount)
```

### Full agent example

```typescript
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const SERVER = "http://localhost:3000";
const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
registerExactEvmScheme(client, { signer: account });
const x402Fetch = wrapFetchWithPayment(fetch, client);

// Discover
const { services } = await (await fetch(`${SERVER}/api/services`)).json();

// Quote
const { priceBaseUnits } = await (await fetch(`${SERVER}/api/quote`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ service: "aave-protection", durationSeconds: 86400 }),
})).json();

// Pay and register (x402 handles the 402 → sign → retry automatically)
const res = await x402Fetch(`${SERVER}/api/protect/liquidation`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    protectedUser: account.address,
    protectionType: 2,                            // BOTH: collateral + debt
    healthFactorThreshold: "1500000000000000000", // trigger at HF 1.5
    targetHealthFactor: "2000000000000000000",    // restore to HF 2.0
    collateralAsset: "0x4200000000000000000000000000000000000006", // WETH
    debtAsset: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",       // Aave USDC
    preferDebtRepayment: false,
    duration: 86400,
  }),
});

const { configId, nextSteps } = await res.json();
// configId: "0"
// nextSteps: ["Approve AaveProtectionCallback (0x24df...) to spend your WETH and USDC"]

// Monitor
const config = await (await fetch(`${SERVER}/api/status/config/${configId}`)).json();
// { status: "Active", executionCount: 0, healthFactorThreshold: "1500000000000000000", ... }
```

---

## Funding Pipeline

```
$0.30 USDC payment
  │
  ├─ 20% ($0.06) ──> server margin (stays as USDC)
  │
  └─ 80% ($0.24) ──> Uniswap V3 swap ──> ETH
                       │
                       ├─ 15% ETH ──> gas reserve (stays on Base Sepolia)
                       │
                       └─ 85% ETH ──> Reactive Network bridge ──> REACT on Lasna
                                       (funds RC for callback delivery)
```

Set `BRIDGE_MODE=live` in `.env` to activate automated swap. Default is dry-run (logged only, fund RC manually).

---

## Reactive Network Details

| Item | Value |
|---|---|
| Testnet name | Lasna |
| Chain ID | 5318007 |
| RPC | `https://lasna-rpc.rnk.dev/` |
| Explorer | `https://lasna.reactscan.net` |
| Callback Proxy (Base Sepolia) | `0xa6eA49Ed671B8a4dfCDd34E36b7a75Ac79B8A5a6` |
| Callback Proxy (Sepolia) | `0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA` |
| CRON_100 topic (~12 min) | `0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70` |
| lREACT faucet (Sepolia) | Send ETH to `0x9b9BB25f1A81078C544C829c5EB7822d747Cf434` (max 5 ETH/tx) |
| lREACT faucet (Base Sepolia) | Send ETH to `0x2afaFD298b23b62760711756088F75B7409f5967` |

---

## Adding a New Service

1. Write and deploy CC + RC (inheriting `AbstractCallback` / `AbstractPausableReactive`)
2. Add ABI file in `src/abis/`
3. Add entry to `src/config/services.ts`
4. Add 402-gated route + chain helpers
5. Set env vars, restart

---

## Design Decisions

| Decision | Why |
|---|---|
| Server separate from contracts | Contracts deploy via Foundry; server is API + bridge |
| Specialized contracts per service | Isolation, independent deploy, no shared state risk |
| RC stateless in react() | react() can't read post-deploy state; CC owns all logic |
| Lazy cron subscription | RC only subscribes to CRON when active configs exist |
| Self-callbacks for RC state | react() emits Callback to itself; callbackOnly persists |
| address sender first param | Reactive Network mandatory pattern for all callback targets |
| Integer pricing (bigint) | No float drift. Multiply before divide. |
| BRIDGE_MODE toggle | Dry-run by default. Live only after testing swap + bridge. |
| Two USDC addresses | Circle USDC for x402 payments; Aave uses its own testnet USDC |

---

## x402 Protocol Reference

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
Testnet facilitator:           https://x402.org/facilitator
Base Sepolia RPC:              https://sepolia.base.org
Lasna RPC:                     https://lasna-rpc.rnk.dev/
Lasna explorer:                https://lasna.reactscan.net
USDC faucet (payments):        https://faucet.circle.com (Base Sepolia) → 0x036CbD53842c5426634e7929541eC2318f3dCF7e
USDC faucet (Aave):            Get from Aave testnet app (Base Sepolia) → 0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f
x402 npm:                      @x402/express @x402/core @x402/evm @x402/fetch
Callback Proxy (Base Sepolia): 0xa6eA49Ed671B8a4dfCDd34E36b7a75Ac79B8A5a6
AaveProtectionCallback:        0x24df0bBC9c4b95e8643848EC6B7f0Ac638BD3476
AaveProtectionReactive:        0xb1d20ecA7e6e6998A985C41Ae69695125F67619D
```
