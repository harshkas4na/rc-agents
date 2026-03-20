# x402 Protocol — Facilitators

## What Is a Facilitator?

A facilitator is the critical infrastructure layer that bridges HTTP payment authorization and on-chain settlement. When a resource server receives a signed payment from a client, it doesn't settle on-chain itself — it delegates to a facilitator.

The facilitator:
1. **Validates** the payment authorization (signature, balance, parameters)
2. **Submits** the on-chain transfer (`transferWithAuthorization` on USDC)
3. **Returns** the transaction hash to the server

Without a facilitator, building an x402 server would require every API operator to manage their own blockchain node, pay gas, handle nonce management, and monitor transaction confirmations. Facilitators abstract all of that.

---

## Trust Model

**Can facilitators steal funds?**

No. The EIP-3009 authorization is cryptographically bound to:
- A specific `from` (payer) and `to` (recipient) address
- An exact `value` amount
- A time window (`validAfter`/`validBefore`)
- A one-time `nonce`

The facilitator can only execute the exact transfer the payer authorized. It cannot change the recipient, increase the amount, or reuse the authorization. Even if a facilitator is compromised, the worst outcome is a failed settlement (no transfer happens) — the attacker cannot redirect funds.

The resource server controls which facilitator it trusts. A server can run its own facilitator for maximum control.

---

## Facilitator API (Required Endpoints)

Any compliant facilitator must implement:

### `GET /supported`

Returns which scheme+network pairs this facilitator handles.

```json
{
  "schemes": [
    { "scheme": "exact", "network": "eip155:8453" },
    { "scheme": "exact", "network": "eip155:84532" },
    { "scheme": "exact", "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" }
  ]
}
```

### `POST /verify`

Validates a payment payload *before* the server delivers the resource. The server should call this before consuming any compute.

**Request:**
```json
{
  "x402Version": 2,
  "paymentPayload": {
    "x402Version": 2,
    "scheme": "exact",
    "network": "eip155:8453",
    "payload": {
      "signature": "0x...",
      "authorization": {
        "from": "0xPayer",
        "to": "0xRecipient",
        "value": "1000",
        "validAfter": "1740672089",
        "validBefore": "1740672389",
        "nonce": "0x..."
      }
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "eip155:8453",
    "maxAmountRequired": "1000",
    "payTo": "0xRecipient",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "maxTimeoutSeconds": 300
  }
}
```

**Response (valid):**
```json
{
  "isValid": true,
  "payer": "0xPayerAddress",
  "invalidReason": null
}
```

**Response (invalid):**
```json
{
  "isValid": false,
  "payer": null,
  "invalidReason": "insufficient_balance"
}
```

Invalid reasons include:
- `invalid_signature` — EIP-712 signature doesn't match authorization
- `insufficient_balance` — Payer doesn't have enough USDC
- `amount_mismatch` — `value` doesn't match `maxAmountRequired`
- `recipient_mismatch` — `to` doesn't match `payTo`
- `expired` — `validBefore` is in the past
- `nonce_used` — This nonce was already spent

### `POST /settle`

Executes the on-chain transfer. Called after `/verify` succeeds and the server has committed to delivering the resource.

**Request:** Same structure as `/verify`

**Response (success):**
```json
{
  "success": true,
  "txHash": "0xabc123def456...",
  "network": "eip155:8453",
  "payer": "0xPayerAddress",
  "errorReason": null
}
```

**Response (failure):**
```json
{
  "success": false,
  "txHash": null,
  "network": "eip155:8453",
  "payer": null,
  "errorReason": "transaction_reverted"
}
```

### `GET /discovery/resources` (Optional)

For Bazaar marketplace integration — returns indexed x402 resources this facilitator has processed.

---

## Available Facilitators

### Coinbase CDP Facilitator (Official)

