/**
 * test-agent.ts — End-to-end x402 payment test for BOTH services
 *
 * Usage:
 *   AGENT_PRIVATE_KEY=0x... npx tsx test-agent.ts
 *   AGENT_PRIVATE_KEY=0x... npx tsx test-agent.ts --dca    (DCA only)
 *   AGENT_PRIVATE_KEY=0x... npx tsx test-agent.ts --aave   (Aave only)
 *   AGENT_PRIVATE_KEY=0x... npx tsx test-agent.ts --both   (both services)
 *
 * The agent wallet must have USDC on Base Sepolia (get from faucet.circle.com).
 */

import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const SERVER = process.env.SERVER_URL ?? "http://localhost:3000";

const AGENT_PK = process.env.AGENT_PRIVATE_KEY;
if (!AGENT_PK) {
  console.error("Set AGENT_PRIVATE_KEY=0x... before running");
  process.exit(1);
}

const account = privateKeyToAccount(AGENT_PK as `0x${string}`);
const client = new x402Client();
registerExactEvmScheme(client, { signer: account });
const x402Fetch = wrapFetchWithPayment(fetch, client);

const mode = process.argv[2] ?? "--both";
const runAave = mode === "--aave" || mode === "--both";
const runDCA = mode === "--dca" || mode === "--both";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function jsonGet(path: string) {
  return (await fetch(`${SERVER}${path}`)).json();
}

