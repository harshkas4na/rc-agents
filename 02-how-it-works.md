# x402 Protocol — How It Works

## The Complete Payment Flow

From the outside, x402 looks like two HTTP requests. Internally, it is a 5-step process involving signature creation, on-chain verification, and settlement.

```
Step 1: Client sends a normal request — no payment info
Step 2: Server responds 402 with payment instructions in header
Step 3: Client signs an EIP-3009 authorization and retries
Step 4: Server forwards to facilitator → verify + settle on-chain
Step 5: Server delivers the resource + transaction hash
```

### Step-by-Step Sequence

```
Client                     Resource Server              Facilitator
  │                               │                          │
  │──── GET /resource ───────────►│                          │
  │                               │                          │
  │◄─── 402 PAYMENT-REQUIRED ─────│                          │
  │     (payment terms in header) │                          │
  │                               │                          │
  │  [Client constructs EIP-712   │                          │
  │   signed authorization]       │                          │
  │                               │                          │
  │──── GET /resource ───────────►│                          │
  │     PAYMENT-SIGNATURE: ...    │                          │
  │                               │──── POST /verify ───────►│
  │                               │◄─── {isValid: true} ─────│
  │                               │                          │
  │                               │──── POST /settle ───────►│
  │                               │     [facilitator calls   │
  │                               │      transferWithAuth    │
  │                               │      on USDC contract]   │
  │                               │◄─── {txHash: "0x..."} ───│
  │                               │                          │
  │◄─── 200 OK ───────────────────│                          │
  │     PAYMENT-RESPONSE: ...     │                          │
  │     (body: the resource)      │                          │
```

---

## Header Reference

### V2 vs V1 Header Names

| Purpose | V1 (deprecated) | V2 (current) |
|---|---|---|
| Server → Client: payment terms | `X-PAYMENT-REQUIRED` | `PAYMENT-REQUIRED` |
| Client → Server: signed payment | `X-PAYMENT` | `PAYMENT-SIGNATURE` |
| Server → Client: settlement result | `X-PAYMENT-RESPONSE` | `PAYMENT-RESPONSE` |

V2 dropped the `X-` prefix to align with IETF modern conventions. V2 also moved all payment data exclusively to headers — the response body carries only the actual resource.

All header values are **base64-encoded JSON**.

---

## PAYMENT-REQUIRED Header

The server encodes payment requirements as base64 JSON:

```json
{
  "x402Version": 2,
  "error": null,
  "resource": {
    "url": "https://api.example.com/weather",
    "description": "Real-time weather data for a single location",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "maxAmountRequired": "1000",
      "payTo": "0xRecipientWalletAddress",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "maxTimeoutSeconds": 300,
      "description": "USDC on Base Mainnet"
    }
  ],
  "extensions": {}
}
```

### Field Definitions

| Field | Type | Description |
|---|---|---|
| `x402Version` | number | Protocol version (currently 2) |
| `error` | string \| null | Error message if the previous payment attempt failed |
| `resource.url` | string | Full URL of the resource being sold |
| `resource.description` | string | Human-readable description |
| `resource.mimeType` | string | MIME type of the response body |
| `accepts[]` | array | One or more acceptable payment methods (client picks one) |
| `accepts[].scheme` | string | Payment scheme: `"exact"`, `"upto"`, `"deferred"` |
| `accepts[].network` | string | CAIP-2 network identifier (e.g., `eip155:8453`) |
| `accepts[].maxAmountRequired` | string | Token amount in base units (USDC: 6 decimals — `"1000"` = $0.001) |
| `accepts[].payTo` | string | Recipient wallet address |
| `accepts[].asset` | string | ERC-20 token contract address |
| `accepts[].maxTimeoutSeconds` | number | Max seconds the signed authorization is valid |
| `extensions` | object | Protocol extensions (e.g., `bazaar` discovery metadata) |

### USDC Amounts — Decimal Reference

USDC has 6 decimal places. `maxAmountRequired` is in base units (no decimal point):