| Property | Value |
|---|---|
| URL (testnet) | `https://x402.org/facilitator` |
| URL (mainnet) | `https://api.cdp.coinbase.com/platform/v2/x402` |
| Networks | Base Mainnet, Base Sepolia, Solana Mainnet, Solana Devnet |
| Free tier | 1,000 transactions/month |
| Paid tier | $0.001/transaction |
| API keys | Required for mainnet |
| SLA | Production-grade |

The testnet facilitator at `x402.org/facilitator` requires no API keys and supports Base Sepolia + Solana Devnet. Use this for development.

### Community Facilitators

| Facilitator | Networks | Notes | Free? |
|---|---|---|---|
| **PayAI** | All networks | Multi-chain, fully permissionless, no API keys | Yes |
| **thirdweb (Nexus)** | 170+ chains | Hosted proxy with discovery + reputation layer | Freemium |
| **0x402.ai** | Multiple EVM chains | Cloud infrastructure, easy setup | Freemium |
| **RelAI** | EVM chains | Gas-sponsored payments | Yes |
| **OpenFacilitator** | Base, Solana | Open-source reference implementation | Yes |
| **Mogami** | Multiple | Java-based, developer-focused | Yes |
| **AutoIncentive** | Base + Solana | Free facilitator | Yes |
| **Heurist** | EVM | Enterprise-grade | No |
| **SolPay** | Solana | Escrow support | Freemium |
| **GoPlausible** | Algorand | Non-EVM | Yes |
| **TZ APAC (Tez402)** | Etherlink | Tezos L2, ERC-20 with Permit2 proxy | Yes |
| **fretchen.eu** | Optimism, Base | Production V2 | Yes |
| **x402.rs** | Avalanche + others | Rust implementation | Yes |
| **Corbits/Faremeter** | Multi-network, multi-token | TypeScript framework | Yes |

### Choosing a Facilitator

For most use cases:
- **Development/testnet**: `https://x402.org/facilitator` — no setup required
- **Production on Base**: Coinbase CDP facilitator — best reliability, 1k free tx/month
- **Multi-chain production**: PayAI or thirdweb Nexus
- **Maximum control**: Run your own

---

## Running Your Own Facilitator

### When to Self-Host

- You need custom token support (not just USDC/EURC)
- You need custom network support
- You want zero external dependencies in your payment stack
- You need to keep transaction data private
- You want to capture facilitator fees yourself
- Compliance requirements prohibit third-party payment processors

### Quick Start (TypeScript)

```bash
git clone https://github.com/coinbase/x402
cd x402/typescript/packages/x402-facilitator
npm install
cp .env.example .env
```

```bash
# .env
PRIVATE_KEY=0xYourFacilitatorPrivateKey  # Needs ETH for gas
RPC_URL_8453=https://mainnet.base.org
RPC_URL_84532=https://sepolia.base.org
PORT=8547
```

```bash
npm run build && npm start
# Facilitator running on http://localhost:8547
```

### Facilitator Architecture (Simplified)

```typescript
import express from "express";
import { ethers } from "ethers";
import { verifyPayment, settlePayment } from "@x402/core";
import { ExactEvmScheme } from "@x402/evm";

const app = express();
app.use(express.json());

const providers: Record<string, ethers.Provider> = {
  "eip155:8453": new ethers.JsonRpcProvider("https://mainnet.base.org"),
  "eip155:84532": new ethers.JsonRpcProvider("https://sepolia.base.org"),
};

const signer = new ethers.Wallet(
  process.env.PRIVATE_KEY!,
  providers["eip155:8453"]
);

app.get("/supported", (req, res) => {
  res.json({
    schemes: [
      { scheme: "exact", network: "eip155:8453" },
      { scheme: "exact", network: "eip155:84532" },
    ],
  });
});

app.post("/verify", async (req, res) => {
  const { paymentPayload, paymentRequirements } = req.body;
  try {
    const result = await verifyPayment(
      paymentPayload,
      paymentRequirements,
      providers[paymentRequirements.network]
    );
    res.json(result);
  } catch (e) {
    res.status(400).json({ isValid: false, invalidReason: e.message });
  }
});

app.post("/settle", async (req, res) => {
  const { paymentPayload, paymentRequirements } = req.body;
  try {
    const result = await settlePayment(
      paymentPayload,
      paymentRequirements,
      signer.connect(providers[paymentRequirements.network])
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, errorReason: e.message });
  }
});

app.listen(8547, () => console.log("Facilitator running on :8547"));
```

