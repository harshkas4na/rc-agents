# rc-agents

**Autonomous on-chain automation that AI agents can buy with a single HTTP request.**

An agent sends `$0.24` of USDC. It gets back a smart contract that keeps working after the agent is gone — dollar-cost averaging on a Bitcoin L2, or defending a lending position against liquidation. No account, no API key, no signup, no human in the loop.

**Live:** [rc-agents.vercel.app](https://rc-agents.vercel.app) · [`/skills.md`](https://rc-agents.vercel.app/skills.md) (for agents) · [`/openapi.yaml`](https://rc-agents.vercel.app/openapi.yaml) (OpenAPI 3.1) · [`/api/dashboard`](https://rc-agents.vercel.app/api/dashboard) (live on-chain state)

---

## The problem this solves

An AI agent can decide. It cannot *persist*.

Ask an agent to buy a little BTC every hour for the next month, or to keep your position from being liquidated overnight, and it hits a wall that has nothing to do with intelligence: when the process exits, the intent dies with it. The usual workarounds all reintroduce the thing agents were supposed to remove — a server someone has to keep alive, a keeper bot someone has to trust, a custodial account someone has to open.

**rc-agents sells persistence as a metered service.** The agent pays per use over plain HTTP using [x402](https://x402.org), and an audited contract carries out the instruction autonomously for the duration purchased. The agent's wallet *is* its identity. There is nothing to sign up for, and nothing to trust beyond code that anyone can read and anyone can call.

That is the shape of an agent-native business: a machine-readable service, priced in fractions of a cent, that another machine can discover, evaluate, purchase, and verify without a human ever opening a browser.

---

## What's running right now

Every number below is a live on-chain read, visible on the [dashboard](https://rc-agents.vercel.app) and independently checkable on a block explorer.

| Service | Executes on | Automation model | Price |
|---|---|---|---|
| **DCA Strategy** | GOAT Testnet3 (Bitcoin L2) | Permissionless on-chain function | $0.20/day |
| **Aave Liquidation Protection** | Base Sepolia | Reactive Smart Contracts | $0.25/day |

Payment is always USDC on Base Sepolia — that's where the x402 facilitator lives. Only *execution* moves between chains. All services are on testnet; this is a working system, not a custodian of real funds.

---

## On GOAT Network

GOAT is a Bitcoin L2 built on BitVM2 — Bitcoin security with an EVM execution layer, and BTC itself as the gas token. That combination is the interesting one for agent payments: an agent transacting against Bitcoin-backed settlement, at gas prices low enough that per-swap automation isn't absurd. Deploying the entire system here — seven contracts, a seeded liquidity position, and two end-to-end swap tests — cost roughly **5 microBTC**.

### The design question GOAT forced, and what came out of it

The original version of this project ran on Reactive Smart Contracts: an off-chain network watches for events and calls your contract, so nobody has to run a keeper. Bringing it to GOAT meant answering three questions with evidence rather than assumption — and the answers changed the architecture for the better.

**1. Reactive Network does not reach GOAT.** Verified directly against `dev.reactive.network/origins-and-destinations`: GOAT appears as neither origin nor destination, on mainnet or testnet. Chainlink Automation and Gelato don't cover it either — GOAT's BitVM2 testnet is new enough that the incumbent automation networks haven't integrated it. A straight port was never an option.

**2. GoatSwap and BIMA are mainnet-only.** GoatSwap's `SwapRouter02` has 48,226 real transactions on GOAT's Alpha Mainnet; the same address on Testnet3 is an empty EOA with zero transactions. BIMA turned out to be a deeper mismatch than a missing address — its own documentation describes borrowing as *permissioned institutional* with collateral in *qualified custody*. That's off-chain and KYC'd: there is no open, on-chain health factor for an agent to defend, so it can't stand in for Aave regardless of which network it's on.

**3. So what actually makes automation trustless?** Strip Reactive Network, Chainlink Automation, and Gelato down and they are the same machine: a marketplace of off-chain callers competing to hit a public on-chain function. The trust doesn't come from *who* calls it. It comes from the function being **open to anyone** and doing exactly what its audited code says.

Which means the automation layer was never the load-bearing part — the property was. GOAT already demonstrates this pattern natively: BIMA's liquidations are permissionless and bounty-incentivized, driven by open competition rather than a privileged relay.

So the GOAT deployment doesn't emulate Reactive Network. It implements the property directly:

```solidity
// DCAStrategyCallbackGoat.sol
function executeDCAOrders() external returns (uint256 swapsExecuted) {
```

**No `onlyOwner`. No `authorizedSenderOnly`. No access-control modifier of any kind.**

This server runs a scheduler that calls it every 60 seconds — but that scheduler holds no privilege whatsoever. Any wallet on GOAT can make the identical call and produce the identical result. If this server disappeared tomorrow, every active DCA order would remain executable by anyone who cared to execute it. That is a *stronger* guarantee than the original design, and it arrived because GOAT had no automation network to lean on.

### Deployed on GOAT Testnet3 (chain ID `48816`)

| Contract | Address | What it is |
|---|---|---|
| `DCAStrategyCallbackGoat` | [`0xd630cf0E2e9bcB0d76c25Eb87C1cBE9e3eDFdad7`](https://explorer.testnet3.goat.network/address/0xd630cf0E2e9bcB0d76c25Eb87C1cBE9e3eDFdad7) | The automation contract — permissionless execution |
| `UniswapV3Factory` | [`0x481294586d888EA5E409cd9719E79308c5996775`](https://explorer.testnet3.goat.network/address/0x481294586d888EA5E409cd9719E79308c5996775) | Unmodified, audited Uniswap V3 Core (`lib/v3-core`) |
| dUSDC/WGBTC Pool | [`0x2e99414793de595ad6cdcc1aa0dfc6b33c1bce36`](https://explorer.testnet3.goat.network/address/0x2e99414793de595ad6cdcc1aa0dfc6b33c1bce36) | Real pool with seeded liquidity |
| `MiniSwapRouter` | `0xB38E85B614EF50E2A60c9F4781A1b128f0fB7246` | Minimal swap router over the pool |
| `LiquidityHelper` | `0x5f474dB0470e7102072517b0991e487Dd785cA4F` | Position seeding |
| `DemoUSDC` (dUSDC) | `0xF35b99BaE312FD59145F5eBE4482fD433d1C7E20` | Testnet stablecoin stand-in |
| WGBTC | `0xbC10000000000000000000000000000000000000` | GOAT's canonical wrapped-native predeploy |

Since GoatSwap has no Testnet3 presence, the swap venue is a real deployment of **unmodified Uniswap V3 Core** rather than a mock AMM — the same audited code securing billions elsewhere. Pool pricing reflects the liquidity we seeded, so the exchange rate is a testnet artifact, not a market rate. The AMM mechanics underneath are the genuine article.

### Verified end-to-end

Not a plan and not a unit test — a real config paid for, created, and executed on-chain:

```
createDCAConfig()    0xd214e0f67cd091284a7340a6755d53f56de1c0fd3c81e33cd8a42d3320f99d2a
executeDCAOrders()   0x95cb92330416a5e96e1ac5872ef8c1031321b86eb52391b5555bc3c27b68524f
                     → 1 dUSDC swapped for WGBTC through the V3 pool
                     → config auto-marked Completed after its final swap
```

Full deployment record, every transaction hash, and a genuine `eth_estimateGas` trap hit and fixed along the way — the estimator converges too low because the swap is wrapped in `try/catch`, so the outer call "succeeds" while the inner swap silently runs out of gas: [`goat-research/07-testnet3-deployment.md`](./goat-research/07-testnet3-deployment.md).

The complete research trail — GOAT's architecture, the grants program, on-chain verification of every third-party address, and the automation-alternatives analysis behind the permissionless design — lives in [`/goat-research`](./goat-research/README.md).

---

## How an agent uses it

```
1. GET  /api/services              → discover services, pricing, status
2. POST /api/goat/dca/activate     → 402 Payment Required + exact quote
3. Sign EIP-3009, retry            → 200, automation live on-chain
```

The `402` is the price quote, not an error. An x402 client library handles the loop:

```typescript
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
const pay = wrapFetchWithPayment(fetch, account);   // 402 → sign → retry

const res = await pay("https://rc-agents.vercel.app/api/goat/dca/activate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    user: account.address,
    amountPerSwap: "1000000",   // 1 dUSDC (6 decimals)
    totalSwaps: 24,
    swapInterval: 3600,         // one hour between swaps
    duration: 86400,            // paying for one day
  }),
});

const { configId, txHash, nextSteps } = await res.json();
```

Then one on-chain approval — paying activates the automation, but the contract still needs permission to move the user's tokens:

```solidity
ERC20(dUSDC).approve(dcaStrategyCallbackGoat, amountPerSwap * totalSwaps);
```

Agents can read [`/skills.md`](https://rc-agents.vercel.app/skills.md) for the full operating guide — when to reach for each service, failure modes, and the approval step that's easiest to miss — and [`/openapi.yaml`](https://rc-agents.vercel.app/openapi.yaml) for machine-readable schemas that agent frameworks can register as tools directly.

---

## Verification is part of the product

Agents transact without supervision, so the people behind them need a way to check the machine's work. [rc-agents.vercel.app](https://rc-agents.vercel.app) is a **read-only monitoring surface**: contract addresses linked to explorers, executor gas, every DCA config with its swap history, and lifetime execution totals. Nothing on that page can change on-chain state — it exists to be audited, not operated. The same data is available as JSON at [`/api/dashboard`](https://rc-agents.vercel.app/api/dashboard) and as a funding check at [`/health`](https://rc-agents.vercel.app/health).

---

## Architecture

```
AI Agent (wallet = identity)
    │
    │  GET  /api/services              discover
    │  POST /api/goat/dca/activate     purchase
    │
    ▼
x402 Server ──────► 402: pay $0.24 USDC on Base Sepolia
    │
    │  Agent signs EIP-3009, retries with payment
    ▼
Payment settles on-chain (Base Sepolia)
    │
    ├─────────────────────────────┬──────────────────────────────┐
    ▼                             ▼                              ▼
GOAT Testnet3                 Base Sepolia                  Base Sepolia
DCAStrategyCallbackGoat       AaveProtectionCallback         bridge.ts
createDCAConfig()             createProtectionConfig()       splits USDC →
    │                             │                          gas + RC funding
    ▼                             ▼
executeDCAOrders()            Reactive Contract (Lasna)
NO ACCESS CONTROL             CRON_100 tick (~12 min)
anyone may call                   │
    │                             ▼
    ▼                         checkAndProtectPositions()
Uniswap V3 swap               HF < threshold? supply / repay
dUSDC → WGBTC
```

Two automation models, one payment rail. On Base Sepolia, a Reactive Contract on Lasna subscribes to a CRON topic and calls back into the Callback Contract. On GOAT, there is no relay at all — the execution function is simply open.

### Repository layout

```
src/
  server/
    index.ts           Express + x402 middleware, all API routes
    chain.ts           viem clients — Base Sepolia + Lasna
    chain-goat.ts      viem clients — GOAT Testnet3
    goat-scheduler.ts  unprivileged caller for executeDCAOrders()
    bridge.ts          USDC → ETH → REACT funding pipeline
    landing.ts         read-only monitoring dashboard
  contracts/
    goat/
      DCAStrategyCallbackGoat.sol   permissionless DCA execution
      MiniSwapRouter.sol            minimal V3 router
      LiquidityHelper.sol           pool seeding
      DemoUSDC.sol                  testnet stablecoin
    AaveProtectionCallback.sol      CC — Base Sepolia
    AaveProtectionReactive.sol      RC — Lasna
    DCAStrategyCallback.sol         CC — Base Sepolia
    DCAStrategyReactive.sol         RC — Lasna
  config/
    contracts.ts       addresses, callback proxies, cron topics, chain IDs
    services.ts        service catalog + integer pricing
lib/v3-core            Uniswap V3 Core (git submodule, unmodified)
goat-research/         GOAT findings and architecture decision trail
SKILLS.md              agent-facing skill card, served at /skills.md
```

---

## API reference

### Free — read anything, pay for nothing

| Endpoint | Returns |
|---|---|
| `GET /api/services` | catalog, pricing, per-service status |
| `POST /api/quote` | exact price for a service + duration |
| `GET /api/dashboard` | full live on-chain state |
| `GET /health` | whether automation contracts are funded |
| `GET /api/goat/dca/config/:id` | one GOAT config: swaps executed, amount received |
| `GET /api/goat/dca/user/:address` | every GOAT config for a user |
| `GET /api/status/config/:id` | one protection config |
| `GET /api/status/health/:address` | a user's live Aave health factor |
| `POST /api/approve/permit` | relay an EIP-2612 permit for HTTP-only agents |

Pause, resume, and cancel are free across all services. Cancelling does not refund remaining duration.

### Paid (x402)

**`POST /api/goat/dca/activate`** — DCA on GOAT Testnet3

| Field | Type | Notes |
|---|---|---|
| `user` | address | must hold dUSDC and approve the contract |
| `amountPerSwap` | string | base units, 6 decimals |
| `totalSwaps` | int | `0` = run until expiry or cancel |
| `swapInterval` | int | seconds, minimum `60` |
| `minAmountOut` | string | slippage floor; `"0"` disables |
| `duration` | int | seconds, 3600–2592000 |

**`POST /api/protect/liquidation`** — Aave liquidation protection

| Field | Type | Notes |
|---|---|---|
| `protectedUser` | address | whose position to watch |
| `protectionType` | int | `0` collateral, `1` repay debt, `2` both |
| `healthFactorThreshold` | string | 18 decimals — `"1500000000000000000"` = HF 1.5 |
| `targetHealthFactor` | string | 18 decimals, must exceed the threshold |
| `duration` | int | seconds, 3600–2592000 |

Pricing is integer math throughout — `pricePerDay × duration / 86400`, plus a 20% gas buffer, no floating point anywhere in the path.

---

## Running it yourself

```bash
git clone --recursive https://github.com/harshkas4na/rc-agents
cd rc-agents && npm install
cp .env.example .env
npm run dev
```

| Variable | What it is |
|---|---|
| `SERVER_WALLET_ADDRESS` / `SERVER_PRIVATE_KEY` | receives x402 USDC, owns the callback contracts |
| `GOAT_DEPLOYER_PRIVATE_KEY` | owns `DCAStrategyCallbackGoat`, pays scheduler gas |
| `AAVE_PROTECTION_CALLBACK_ADDRESS` | CC on Base Sepolia |
| `AAVE_PROTECTION_REACTIVE_ADDRESS` | RC on Lasna |

BTC for GOAT Testnet3 gas: [bridge.testnet3.goat.network/faucet](https://bridge.testnet3.goat.network/faucet). USDC for x402 payments: [faucet.circle.com](https://faucet.circle.com).

On a persistent host, `goat-scheduler.ts` polls `executeDCAOrders()` every 60 seconds. On serverless, `POST|GET /api/goat/dca/tick` does the same thing once per invocation and can be driven by any external scheduler — or by nobody at all, since the underlying function is open to every wallet on the network.

---

## Reference

| Chain | ID | RPC |
|---|---|---|
| GOAT Testnet3 | `48816` | `https://rpc.testnet3.goat.network` |
| Base Sepolia | `84532` | `https://sepolia.base.org` |
| Lasna (Reactive) | `5318007` | `https://lasna-rpc.rnk.dev/` |

| Contract | Address |
|---|---|
| AaveProtectionCallback (CC) | `0x24df0bBC9c4b95e8643848EC6B7f0Ac638BD3476` |
| AaveProtectionReactive (RC) | `0xb1d20ecA7e6e6998A985C41Ae69695125F67619D` |
| USDC — x402 payments | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| USDC — Aave testnet | `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f` |
| Callback Proxy (Base Sepolia) | `0xa6eA49Ed671B8a4dfCDd34E36b7a75Ac79B8A5a6` |
| CRON_100 topic (~12 min) | `0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70` |

Aave uses a different USDC than x402 does — that's a real trap on Base Sepolia, and both addresses are pinned in `src/config/contracts.ts` for exactly that reason.

Background research on the x402 protocol itself — flow, headers, EIP-712/3009, facilitators, ecosystem, and honest limitations — is in [`01-overview.md`](./01-overview.md) through [`07-limitations.md`](./07-limitations.md).

---

## Where this goes next

**Liquidation protection on GOAT.** The permissionless execution pattern generalizes directly from DCA to health-factor defense — the contract shape is nearly identical. What it needs is an open, on-chain money market on GOAT to defend a position in. BIMA's permissioned-custody model isn't one, and that's a fact about today's ecosystem rather than a limitation of this design. When an open lending market lands on GOAT, protection ships against it.

**Mainnet.** GoatSwap is live and busy on GOAT Alpha Mainnet with real liquidity, which removes the reason we deployed our own Uniswap V3 Core. Mainnet execution routes through GoatSwap rather than a self-deployed venue.

**Bounty-funded execution.** `DCAStrategyCallbackGoat` already carries an `executionBounty` field. Funding it turns the permissionless call into a paid one, so third-party executors have an economic reason to compete — closing the loop on automation that needs no operator at all.
