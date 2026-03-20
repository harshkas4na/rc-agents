# x402 Protocol — Developer Implementation Guide

## Prerequisites

You need:
- A wallet address to receive payments (seller) or send payments (buyer)
- USDC balance on Base Sepolia for testnet, Base Mainnet for production
- Node.js 18+ / Python 3.10+ / Go 1.21+

For production (mainnet):
- A Coinbase Developer Platform (CDP) account for the production facilitator
- CDP API key + secret

---

## Quick Decision Tree

```
Are you building the API server (charging for resources)?
  → Server-side implementation → Section 2

Are you building the client (paying for resources)?
  → Client-side implementation → Section 3

Are you using AI agents?
  → Agent integration → Section 4

Do you need mainnet vs testnet config?
  → See Section 5
```

---

## 1. Testnet vs Mainnet Configuration

### Testnet (Development)

| Config | Value |
|---|---|
| Facilitator URL | `https://x402.org/facilitator` |
| Network (EVM) | `eip155:84532` (Base Sepolia) |
| Network (Solana) | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| API keys | Not required |
| USDC faucet | Coinbase Base Sepolia faucet |

### Mainnet (Production)

| Config | Value |
|---|---|
| Facilitator URL | `https://api.cdp.coinbase.com/platform/v2/x402` |
| Network (EVM) | `eip155:8453` (Base Mainnet) |
| Network (Solana) | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| API keys | Required (CDP account) |
| Free tier | 1,000 transactions/month free |
| Paid tier | $0.001/transaction after free tier |

### Environment Variables

```bash
# Both environments
WALLET_ADDRESS=0xYourReceivingWalletAddress

# Mainnet only
CDP_API_KEY_ID=your_cdp_key_id
CDP_API_KEY_SECRET=your_cdp_key_secret

# Client/agent
PRIVATE_KEY=0xYourPrivateKey  # Never commit this
```

---

## 2. Server-Side (Charging for Resources)

### TypeScript + Express

```bash
npm install @x402/express @x402/core @x402/evm
```

```typescript
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core";
import { ExactEvmScheme } from "@x402/evm";

const app = express();

// Initialize facilitator client
const facilitator = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL ?? "https://x402.org/facilitator",
  // For production:
  // apiKeyId: process.env.CDP_API_KEY_ID,
  // apiKeySecret: process.env.CDP_API_KEY_SECRET,
});

// Initialize resource server and register EVM scheme
const server = new x402ResourceServer(facilitator);
server.register("eip155:84532", new ExactEvmScheme());
// For mainnet: server.register("eip155:8453", new ExactEvmScheme());

// Add payment middleware with route pricing
app.use(
  paymentMiddleware(server, {
    "GET /weather": {
      scheme: "exact",
      price: "$0.001",               // Human-readable; SDK converts to base units
      network: "eip155:84532",
      payTo: process.env.WALLET_ADDRESS!,
      description: "Real-time weather data",
      mimeType: "application/json",
    },
    "GET /premium-data": {
      scheme: "exact",
      price: "$0.01",
      network: "eip155:84532",
      payTo: process.env.WALLET_ADDRESS!,
    },
    "POST /generate": {
      scheme: "exact",
      price: "$0.05",
      network: "eip155:84532",
      payTo: process.env.WALLET_ADDRESS!,
      description: "AI text generation",
    },
  })
);

// Your actual route handlers — only reached after payment is confirmed
app.get("/weather", (req, res) => {
  res.json({ temp: 72, condition: "sunny", humidity: 45 });
});

app.get("/premium-data", (req, res) => {
  res.json({ data: "sensitive premium content" });
});

app.post("/generate", express.json(), (req, res) => {
  res.json({ result: "Generated content based on: " + req.body.prompt });
});

app.listen(3000, () => console.log("x402 server running on :3000"));
```

### TypeScript + Next.js

```bash
npm install @x402/next @x402/core @x402/evm
```

```typescript
// middleware.ts (project root)
import { withX402Middleware } from "@x402/next";

export default withX402Middleware({
  facilitatorUrl: "https://x402.org/facilitator",
  routes: {
    "/api/premium": {
      price: "$0.01",
      network: "eip155:84532",
      payTo: process.env.WALLET_ADDRESS!,
    },
    "/api/data/:id": {          // Dynamic routes supported
      price: "$0.001",
      network: "eip155:84532",
      payTo: process.env.WALLET_ADDRESS!,
    },
  },
});

export const config = {
  matcher: ["/api/premium", "/api/data/:path*"],
};
```

