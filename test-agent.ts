/**
 * test-agent.ts — End-to-end x402 payment test
 *
 * Usage:
 *   AGENT_PRIVATE_KEY=0x... npx tsx test-agent.ts
 *
 * The agent wallet must have USDC on Base Sepolia (get from faucet.circle.com).
 * Make sure you've already approved the CC to spend WETH + USDC (Step 7 in the guide).
 */

import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const SERVER = "http://localhost:3000";

const AGENT_PK = process.env.AGENT_PRIVATE_KEY;
if (!AGENT_PK) {
  console.error("Set AGENT_PRIVATE_KEY=0x... before running");
  process.exit(1);
}

// Build x402 client using the correct v2.7.0 API
const account = privateKeyToAccount(AGENT_PK as `0x${string}`);
const client = new x402Client();
registerExactEvmScheme(client, { signer: account });
const x402Fetch = wrapFetchWithPayment(fetch, client);

// The wallet address that will be protected
const PROTECTED_USER = process.env.PROTECTED_USER ?? account.address;

async function main() {
  console.log("=== x402 Aave Protection — End-to-End Test ===\n");
  console.log("Agent address:", account.address);

  // 1. Check server health
  console.log("\n1. Server health...");
  const health = await (await fetch(`${SERVER}/health`)).json();
  console.log("   Status:", health.status);
  console.log("   RC balance:", health.reactiveContractBalance);
  if (health.status !== "ok") {
    console.error("Server is not ready. RC may be underfunded.");
    process.exit(1);
  }

  // 2. Get quote
  console.log("\n2. Getting quote for 1-day protection...");
  const quote = await (
    await fetch(`${SERVER}/api/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "aave-protection", durationSeconds: 86400 }),
    })
  ).json();
  console.log(`   Price: ${quote.price} USDC (${quote.priceBaseUnits} base units)`);

  // 3. Pay and register — x402 handles 402 → sign EIP-3009 → retry automatically
  console.log("\n3. Submitting protection config (x402 will handle payment)...");
  console.log("   Protected user:", PROTECTED_USER);

  const res = await x402Fetch(`${SERVER}/api/protect/liquidation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      protectedUser: PROTECTED_USER,
      protectionType: 0,                              // COLLATERAL_DEPOSIT
      healthFactorThreshold: "1500000000000000000",   // 1.5 HF
      targetHealthFactor: "2000000000000000000",      // restore to 2.0 HF
      collateralAsset: "0x4200000000000000000000000000000000000006", // WETH
      debtAsset: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",       // Aave USDC on Base Sepolia
      preferDebtRepayment: false,
      duration: 86400,                                // 1 day
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error("   FAILED:", JSON.stringify(err, null, 2));
    process.exit(1);
  }

  const result = await res.json();
  console.log("\n=== SUCCESS ===");
  console.log("Config ID:    ", result.configId);
  console.log("Tx hash:      ", result.txHash);
  console.log("Message:      ", result.message);

  const configId = result.configId;

  // 4. Verify config on-chain
  console.log("\n4. Verifying config on-chain...");
  await new Promise((r) => setTimeout(r, 2000));
  const config = await (await fetch(`${SERVER}/api/status/config/${configId}`)).json();
  console.log("   Status:    ", config.status);
  console.log("   Type:      ", config.protectionType);
  console.log("   HF trigger:", (BigInt(config.healthFactorThreshold || "0") / BigInt(1e15) / 1000n).toString() + " HF");

  // 5. List active configs
  console.log("\n5. Active configs...");
  const configs = await (await fetch(`${SERVER}/api/status/configs`)).json();
  console.log("   Active IDs:", configs.activeConfigIds);

  // 6. Check user health factor
  console.log("\n6. Current health factor...");
  const hf = await (await fetch(`${SERVER}/api/status/health/${PROTECTED_USER}`)).json();
  if (hf.noAavePosition) {
    console.log("   No Aave position — protection registered but won't fire until you have borrows");
  } else {
    console.log("   Health factor:", hf.healthFactorDecimal);
    console.log("   At risk:", hf.atRisk);
  }

  console.log(`
=== Next Steps ===
- Wait ~12 minutes for the first CRON tick from the Reactive Network
- Check Reactscan: https://lasna.reactscan.net/address/<YOUR_RC_ADDRESS>
- Poll config: curl ${SERVER}/api/status/config/${configId} | jq

Management:
  Pause:  curl -X POST ${SERVER}/api/protect/liquidation/pause  -H 'Content-Type: application/json' -d '{"configId": ${configId}}'
  Resume: curl -X POST ${SERVER}/api/protect/liquidation/resume -H 'Content-Type: application/json' -d '{"configId": ${configId}}'
  Cancel: curl -X POST ${SERVER}/api/protect/liquidation/cancel -H 'Content-Type: application/json' -d '{"configId": ${configId}}'
`);
}

main().catch((err) => {
  console.error("Error:", err?.message ?? err);
  process.exit(1);
});