### Rust Facilitator (x402-rs)

For high-performance deployments:

```bash
cargo add x402-rs
```

```rust
use x402_rs::{Facilitator, EvmExactScheme, FacilitatorConfig};

#[tokio::main]
async fn main() {
    let facilitator = Facilitator::new(FacilitatorConfig {
        schemes: vec![
            Box::new(EvmExactScheme::new("eip155:8453", rpc_url, private_key)),
        ],
    });

    facilitator.serve("0.0.0.0:8547").await.unwrap();
}
```

### Go Facilitator

```go
import "github.com/coinbase/x402/go/facilitator"

fac := facilitator.New(facilitator.Config{
    PrivateKey: os.Getenv("PRIVATE_KEY"),
    Networks: map[string]string{
        "eip155:8453": "https://mainnet.base.org",
    },
})
fac.ListenAndServe(":8547")
```

---

## Gas Management

The facilitator wallet needs ETH for gas. Rule of thumb for Base:

| Transaction Volume | Monthly ETH Cost |
|---|---|
| 1,000 tx/month | ~$0.10 |
| 100,000 tx/month | ~$10 |
| 1,000,000 tx/month | ~$100 |

Base L2 gas is extremely cheap (~$0.0001/tx). Monitor the facilitator wallet balance and top up proactively.

For Solana, the facilitator pays lamports (~$0.00025/tx at typical priority fees).

### Gas Estimation Pattern

```typescript
// Pre-estimate gas before committing to settle
const gasEstimate = await provider.estimateGas({
  to: USDC_CONTRACT,
  data: usdcInterface.encodeFunctionData("transferWithAuthorization", [
    from, to, value, validAfter, validBefore, nonce, v, r, s
  ]),
});

// Add 20% buffer
const gasLimit = (gasEstimate * 120n) / 100n;
```

---

## Facilitator Revenue Models

### Zero-Fee (Currently Standard)

Most facilitators, including the CDP facilitator's base tier, charge nothing beyond blockchain gas. Revenue comes from:
- Platform growth (Coinbase: CDP user acquisition)
- Developer relationships (thirdweb: SDK → services funnel)
- Volume-based SLA tiers

### Transaction Fee Model

A facilitator could take a basis-point fee on each settlement by reducing the `to` amount and routing the difference to itself. However this would break the guarantee that `value` in the authorization matches what the server receives. V2 extensions are exploring clean fee-taking mechanisms.

### Subscription Model

Heurist and enterprise facilitators charge monthly subscriptions for:
- Higher rate limits
- SLA guarantees
- Multi-region redundancy
- Compliance features (OFAC screening, audit logs)

---

## Facilitator Security Checklist

When operating a production facilitator:

- [ ] Store private key in HSM or cloud KMS (AWS KMS, GCP Cloud HSM)
- [ ] Implement rate limiting per IP and per payer address
- [ ] Add nonce tracking (mark used nonces to prevent double-settle)
- [ ] Validate `validBefore` against current block time (not just wall clock)
- [ ] Monitor gas wallet balance with alerts
- [ ] Log all settlements with full payload for audit trail
- [ ] Implement circuit breaker for RPC failures
- [ ] Use multiple RPC providers with failover (Alchemy + QuickNode + Infura)
- [ ] Enforce HTTPS / TLS 1.3
- [ ] Implement request signing between resource server and facilitator (optional but recommended)

---

*See also: [`02-how-it-works.md`](./02-how-it-works.md) for the protocol flow, [`07-limitations.md`](./07-limitations.md) for facilitator economic concerns.*