| `maxAmountRequired` | USD Value |
|---|---|
| `"1"` | $0.000001 |
| `"100"` | $0.0001 |
| `"1000"` | $0.001 |
| `"10000"` | $0.01 |
| `"100000"` | $0.10 |
| `"1000000"` | $1.00 |

---

## PAYMENT-SIGNATURE Header (EVM Exact Scheme)

The client signs an EIP-3009 authorization and encodes it as base64 JSON:

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "eip155:8453",
  "payload": {
    "signature": "0xABCDEF1234567890...",
    "authorization": {
      "from": "0xPayerWalletAddress",
      "to": "0xRecipientWalletAddress",
      "value": "1000",
      "validAfter": "1740672089",
      "validBefore": "1740672389",
      "nonce": "0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b"
    }
  }
}
```

### Authorization Fields

| Field | Type | Description |
|---|---|---|
| `from` | address | Payer's wallet address (token source) |
| `to` | address | Recipient wallet address (must match `payTo` in requirements) |
| `value` | string | Token amount in base units (must match `maxAmountRequired`) |
| `validAfter` | string | Unix timestamp — authorization not valid before this time |
| `validBefore` | string | Unix timestamp — authorization expires at this time |
| `nonce` | string | Random 32-byte hex — prevents replay attacks |
| `signature` | string | EIP-712 typed data signature |

### Why Random Nonces?

EIP-3009 uses random 32-byte nonces (not sequential). This allows a wallet to sign multiple authorizations in parallel without nonce conflicts. A sequential nonce system would force serialization — each payment would have to wait for the previous one to settle before signing the next.

---

## EIP-712 Signing

The `authorization` object is signed using **EIP-712 typed data signing**, which produces a human-readable signature request in wallets.

### Domain Separator (Base Mainnet USDC)

```json
{
  "name": "USD Coin",
  "version": "2",
  "chainId": 8453,
  "verifyingContract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
}
```

### Type Structure

```solidity
// EIP-712 type definition
struct TransferWithAuthorization {
    address from;
    address to;
    uint256 value;
    uint256 validAfter;
    uint256 validBefore;
    bytes32 nonce;
}
```

### Signing in TypeScript (viem)

```typescript
import { signTypedData } from "viem/actions";

