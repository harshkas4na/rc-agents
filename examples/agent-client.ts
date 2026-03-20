/**
 * agent-client.ts — AI agent that pays for Aave liquidation protection via x402
 *
 * This demonstrates the complete agent workflow:
 *   1. Discover available services
 *   2. Get a price quote
 *   3. Approve collateral on AaveHFCallback
 *   4. Pay via x402 and register protection
 *   5. Check subscription status
 *
 * Prerequisites:
 *   - Agent wallet with USDC on Base Sepolia (faucet: https://faucet.circle.com)
 *   - Agent wallet with WETH (or chosen collateral) on Base Sepolia
 *   - Server running at SERVER_URL
 *
 * Usage:
 *   AGENT_PRIVATE_KEY=0x... SERVER_URL=http://localhost:3000 npx ts-node examples/agent-client.ts
 *
 * For production agents, use @x402/fetch which handles EIP-3009 signing automatically:
 *   npm install @x402/fetch
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  formatUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";
const AGENT_KEY = process.env.AGENT_PRIVATE_KEY;

// ── Viem clients ──────────────────────────────────────────────────────────────

function getClients() {
  if (!AGENT_KEY) throw new Error("AGENT_PRIVATE_KEY required");
  const account = privateKeyToAccount(AGENT_KEY as `0x${string}`);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http() });
  return { account, publicClient, walletClient };
}

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

// ── Step 1: Discover services ─────────────────────────────────────────────────

async function listServices() {
  console.log("=== Step 1: Discover services ===\n");
  const res = await fetch(`${SERVER_URL}/api/services`);
  if (!res.ok) throw new Error(`Services endpoint failed: ${res.status}`);
  const data = await res.json();

  for (const svc of data.services) {
    console.log(`  ${svc.id}: ${svc.name}`);
    console.log(`    ${svc.description}`);
    console.log(`    Price: ${svc.pricing.example1Day}/day`);
    console.log();
  }
  return data.services;
}

// ── Step 2: Get price quote ───────────────────────────────────────────────────

async function getQuote(service: string, durationSeconds: number) {
  console.log("=== Step 2: Get price quote ===\n");
  const res = await fetch(`${SERVER_URL}/api/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service, durationSeconds }),
  });
  if (!res.ok) throw new Error(`Quote failed: ${res.status} ${await res.text()}`);
  const quote = await res.json();
  console.log(`  Service:  ${quote.service}`);
  console.log(`  Duration: ${quote.durationSeconds}s`);
  console.log(`  Price:    ${quote.price} (${quote.priceBaseUnits} base units)`);
  console.log();
  return quote;
}

// ── Step 3: Approve collateral ────────────────────────────────────────────────

async function approveCollateral(
  callbackAddress: Address,
  collateralAsset: Address,
  amount: bigint
) {
  console.log("=== Step 3: Approve collateral ===\n");
  const { account, publicClient, walletClient } = getClients();

  // Check current allowance
  const currentAllowance = await publicClient.readContract({
    address: collateralAsset,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, callbackAddress],
  });

  if (currentAllowance >= amount) {
    console.log(`  Already approved: ${formatUnits(currentAllowance, 18)} (sufficient)`);
    console.log();
    return;
  }

  // Check balance
  const balance = await publicClient.readContract({
    address: collateralAsset,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`  Collateral balance: ${formatUnits(balance, 18)}`);

  if (balance < amount) {
    throw new Error(
      `Insufficient collateral. Have ${formatUnits(balance, 18)}, need ${formatUnits(amount, 18)}. ` +
      `Get WETH on Base Sepolia from a faucet.`
    );
  }

  // Approve
  console.log(`  Approving ${formatUnits(amount, 18)} to ${callbackAddress}...`);
  const txHash = await walletClient.writeContract({
    address: collateralAsset,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [callbackAddress, amount],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`  Approved: ${txHash} (block ${receipt.blockNumber})`);
  console.log();
}

// ── Step 4: Pay and register ──────────────────────────────────────────────────

async function registerProtection(params: {
  threshold: string;
  duration: string;
  collateralAsset: string;
  collateralAmount: string;
}) {
  console.log("=== Step 4: Register protection via x402 ===\n");

  const qs = new URLSearchParams(params);
  const url = `${SERVER_URL}/api/protect/liquidation?${qs}`;
  console.log(`  Endpoint: ${url}`);

  // First request: expect 402
  const firstRes = await fetch(url);
  if (firstRes.status !== 402) {
    if (firstRes.ok) {
      console.log("  Payment was not required (might be free on testnet?)");
      return await firstRes.json();
    }
    throw new Error(`Expected 402, got ${firstRes.status}: ${await firstRes.text()}`);
  }

  const paymentRequired = firstRes.headers.get("payment-required");
  if (paymentRequired) {
    try {
      const terms = JSON.parse(Buffer.from(paymentRequired, "base64").toString());
      console.log(`  Payment required:`);
      console.log(`    Network: ${terms.network ?? "unknown"}`);
      console.log(`    Amount:  ${JSON.stringify(terms.paymentRequirements?.[0]?.maxAmountRequired ?? terms)}`);
    } catch {
      console.log(`  Payment required (could not decode terms)`);
    }
  }

  console.log();
  console.log("  To complete payment, use @x402/fetch:");
  console.log();
  console.log("    import { wrapFetchWithPayment } from '@x402/fetch';");
  console.log("    import { ExactEvmScheme } from '@x402/evm/exact/client';");
  console.log();
  console.log("    const x402Fetch = wrapFetchWithPayment(fetch, privateKey, {");
  console.log("      schemes: [{ network: 'eip155:84532', scheme: new ExactEvmScheme() }],");
  console.log("    });");
  console.log("    const response = await x402Fetch(url);");
  console.log();

  // Attempt with @x402/fetch if available
  try {
    const { wrapFetchWithPayment } = await import("@x402/fetch");
    const { ExactEvmScheme } = await import("@x402/evm/exact/client");

    console.log("  @x402/fetch found — attempting payment...");
    const x402Fetch = wrapFetchWithPayment(fetch, AGENT_KEY!, {
      schemes: [{ network: "eip155:84532" as any, scheme: new ExactEvmScheme() }],
    });

    const paidRes = await x402Fetch(url);
    if (!paidRes.ok) {
      throw new Error(`Payment failed: ${paidRes.status} ${await paidRes.text()}`);
    }

    const result = await paidRes.json();
    console.log(`  Registration successful!`);
    console.log(`    Subscription ID: ${result.subscriptionId}`);
    console.log(`    Tx hash: ${result.txHash}`);
    console.log(`    Expires: ${result.expiresAtISO}`);
    console.log(`    Message: ${result.message}`);
    console.log();
    return result;
  } catch (importErr: any) {
    if (importErr.code === "ERR_MODULE_NOT_FOUND" || importErr.code === "MODULE_NOT_FOUND") {
      console.log("  @x402/fetch not installed. Install it to complete payment:");
      console.log("    npm install @x402/fetch");
    } else {
      console.error("  Payment error:", importErr.message);
    }
    return null;
  }
}

// ── Step 5: Check status ──────────────────────────────────────────────────────

async function checkStatus(subscriptionId: string) {
  console.log("=== Step 5: Check subscription status ===\n");
  const res = await fetch(`${SERVER_URL}/api/status/${subscriptionId}`);
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  const status = await res.json();
  console.log(`  ID:            ${status.subscriptionId}`);
  console.log(`  Active:        ${status.active}`);
  console.log(`  Threshold:     ${status.threshold}`);
  console.log(`  Protected:     ${status.protectedUser}`);
  console.log(`  Expires:       ${status.expiresAtISO}`);
  console.log(`  Time left:     ${status.timeRemaining}s`);
  console.log();
  return status;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  x402 × Reactive Smart Contracts — Agent Demo   ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  if (!AGENT_KEY) {
    console.log("Running in READ-ONLY mode (no AGENT_PRIVATE_KEY set).\n");
    console.log("Set AGENT_PRIVATE_KEY=0x... to run the full payment flow.\n");
  }

  // 1. Discover
  await listServices();

  // 2. Quote
  await getQuote("hf-guard", 86400);

  if (!AGENT_KEY) {
    console.log("=== Skipping steps 3-5 (no private key) ===");
    return;
  }

  const { account } = getClients();
  console.log(`Agent wallet: ${account.address}\n`);

  // Configuration
  const CALLBACK_ADDRESS = process.env.AAVE_HF_CALLBACK_ADDRESS as Address;
  const COLLATERAL_ASSET = "0x4200000000000000000000000000000000000006" as Address; // WETH
  const COLLATERAL_AMOUNT = 100_000_000_000_000_000n; // 0.1 ETH

  if (!CALLBACK_ADDRESS) {
    console.error("Set AAVE_HF_CALLBACK_ADDRESS in env to run steps 3-5.");
    return;
  }

  // 3. Approve collateral
  await approveCollateral(CALLBACK_ADDRESS, COLLATERAL_ASSET, COLLATERAL_AMOUNT);

  // 4. Register protection
  const result = await registerProtection({
    threshold: "1.5",
    duration: "86400",
    collateralAsset: COLLATERAL_ASSET,
    collateralAmount: COLLATERAL_AMOUNT.toString(),
  });

  // 5. Check status
  if (result?.subscriptionId) {
    await checkStatus(result.subscriptionId);
  }
}

main().catch((err) => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