async function jsonPost(path: string, body: Record<string, unknown>) {
  return (
    await fetch(`${SERVER}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  ).json();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== rc-agents — End-to-End Test ===\n");
  console.log("Agent address:", account.address);
  console.log("Server:       ", SERVER);
  console.log("Mode:         ", mode);

  // ── 1. Health check ────────────────────────────────────────────────────────
  console.log("\n── 1. Server health ────────────────────────────────────────");
  const health = await jsonGet("/health");
  console.log("   Status:", health.status);
  console.log("   Aave RC:", JSON.stringify(health.aaveProtection));
  console.log("   DCA RC: ", JSON.stringify(health.dcaStrategy));

  if (health.status !== "ok") {
    console.warn("   Server is degraded — some RCs may be underfunded. Continuing anyway...");
  }

  // ── 2. Service catalog ─────────────────────────────────────────────────────
  console.log("\n── 2. Service catalog ──────────────────────────────────────");
  const { services } = await jsonGet("/api/services");
  for (const svc of services) {
    console.log(`   ${svc.id}: ${svc.pricing.example1Day}/day (${svc.status})`);
  }

  // ── 3. Aave Protection ─────────────────────────────────────────────────────
  if (runAave) {
    console.log("\n══════════════════════════════════════════════════════════════");
    console.log("   AAVE LIQUIDATION PROTECTION");
    console.log("══════════════════════════════════════════════════════════════");

    // Quote
    console.log("\n── 3a. Quote (Aave, 1 day) ────────────────────────────────");
    const aaveQuote = await jsonPost("/api/quote", {
      service: "aave-protection",
      durationSeconds: 86400,
    });
    console.log(`   Price: ${aaveQuote.price} (${aaveQuote.priceBaseUnits} base units)`);

    // Pay + register
    console.log("\n── 3b. Pay + create protection config ─────────────────────");
    const PROTECTED_USER = process.env.PROTECTED_USER ?? account.address;
    console.log("   Protected user:", PROTECTED_USER);

    const aaveRes = await x402Fetch(`${SERVER}/api/protect/liquidation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protectedUser: PROTECTED_USER,
        protectionType: 0,
        healthFactorThreshold: "1500000000000000000",
        targetHealthFactor: "2000000000000000000",
        collateralAsset: "0x4200000000000000000000000000000000000006",
        debtAsset: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
        preferDebtRepayment: false,
        duration: 86400,
      }),
    });

    if (!aaveRes.ok) {
      const err = await aaveRes.json();
      console.error("   FAILED:", JSON.stringify(err, null, 2));
    } else {
      const aaveResult = await aaveRes.json();
      console.log("   Config ID:", aaveResult.configId);
      console.log("   Tx hash:  ", aaveResult.txHash);
      console.log("   Message:  ", aaveResult.message);

      // Verify on-chain
      console.log("\n── 3c. Verify config on-chain ──────────────────────────────");
      await new Promise((r) => setTimeout(r, 2000));
      const config = await jsonGet(`/api/status/config/${aaveResult.configId}`);
      console.log("   Status:     ", config.status);
      console.log("   Type:       ", config.protectionType);
      console.log("   Threshold:  ", config.healthFactorThreshold);

      // Health factor
      console.log("\n── 3d. Health factor ───────────────────────────────────────");
      const hf = await jsonGet(`/api/status/health/${PROTECTED_USER}`);
      if (hf.noAavePosition) {
        console.log("   No Aave position — protection won't fire until borrows exist");
      } else {
        console.log("   HF:", hf.healthFactorDecimal, "| At risk:", hf.atRisk);
      }

      // Active configs
      console.log("\n── 3e. Active Aave configs ─────────────────────────────────");
      const aaveConfigs = await jsonGet("/api/status/configs");
      console.log("   IDs:", aaveConfigs.activeConfigIds, "| Count:", aaveConfigs.count);
    }
  }

  // ── 4. DCA Strategy ────────────────────────────────────────────────────────
  if (runDCA) {
    console.log("\n══════════════════════════════════════════════════════════════");
    console.log("   DCA STRATEGY (UNISWAP V3)");
    console.log("══════════════════════════════════════════════════════════════");

    // Quote
    console.log("\n── 4a. Quote (DCA, 1 day) ─────────────────────────────────");
    const dcaQuote = await jsonPost("/api/quote", {
      service: "dca-strategy",
      durationSeconds: 86400,
    });
    console.log(`   Price: ${dcaQuote.price} (${dcaQuote.priceBaseUnits} base units)`);

    // Pay + create DCA config
    console.log("\n── 4b. Pay + create DCA config ────────────────────────────");
    console.log("   User:     ", account.address);
    console.log("   Strategy:  USDC -> WETH, $10/swap, 3 swaps, every 12 min");

    const dcaRes = await x402Fetch(`${SERVER}/api/dca/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: account.address,
        tokenIn: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",   // USDC
        tokenOut: "0x4200000000000000000000000000000000000006",     // WETH
        amountPerSwap: "10000000",                                  // 10 USDC
        poolFee: 3000,                                              // 0.3%
        totalSwaps: 3,                                              // 3 swaps total
        swapInterval: 720,                                          // 12 min
        minAmountOut: "0",                                          // no slippage limit
        duration: 86400,                                            // 1 day
      }),
    });

    if (!dcaRes.ok) {
      const err = await dcaRes.json();
      console.error("   FAILED:", JSON.stringify(err, null, 2));
    } else {
      const dcaResult = await dcaRes.json();
      console.log("   Config ID:", dcaResult.configId);
      console.log("   Tx hash:  ", dcaResult.txHash);
      console.log("   Message:  ", dcaResult.message);

      // Verify on-chain
      console.log("\n── 4c. Verify DCA config on-chain ─────────────────────────");
      await new Promise((r) => setTimeout(r, 2000));
      const dcaConfig = await jsonGet(`/api/dca/config/${dcaResult.configId}`);
      console.log("   Status:        ", dcaConfig.status);
      console.log("   Token pair:    ", dcaConfig.tokenIn, "->", dcaConfig.tokenOut);
      console.log("   Per swap:      ", dcaConfig.amountPerSwap);
      console.log("   Swaps done:    ", dcaConfig.swapsExecuted, "/", dcaConfig.totalSwaps);
      console.log("   Total received:", dcaConfig.totalAmountOut);

      // User's DCA configs
      console.log("\n── 4d. User's DCA configs ─────────────────────────────────");
      const userConfigs = await jsonGet(`/api/dca/user/${account.address}`);
      console.log("   IDs:", userConfigs.configIds, "| Count:", userConfigs.count);

      // Active DCA configs
      console.log("\n── 4e. Active DCA configs ─────────────────────────────────");
      const dcaConfigs = await jsonGet("/api/dca/configs");
      console.log("   IDs:", dcaConfigs.activeConfigIds, "| Count:", dcaConfigs.count);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("   TEST COMPLETE");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`
Next steps:
  - Wait ~12 min for first CRON tick from the Reactive Network
  - Approve the callback contract(s) to spend your tokens
  - Monitor via GET /api/status/config/:id or GET /api/dca/config/:id
  - Manage via POST /api/protect/liquidation/pause or POST /api/dca/pause
  `);
}

main().catch((err) => {
  console.error("\nError:", err?.message ?? err);
  process.exit(1);
});