```typescript
// app/api/premium/route.ts — reached only after payment
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  return NextResponse.json({ premium: "content" });
}
```

### TypeScript + Hono

```bash
npm install @x402/hono @x402/core @x402/evm
```

```typescript
import { Hono } from "hono";
import { x402Middleware } from "@x402/hono";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core";
import { ExactEvmScheme } from "@x402/evm";

const app = new Hono();

const facilitator = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
const server = new x402ResourceServer(facilitator);
server.register("eip155:84532", new ExactEvmScheme());

app.use(
  "/paid/*",
  x402Middleware(server, {
    "GET /paid/data": {
      scheme: "exact",
      price: "$0.001",
      network: "eip155:84532",
      payTo: process.env.WALLET_ADDRESS!,
    },
  })
);

app.get("/paid/data", (c) => c.json({ data: "here" }));
```

### Python + FastAPI

```bash
pip install "x402[evm,fastapi]"
```

```python
import os
from fastapi import FastAPI
from x402 import x402ResourceServer, HTTPFacilitatorClient, FacilitatorConfig
from x402.evm import ExactEvmServerScheme
from x402.fastapi import x402_middleware

facilitator = HTTPFacilitatorClient(
    FacilitatorConfig(url="https://x402.org/facilitator")
)
server = x402ResourceServer(facilitator)
server.register("eip155:84532", ExactEvmServerScheme())

app = FastAPI()
app.add_middleware(
    x402_middleware,
    server=server,
    routes={
        "GET /data": {
            "scheme": "exact",
            "price": "$0.001",
            "network": "eip155:84532",
            "payTo": os.environ["WALLET_ADDRESS"],
            "description": "Premium data endpoint",
        },
        "POST /analyze": {
            "scheme": "exact",
            "price": "$0.05",
            "network": "eip155:84532",
            "payTo": os.environ["WALLET_ADDRESS"],
        },
    },
)

@app.get("/data")
async def get_data():
    return {"result": "premium data"}

@app.post("/analyze")
async def analyze(body: dict):
    return {"analysis": "result", "input": body}
```

### Python + Flask

```bash
pip install "x402[evm,flask]"
```

```python
from flask import Flask, jsonify
from x402 import x402ResourceServer, HTTPFacilitatorClient, FacilitatorConfig
from x402.evm import ExactEvmServerScheme
from x402.flask import x402_before_request

facilitator = HTTPFacilitatorClient(FacilitatorConfig(url="https://x402.org/facilitator"))
server = x402ResourceServer(facilitator)
server.register("eip155:84532", ExactEvmServerScheme())

app = Flask(__name__)
app.before_request(x402_before_request(server, {
    "GET /premium": {
        "scheme": "exact",
        "price": "$0.001",
        "network": "eip155:84532",
        "payTo": "0xYourWallet",
    }
}))

@app.route("/premium")
def premium():
    return jsonify({"data": "premium"})
```

### Go + Gin

```bash
go get github.com/coinbase/x402/go
go get github.com/coinbase/x402/go/http/gin
```

```go
package main

import (
    "net/http"
    "os"

    "github.com/coinbase/x402/go"
    "github.com/coinbase/x402/go/http/gin"
    evmexact "github.com/coinbase/x402/go/schemes/evm/exact"
    "github.com/gin-gonic/gin"
)

func main() {
    facilitator := x402.NewHTTPFacilitatorClient("https://x402.org/facilitator")
    server := x402.NewResourceServer(facilitator)
    server.Register("eip155:84532", evmexact.NewScheme())

    r := gin.Default()
    r.Use(x402gin.PaymentMiddleware(server, x402gin.Routes{
        "GET /premium": {
            Scheme:      "exact",
            Price:       "$0.001",
            Network:     "eip155:84532",
            PayTo:       os.Getenv("WALLET_ADDRESS"),
            Description: "Premium endpoint",
        },
    }))

    r.GET("/premium", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{"data": "premium"})
    })

    r.Run(":3000")
}
```

---

## 3. Client-Side (Paying for Resources)

### TypeScript + @x402/fetch

The simplest approach: wrap native `fetch` so 402 responses are handled automatically.

```bash
npm install @x402/fetch @x402/evm viem
```

```typescript
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

// Set up wallet
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,      // base for mainnet
  transport: http(),
});

// Wrap fetch — 402 responses are transparently handled
const payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    {
      scheme: "exact",
      network: "eip155:84532",
      client: walletClient,
    },
  ],
});

// Use exactly like normal fetch — payment is automatic
const response = await payingFetch("https://api.example.com/weather");
const data = await response.json();
console.log(data);
```