const signature = await signTypedData(walletClient, {
  domain: {
    name: "USD Coin",
    version: "2",
    chainId: 8453,
    verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: {
    from: payerAddress,
    to: recipientAddress,
    value: BigInt(1000),
    validAfter: BigInt(Math.floor(Date.now() / 1000)),
    validBefore: BigInt(Math.floor(Date.now() / 1000) + 300),
    nonce: crypto.getRandomValues(new Uint8Array(32)),
  },
});
```

---

## PAYMENT-RESPONSE Header

On successful settlement, the server sets this header alongside the `200 OK`:

```json
{
  "success": true,
  "txHash": "0xabc123...",
  "network": "eip155:8453",
  "payer": "0xPayerWalletAddress",
  "errorReason": null
}
```

If settlement failed, the server returns `402` again with `error` populated in the `PAYMENT-REQUIRED` header.

---

## On-Chain Settlement: transferWithAuthorization

The facilitator calls this function on the USDC contract:

```solidity
function transferWithAuthorization(
    address from,
    address to,
    uint256 value,
    uint256 validAfter,
    uint256 validBefore,
    bytes32 nonce,
    uint8 v,
    bytes32 r,
    bytes32 s
) external;
```

This is defined by **EIP-3009**. The facilitator splits the EIP-712 signature into `v`, `r`, `s` components and submits the transaction. The USDC contract:
1. Verifies the EIP-712 signature matches the authorization parameters
2. Checks `validAfter ≤ block.timestamp ≤ validBefore`
3. Verifies the nonce hasn't been used before (marks it used on success)
4. Transfers tokens from `from` to `to`

The facilitator pays gas. The payer only needs USDC balance, not ETH/native tokens.

---

## Payment Schemes

A **scheme** defines the authorization and settlement mechanism. Multiple schemes can be listed in `accepts[]`; the client picks the one it supports.

### `exact` (Current Production Scheme)

Transfer a specific predetermined amount. The client signs for exactly `maxAmountRequired` tokens. This is the only fully-deployed scheme.

### `upto` (Planned)

Transfer up to a maximum amount based on actual consumption. Useful for variable-cost resources (streaming data, compute jobs). The server reports actual usage; client authorizes up to the cap.

### `deferred` (Experimental — Cloudflare-Proposed)

Batch settlements and subscription-style payments. Instead of per-request settlement, periodic batch reconciliation. Reduces on-chain overhead for high-frequency, low-value calls.

---

## Solana Scheme Differences

The Solana implementation uses partially-signed transactions instead of EIP-3009:

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "payload": {
    "transaction": "<base64-encoded-partially-signed-tx>",
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount": "1000",
    "feePayer": "<facilitator-pubkey>"
  }
}
```

Key differences vs EVM:
- Partially-signed transactions (not EIP-712 signatures)
- Facilitator is the fee payer (`feePayer` field)
- Settlement constraints: max 40,000 compute units, max 5 microlamports/CU priority fee
- Required instruction order: `SetComputeUnitLimit → SetComputeUnitPrice → TransferChecked`
- Supports all SPL tokens and Token-2022 program tokens

---

## Facilitator API

Any server can implement a facilitator by exposing these endpoints:

### `POST /verify`

Validates a payment payload before the server delivers the resource.

**Request:**
```json
{
  "x402Version": 2,
  "paymentPayload": { /* PAYMENT-SIGNATURE header contents */ },
  "paymentRequirements": { /* one entry from accepts[] */ }
}
```

**Response:**
```json
{
  "isValid": true,
  "payer": "0xPayerAddress",
  "invalidReason": null
}
```

Validation checks:
- EIP-712 signature is valid
- Payer has sufficient USDC balance
- `to` matches `payTo` in requirements
- `value` matches `maxAmountRequired`
- `validBefore` > current timestamp
- Nonce not already used

### `POST /settle`

Executes on-chain transfer after the server has verified intent to deliver.

**Request:** Same structure as `/verify`

**Response:**
```json
{
  "success": true,
  "txHash": "0xabc123...",
  "network": "eip155:8453",
  "payer": "0xPayerAddress",
  "errorReason": null
}
```

### `GET /supported`

Returns the schemes and networks this facilitator supports.

**Response:**
```json
{
  "schemes": [
    {
      "scheme": "exact",
      "network": "eip155:8453"
    },
    {
      "scheme": "exact",
      "network": "eip155:84532"
    }
  ]
}
```

---

## CAIP-2 Network Identifiers

x402 uses CAIP-2 (Chain Agnostic Improvement Proposal 2) for network identification:

| Network | CAIP-2 ID |
|---|---|
| Base Mainnet | `eip155:8453` |
| Base Sepolia (testnet) | `eip155:84532` |
| Ethereum Mainnet | `eip155:1` |
| Polygon | `eip155:137` |
| Arbitrum One | `eip155:42161` |
| Optimism | `eip155:10` |
| Avalanche C-Chain | `eip155:43114` |
| Solana Mainnet | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Solana Devnet | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |

---

## Protocol Extensions

V2 introduced a formal extensions system for experimentation without forking the core spec.

### `bazaar` Extension

Discovery metadata allowing resources to be indexed in marketplaces:

```json
{
  "extensions": {
    "bazaar": {
      "category": "data",
      "tags": ["weather", "realtime"],
      "rating": 4.8,
      "totalCalls": 142000
    }
  }
}
```

### `SIWx` Extension (Coming)

Sign-In-With-X based on CAIP-122. Links a payment to an authenticated identity, enabling sessions with pre-authorization spending limits. Allows "pay once, use many times" within a session.

---

*See also: [`03-implementation.md`](./03-implementation.md) for code, [`04-facilitators.md`](./04-facilitators.md) for facilitator details.*
