# rc-agents — on-chain DeFi automation, paid per use

**Base URL:** `https://rc-agents.vercel.app`
**Machine-readable schema:** `https://rc-agents.vercel.app/openapi.yaml` (OpenAPI 3.1)
**Payment:** [x402](https://x402.org) — USDC on Base Sepolia. No account, no API key, no signup.

You are reading the skill card. The OpenAPI spec tells you *what the endpoints are*;
this document tells you *when to reach for them* and *how the payment loop actually
behaves*, which is the part that trips up first-time callers.

---

## What this is for

Your user wants something to keep happening on-chain after the conversation ends —
a position defended, a buy repeated on a schedule. You cannot stay running to do
that yourself, and you should not have to.

rc-agents sells that persistence as a service. You pay a few cents of USDC over
HTTP, and an audited smart contract carries out the instruction autonomously for
the duration you paid for. When your process dies, the automation does not.

**Reach for this when the user asks for:**

- "Don't let me get liquidated on Aave" → `aave-protection`
- "Buy a fixed amount of X every N minutes" → `dca-strategy` (Base Sepolia) or `dca-strategy-goat` (GOAT)
- Any standing on-chain instruction that has to outlive your session

**Don't reach for this when:**

- The user wants a one-off swap right now — do that directly, you don't need automation
- The user needs mainnet execution — every service here is currently on testnet (see [Networks](#networks))
- You have no funded wallet to pay from, and no way to ask the user for one

---

## The payment loop (this is the part to get right)

Every paid endpoint follows the same three steps. The first request is *supposed*
to fail — a `402` is the price quote, not an error.

```
1. POST /api/goat/dca/activate  (no payment header)
   → 402 Payment Required
     body.accepts[0] = { scheme, network, payTo, asset, amount, extra }

2. Sign an EIP-3009 `transferWithAuthorization` for exactly that amount/asset/payTo.
   Encode it base64 and set it as the PAYMENT-SIGNATURE header.

3. Repeat the identical request with the header attached.
   → 200, and the automation is live on-chain.
```

**Use an x402 client library rather than hand-rolling step 2.** The signature is an
EIP-712 typed-data signature over a specific struct; getting a field wrong yields an
opaque rejection at the facilitator, not a useful error.

```ts
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
const pay = wrapFetchWithPayment(fetch, account);   // handles the 402 → sign → retry loop

const res = await pay("https://rc-agents.vercel.app/api/goat/dca/activate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    user: account.address,
    amountPerSwap: "1000000",   // 1 dUSDC (6 decimals)
    totalSwaps: 24,
    swapInterval: 3600,         // seconds between swaps
    duration: 86400,            // how long you're paying for
  }),
});

const { configId, txHash } = await res.json();
```

Your wallet needs **Base Sepolia USDC** (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`)
to pay, and a little native gas only if you plan to submit approvals yourself.

### Pricing — quote before you commit

Price scales with duration and carries a 20% gas buffer:

```
price = pricePerDay × (durationSeconds / 86400) × 1.2
```

| Service | Per day | 1 day | 7 days |
|---|---|---|---|
| `aave-protection` | $0.25 | $0.30 | $2.10 |
| `dca-strategy` | $0.20 | $0.24 | $1.68 |
| `dca-strategy-goat` | $0.20 | $0.24 | $1.68 |

Duration is clamped to **1 hour – 30 days**. To get an exact figure without
triggering a payment, ask first — this endpoint is free:

```bash
curl -s -X POST https://rc-agents.vercel.app/api/quote \
  -H 'Content-Type: application/json' \
  -d '{"service":"dca-strategy-goat","durationSeconds":604800}'
```

---

## The step agents forget: approve the contract

Paying activates the automation, but it does **not** give the contract permission to
touch the user's tokens. Those are two different things, and the automation will fail
silently at execution time if you skip the second.

After a successful activation, the response's `nextSteps` names the exact contract
address. The user's wallet must `approve()` that address to spend the input token:

- `dca-strategy-goat` → approve dUSDC to the GOAT DCA contract, for `amountPerSwap × totalSwaps`
- `dca-strategy` → approve `tokenIn` to `DCAStrategyCallback` on Base Sepolia
- `aave-protection` → approve the collateral and/or debt asset to `AaveProtectionCallback`

If you are an HTTP-only agent with no ability to submit transactions, you can still
grant an allowance for EIP-2612 tokens (USDC — **not** WETH) by having the user sign a
permit offline and relaying it here, free:

```
POST /api/approve/permit   { token, owner, spender, value, deadline, v, r, s }
```

---

## Services

### `dca-strategy-goat` — DCA on GOAT Network Testnet3

Periodic dUSDC → WGBTC swaps against a real, live Uniswap V3 Core pool on GOAT, a
Bitcoin L2 built on BitVM2.

`POST /api/goat/dca/activate` — **paid**

| Field | Type | Notes |
|---|---|---|
| `user` | address | who the swaps are for; must hold dUSDC and approve the contract |
| `amountPerSwap` | string | base units, dUSDC has 6 decimals |
| `totalSwaps` | int | `0` = run until expiry or cancel |
| `swapInterval` | int | seconds, minimum `60` |
| `minAmountOut` | string | slippage floor in base units; `"0"` disables it |
| `duration` | int | seconds, 3600–2592000 |

Token pair is fixed to dUSDC → WGBTC on this service; you do not pass token addresses.

**What makes this one different:** there is no privileged executor. The on-chain
`executeDCAOrders()` function has *no access-control modifier at all* — the server runs
a scheduler that calls it, but any wallet can call it and the result is identical. If
this server disappears, the automation is still executable by anyone. Reactive Network
does not support GOAT as a destination chain, so this permissionless-function pattern
replaces it rather than emulating it.

### `aave-protection` — Aave liquidation protection

Watches a health factor and acts before liquidation does.

`POST /api/protect/liquidation` — **paid**

| Field | Type | Notes |
|---|---|---|
| `protectedUser` | address | whose Aave position to watch |
| `protectionType` | int | `0` = supply collateral, `1` = repay debt, `2` = both |
| `healthFactorThreshold` | string | 18 decimals — `"1200000000000000000"` is HF 1.2 |
| `targetHealthFactor` | string | 18 decimals, must be **greater than** the threshold |
| `collateralAsset` | address | defaults to the testnet collateral token |
| `debtAsset` | address | defaults to WETH |
| `preferDebtRepayment` | bool | tie-breaker when `protectionType` is `2` |
| `duration` | int | seconds, 3600–2592000 |

Health factor is checked roughly every 12 minutes by a Reactive Contract on Lasna.
Pick a threshold with enough headroom to survive that interval — `1.05` is cutting it
far too close, `1.2`–`1.5` is sane.

### `dca-strategy` — DCA on Uniswap V3, Base Sepolia

`POST /api/dca/activate` — **paid**. Same shape as the GOAT variant, but you choose the
pair: `tokenIn`, `tokenOut`, and `poolFee` (`500`, `3000`, or `10000`). Executed via
Reactive Network rather than a permissionless function.

---

## Free endpoints — read state, never pay twice

Nothing below costs USDC. Use these to check on work already paid for instead of
re-activating.

| Endpoint | Returns |
|---|---|
| `GET /api/services` | live catalog + pricing |
| `POST /api/quote` | exact price for a service + duration |
| `GET /api/dashboard` | full live state of every service, as JSON |
| `GET /health` | whether the automation contracts are funded |
| `GET /api/goat/dca/config/:configId` | one GOAT config: swaps executed, amount received, status |
| `GET /api/goat/dca/user/:address` | every GOAT config for a user |
| `GET /api/dca/config/:configId`, `GET /api/dca/user/:address` | same, Base Sepolia |
| `GET /api/status/config/:configId` | one protection config |
| `GET /api/status/health/:address` | a user's current Aave health factor |

Pause, resume, and cancel are also free — `POST /api/{goat/dca,dca,protect/liquidation}/{pause,resume,cancel}`
with `{ "configId": N }`. **Cancelling does not refund** the remaining duration.

---

## Networks

Everything is currently on testnet. Do not present this to a user as protecting real funds.

| Concern | Chain | Chain ID |
|---|---|---|
| Payment (all services) | Base Sepolia | `84532` |
| Aave protection + Base DCA execution | Base Sepolia | `84532` |
| Reactive automation | Lasna | `5318007` |
| GOAT DCA execution | GOAT Testnet3 | `48816` |

Note the split: payment is **always** Base Sepolia USDC, even for the GOAT service.
Only execution moves chains.

---

## Failure modes worth handling

| You see | It means | Do this |
|---|---|---|
| `402` on first request | Normal — that's the quote | Sign and retry; don't surface it as an error |
| `503 Service temporarily unavailable` | Automation contract is out of gas | Don't retry in a loop; check `/health` and tell the user |
| `400 Invalid parameters` | Zod rejected the body | Read `details` — it names the offending field |
| `500 On-chain config creation failed` | The transaction reverted | Read `reason`; usually a bad address or an out-of-range value |
| Activation succeeded, no swaps ever execute | Missing token approval | See [approve the contract](#the-step-agents-forget-approve-the-contract) |

Before telling a user their automation is running, confirm it: fetch the config
endpoint and check that `status` is `Active` and `swapsExecuted` is advancing.
Activation means the config exists on-chain — it does not by itself prove the
first swap will clear.

---

## Source

`https://github.com/harshkas4na/rc-agents` — contracts, the GOAT research trail, and
the reasoning behind the permissionless-execution design.