### TypeScript + @x402/axios

```bash
npm install @x402/axios @x402/evm viem axios
```

```typescript
import axios from "axios";
import { addX402Interceptor } from "@x402/axios";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http() });

const client = axios.create();
addX402Interceptor(client, {
  schemes: [{ scheme: "exact", network: "eip155:84532", client: walletClient }],
});

// Use axios normally — interceptor handles 402 responses
const { data } = await client.get("https://api.example.com/premium-data");
```

### Python Client (sync)

```bash
pip install "x402[evm,requests]"
```

```python
import os
from x402 import x402ClientSync
from x402.evm import ExactEvmClientScheme

client = x402ClientSync()
client.register(
    "eip155:84532",
    ExactEvmClientScheme(private_key=os.environ["PRIVATE_KEY"])
)

# Automatically handles 402 → sign → retry
response = client.get("https://api.example.com/weather")
print(response.json())

# POST also works
response = client.post(
    "https://api.example.com/generate",
    json={"prompt": "Tell me about x402"}
)
```

### Python Client (async)

```bash
pip install "x402[evm,httpx]"
```

```python
import os
import asyncio
from x402 import x402Client
from x402.evm import ExactEvmClientScheme

async def main():
    client = x402Client()
    client.register(
        "eip155:84532",
        ExactEvmClientScheme(private_key=os.environ["PRIVATE_KEY"])
    )
    response = await client.get("https://api.example.com/premium")
    print(await response.json())

asyncio.run(main())
```

### Manual Client (Understanding the Flow)

If you need full control or are implementing a client in an unsupported language:

```typescript
import { parsePaymentRequired, buildPaymentSignature } from "@x402/core";

async function fetchWithPayment(url: string, walletClient: WalletClient) {
  // Step 1: Initial request
  let response = await fetch(url);

  if (response.status !== 402) {
    return response;
  }

  // Step 2: Parse payment requirements
  const paymentRequiredHeader = response.headers.get("PAYMENT-REQUIRED")!;
  const requirements = parsePaymentRequired(
    Buffer.from(paymentRequiredHeader, "base64").toString("utf8")
  );

  // Step 3: Pick a payment option (first one that matches our wallet)
  const paymentOption = requirements.accepts[0];

  // Step 4: Build and sign the payment payload
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.getRandomValues(new Uint8Array(32));

  const authorization = {
    from: walletClient.account.address,
    to: paymentOption.payTo,
    value: paymentOption.maxAmountRequired,
    validAfter: String(now),
    validBefore: String(now + paymentOption.maxTimeoutSeconds),
    nonce: `0x${Buffer.from(nonce).toString("hex")}`,
  };

  const signature = await walletClient.signTypedData({
    domain: getUsdcDomain(paymentOption.network),
    types: { TransferWithAuthorization: TRANSFER_WITH_AUTH_TYPES },
    primaryType: "TransferWithAuthorization",
    message: authorization,
  });

  const paymentPayload = buildPaymentSignature({
    x402Version: 2,
    scheme: paymentOption.scheme,
    network: paymentOption.network,
    payload: { signature, authorization },
  });

  // Step 5: Retry with payment header
  response = await fetch(url, {
    headers: {
      "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(paymentPayload)).toString("base64"),
    },
  });

  return response;
}
```

---

## 4. AI Agent Integration

### With Coinbase AgentKit (LangChain)

```bash
npm install @coinbase/agentkit @coinbase/agentkit-langchain @x402/fetch
```

```typescript
import { CdpAgentkit } from "@coinbase/agentkit";
import { CdpToolkit } from "@coinbase/agentkit-langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";

// Initialize AgentKit with CDP wallet
const agentkit = await CdpAgentkit.configureWithWallet({
  cdpApiKeyName: process.env.CDP_API_KEY_ID!,
  cdpApiKeyPrivateKey: process.env.CDP_API_KEY_SECRET!,
  networkId: "base-sepolia",
});

// Create x402-aware fetch using the agent's wallet
const walletData = await agentkit.exportWallet();
const payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ scheme: "exact", network: "eip155:84532", client: walletData.walletClient }],
});

// The agent can now call paid APIs autonomously
const tools = CdpToolkit.fromCdpAgentkit(agentkit).getTools();
const llm = new ChatAnthropic({ model: "claude-sonnet-4-6" });

const agent = createReactAgent({ llm, tools });
const executor = AgentExecutor.fromAgentAndTools({ agent, tools });

// Agent will autonomously pay for APIs it needs
const result = await executor.call({
  input: "Fetch the current ETH price from the premium data API and summarize it",
});
```

