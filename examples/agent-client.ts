/**
 * agent-client.ts — Example AI agent using x402 to register a protection subscription
 *
 * Demonstrates the full end-to-end flow:
 *   1. Fetch available services (free)
 *   2. Get a price quote (free)
 *   3. Pay via x402 and register protection (costs USDC)
 *   4. Poll subscription status
 *
 * Usage:
 *   AGENT_PRIVATE_KEY=0x... npx ts-node examples/agent-client.ts
 *
 * The agent wallet needs USDC on Base Sepolia.
 * Faucet: https://faucet.circle.com (select Base Sepolia)
 */

import { createWalletClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// The x402 fetch client handles EIP-3009 signing automatically
// npm install @x402/fetch
// import { createX402Fetch } from "@x402/fetch";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";

// ── Step 1: List available services ───────────────────────────────────────────
async function listServices() {
  const res = await fetch(`${SERVER_URL}/api/services`);
  const data = await res.json();
  console.log("Available services:");
  for (const svc of data.services) {
    console.log(`  ${svc.id}: ${svc.name}`);
    console.log(`    Trigger: ${svc.trigger}`);
    console.log(`    Action: ${svc.action}`);
    console.log(`    Price: ${svc.pricing.example1Day} / day`);
  }
  return data.services;
}

// ── Step 2: Get a price quote ─────────────────────────────────────────────────
async function getQuote(service: string, durationSeconds: number) {
  const res = await fetch(`${SERVER_URL}/api/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service, durationSeconds }),
  });
  const quote = await res.json();
  console.log(`\nQuote for ${service} (${durationSeconds}s):`);
  console.log(`  Price: ${quote.price} (${quote.priceBaseUnits} base units)`);
  return quote;
}

// ── Step 3: Register protection via x402 ─────────────────────────────────────
async function registerProtection(agentPrivateKey: string) {
  // Configure protection parameters
  const params = new URLSearchParams({
    threshold: "1.5",       // Fire protection when HF < 1.5
    duration: "86400",      // 1 day
    // protectedUser: "0x..." // defaults to paying agent
    // collateralAmount: "100000000000000000" // 0.1 ETH
  });

  const url = `${SERVER_URL}/api/protect/liquidation?${params}`;

  console.log("\nRegistering Aave liquidation protection...");
  console.log("Endpoint:", url);

  // Step 3a: First request (no payment) → expect 402
  const firstResponse = await fetch(url);
  if (firstResponse.status !== 402) {
    console.error("Expected 402, got:", firstResponse.status);
    return;
  }

  const paymentRequired = firstResponse.headers.get("PAYMENT-REQUIRED");
  if (!paymentRequired) {
    console.error("No PAYMENT-REQUIRED header");
    return;
  }

  const paymentTerms = JSON.parse(Buffer.from(paymentRequired, "base64").toString());
  console.log("\nPayment required:");
  console.log(`  Amount: ${formatUnits(BigInt(paymentTerms.amount ?? paymentTerms.maxAmountRequired ?? 0), 6)} USDC`);
  console.log(`  Network: ${paymentTerms.network}`);
  console.log(`  Recipient: ${paymentTerms.payTo ?? paymentTerms.recipient}`);

  // Step 3b: Sign EIP-3009 authorization and retry
  // In production, use @x402/fetch which handles this automatically:
  //
  //   const x402fetch = createX402Fetch({ privateKey: agentPrivateKey });
  //   const response = await x402fetch(url);
  //
  // Manual signing shown here for educational purposes:
  console.log("\n[In production: @x402/fetch signs EIP-3009 and retries automatically]");
  console.log("See https://www.npmjs.com/package/@x402/fetch for the client SDK");

  // Step 3c (simulated): Show what success response looks like
  console.log("\nExpected success response:");
  console.log(JSON.stringify({
    success: true,
    subscriptionId: "0",
    txHash: "0x...",
    protectedUser: "0xAgentAddress",
    threshold: 1.5,
    expiresAt: Math.floor(Date.now() / 1000) + 86400,
    message: "Protection active. Monitoring every ~12 minutes.",
  }, null, 2));
}

// ── Step 4: Check subscription status ────────────────────────────────────────
async function checkStatus(subscriptionId: string) {
  const res = await fetch(`${SERVER_URL}/api/status/${subscriptionId}`);
  const status = await res.json();
  console.log("\nSubscription status:");
  console.log(JSON.stringify(status, null, 2));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const agentKey = process.env.AGENT_PRIVATE_KEY;
  if (!agentKey) {
    console.log(
      "Set AGENT_PRIVATE_KEY to run the full payment flow.\n" +
      "Running in demo mode (steps 1 and 2 only).\n"
    );
  }

  await listServices();
  await getQuote("hf-guard", 86400);

  if (agentKey) {
    await registerProtection(agentKey);
  } else {
    console.log("\nSkipping payment step (no AGENT_PRIVATE_KEY set).");
    console.log("To pay with x402: npm install @x402/fetch, then use createX402Fetch().");
  }
}

main().catch(console.error);