### Python Agent (Raw)

```python
import os
from x402 import x402ClientSync
from x402.evm import ExactEvmClientScheme

# The agent's wallet private key — store in TEE/HSM in production
client = x402ClientSync()
client.register(
    "eip155:84532",
    ExactEvmClientScheme(private_key=os.environ["AGENT_PRIVATE_KEY"])
)

def agent_fetch_data(url: str) -> dict:
    """Agent tool: fetch data from an x402-gated API"""
    try:
        response = client.get(url)
        if response.status_code == 200:
            return response.json()
        return {"error": f"HTTP {response.status_code}"}
    except Exception as e:
        return {"error": str(e)}

# Usage in agent loop
result = agent_fetch_data("https://api.firecrawl.dev/v1/x402/search?q=ethereum")
```

### Spending Policy (Best Practice)

For production agents, wrap the x402 client with spending controls:

```typescript
class BudgetedX402Client {
  private dailySpent = 0;
  private readonly dailyLimit: number; // in USDC base units

  constructor(
    private readonly inner: ReturnType<typeof wrapFetchWithPaymentFromConfig>,
    dailyLimitUSD: number
  ) {
    this.dailyLimit = dailyLimitUSD * 1_000_000; // convert to base units
    // Reset daily counter at midnight
    setInterval(() => { this.dailySpent = 0; }, 24 * 60 * 60 * 1000);
  }

  async fetch(url: string, options?: RequestInit): Promise<Response> {
    // Pre-check: inspect payment requirements before paying
    const probe = await fetch(url, options);
    if (probe.status === 402) {
      const header = probe.headers.get("PAYMENT-REQUIRED")!;
      const req = JSON.parse(Buffer.from(header, "base64").toString());
      const amount = Number(req.accepts[0].maxAmountRequired);

      if (this.dailySpent + amount > this.dailyLimit) {
        throw new Error(`Daily spending limit would be exceeded: ${amount} + ${this.dailySpent} > ${this.dailyLimit}`);
      }
      this.dailySpent += amount;
    }
    return this.inner(url, options);
  }
}
```

---

## 5. Running a Test Server Locally

```bash
# Clone the examples
git clone https://github.com/coinbase/x402
cd x402/examples/typescript/server

# Install deps and set env
npm install
cp .env.example .env
# Edit .env: set WALLET_ADDRESS to your receiving address

# Run testnet server
npm run dev
# Server on http://localhost:3000

# Test the paywall
curl -v http://localhost:3000/weather
# Expect: HTTP/1.1 402 Payment Required

# Test with a paying client (separate terminal)
cd ../client
npm install
cp .env.example .env
# Edit .env: set PRIVATE_KEY to a funded Base Sepolia wallet
npm run start
```

---

## 6. USDC Contract Addresses

| Network | USDC Address |
|---|---|
| Base Mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Ethereum Mainnet | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Polygon | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |
| Arbitrum One | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Optimism | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` |
| Solana Mainnet | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (SPL mint) |
| Solana Devnet | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (SPL mint) |

---

## 7. Common Patterns

### Per-Endpoint Pricing

Charge different amounts for different routes based on compute or data cost:

```typescript
app.use(paymentMiddleware(server, {
  "GET /basic":   { price: "$0.0001", ... },  // lightweight
  "GET /data":    { price: "$0.001",  ... },  // standard
  "GET /premium": { price: "$0.01",   ... },  // premium
  "POST /ai":     { price: "$0.05",   ... },  // expensive compute
}));
```

### Dynamic Pricing

For routes where price depends on request parameters, compute it before the middleware:

```typescript
app.use("/api/compute", (req, res, next) => {
  const complexity = parseInt(req.query.n as string) || 1;
  req.x402Price = `$${(complexity * 0.001).toFixed(4)}`;
  next();
}, paymentMiddleware(server, {
  "POST /api/compute": (req) => ({
    price: req.x402Price,
    network: "eip155:84532",
    payTo: process.env.WALLET_ADDRESS!,
  }),
}));
```

### Allowing Free Requests (Partial Paywall)

Only gate specific routes; others remain free:

```typescript
// Only /premium routes require payment; /public is free
app.use(paymentMiddleware(server, {
  "GET /premium/*": { price: "$0.01", ... },
}));

app.get("/public/health", (req, res) => res.json({ ok: true }));
app.get("/premium/data", (req, res) => res.json({ secret: "stuff" }));
```

---

*See also: [`04-facilitators.md`](./04-facilitators.md) for running your own facilitator, [`05-use-cases.md`](./05-use-cases.md) for inspiration.*
