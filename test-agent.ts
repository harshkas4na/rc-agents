/**
 * test-agent.ts — Full lifecycle E2E test for rc-agents marketplace
 *
 * Usage:
 *   AGENT_PRIVATE_KEY=0x... npx tsx test-agent.ts
 *   AGENT_PRIVATE_KEY=0x... npx tsx test-agent.ts --dca    (DCA only)
 *   AGENT_PRIVATE_KEY=0x... npx tsx test-agent.ts --aave   (Aave only)
 *   AGENT_PRIVATE_KEY=0x... npx tsx test-agent.ts --both   (both services, default)
 *
 * Flow:
 *   1. Health check — verify server + RC funding
 *   2. Service discovery — list services + pricing
 *   3. Quote — get exact price for subscription duration
 *   4. ERC20 approve — approve callback contracts to spend agent's tokens (DCA)
 *   5. Pay + subscribe — x402 payment, server creates on-chain config
 *   6. Verify on-chain — read config back from callback contract
 *   7. Monitor — poll config status, wait for CRON ticks + swaps
 *   8. Deactivate — cancel subscriptions after monitoring window
 *   9. Verify cancellation — confirm configs are cancelled
 *
 * Env vars:
 *   AGENT_PRIVATE_KEY     — required, agent wallet private key (must have USDC + ETH on Base Sepolia)
 *   SERVER_URL            — optional, defaults to http://localhost:3000
 *   MONITOR_MINUTES       — optional, how long to monitor before deactivating (default: 15)
 *   SUBSCRIPTION_SECONDS  — optional, subscription duration in seconds (default: 3600 = 1 hour)
 *   DCA_AMOUNT_PER_SWAP   — optional, USDC per DCA swap in base units (default: 10000000 = 10 USDC)
 *   DCA_TOTAL_SWAPS       — optional, number of DCA swaps (default: 3)
 */

import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, type Address } from "viem";
import { baseSepolia } from "viem/chains";

// ── Config ─────────────────────────────────────────────────────────────────────

const SERVER = process.env.SERVER_URL ?? "http://localhost:3000";
const MONITOR_MINUTES = parseInt(process.env.MONITOR_MINUTES ?? "40", 10);
const SUBSCRIPTION_SECONDS = parseInt(process.env.SUBSCRIPTION_SECONDS ?? "3600", 10);
const DCA_AMOUNT_PER_SWAP = process.env.DCA_AMOUNT_PER_SWAP ?? "10000000"; // 10 USDC
const DCA_TOTAL_SWAPS = parseInt(process.env.DCA_TOTAL_SWAPS ?? "3", 10);

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
const WETH = "0x4200000000000000000000000000000000000006" as Address;

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
]);

// ── Wallet setup ───────────────────────────────────────────────────────────────

const AGENT_PK = process.env.AGENT_PRIVATE_KEY;
if (!AGENT_PK) {
  console.error("Set AGENT_PRIVATE_KEY=0x... before running");
  process.exit(1);
}

const account = privateKeyToAccount(AGENT_PK as `0x${string}`);
const client = new x402Client();
registerExactEvmScheme(client, { signer: account });
const x402Fetch = wrapFetchWithPayment(fetch, client);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"),
});

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"),
});

// ── Mode parsing ───────────────────────────────────────────────────────────────

const mode = process.argv[2] ?? "--both";
const runAave = mode === "--aave" || mode === "--both";
const runDCA = mode === "--dca" || mode === "--both";

// ── Helpers ────────────────────────────────────────────────────────────────────

async function jsonGet(path: string) {
  const res = await fetch(`${SERVER}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function jsonPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${SERVER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function timestamp() {
  return new Date().toLocaleTimeString();
}

// ── ERC20 helpers ──────────────────────────────────────────────────────────────

async function checkAndApprove(token: Address, spender: Address, amount: bigint, label: string) {
  const currentAllowance = (await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, spender],
  })) as bigint;

  if (currentAllowance >= amount) {
    console.log(`   ${label}: Allowance already sufficient (${formatUnits(currentAllowance, 6)} USDC)`);
    return;
  }

  console.log(`   ${label}: Approving ${formatUnits(amount, 6)} USDC for ${spender}...`);
  const txHash = await walletClient.writeContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`   ${label}: Approved (tx: ${txHash})`);
}

async function getBalance(token: Address): Promise<bigint> {
  return (await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║         rc-agents — Full Lifecycle E2E Test                 ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log("  Agent wallet:  ", account.address);
  console.log("  Server:        ", SERVER);
  console.log("  Mode:          ", mode);
  console.log("  Subscription:  ", `${SUBSCRIPTION_SECONDS}s (${(SUBSCRIPTION_SECONDS / 3600).toFixed(1)}h)`);
  console.log("  Monitor window:", `${MONITOR_MINUTES} minutes`);
  if (runDCA) {
    console.log("  DCA config:    ", `${formatUnits(BigInt(DCA_AMOUNT_PER_SWAP), 6)} USDC/swap × ${DCA_TOTAL_SWAPS} swaps`);
  }

  // ── Check agent balances ─────────────────────────────────────────────────────
  console.log("\n── 0. Agent wallet balances ────────────────────────────────────");
  const ethBalance = await publicClient.getBalance({ address: account.address });
  const usdcBalance = await getBalance(USDC);
  console.log(`   ETH:  ${formatUnits(ethBalance, 18)} ETH`);
  console.log(`   USDC: ${formatUnits(usdcBalance, 6)} USDC`);

  if (ethBalance < 1_000_000_000_000_000n) { // < 0.001 ETH
    console.error("\n   ABORT: Agent needs ETH for gas on Base Sepolia");
    process.exit(1);
  }
  if (usdcBalance < 300_000n) { // < $0.30
    console.error("\n   ABORT: Agent needs USDC on Base Sepolia (get from faucet.circle.com)");
    process.exit(1);
  }

  // ── 1. Health check ──────────────────────────────────────────────────────────
  console.log("\n── 1. Server health ────────────────────────────────────────────");
  const health = await jsonGet("/health");
  console.log("   Status:", health.status);
  console.log("   Aave RC:", JSON.stringify(health.aaveProtection));
  console.log("   DCA RC: ", JSON.stringify(health.dcaStrategy));

  if (health.status !== "ok") {
    console.warn("   WARNING: Server is degraded — some RCs may be underfunded. Continuing...");
  }

  // ── 2. Service catalog ───────────────────────────────────────────────────────
  console.log("\n── 2. Service catalog ──────────────────────────────────────────");
  const { services } = await jsonGet("/api/services");
  for (const svc of services) {
    console.log(`   ${svc.id}:`);
    console.log(`     Name:   ${svc.name}`);
    console.log(`     Price:  ${svc.pricing.example1Day}/day`);
    console.log(`     Status: ${svc.status}`);
    console.log(`     Limits: ${svc.limits.minDurationSeconds}s – ${svc.limits.maxDurationSeconds}s`);
  }

  // Track created config IDs for later deactivation
  let aaveConfigId: string | null = null;
  let dcaConfigId: string | null = null;

  // ── 3. Aave Liquidation Protection ───────────────────────────────────────────
  if (runAave) {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║   AAVE LIQUIDATION PROTECTION                              ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");

    // 3a. Quote
    console.log("\n── 3a. Quote ──────────────────────────────────────────────────");
    const aaveQuote = await jsonPost("/api/quote", {
      service: "aave-protection",
      durationSeconds: SUBSCRIPTION_SECONDS,
    });
    console.log(`   Duration: ${SUBSCRIPTION_SECONDS}s`);
    console.log(`   Price:    ${aaveQuote.price} (${aaveQuote.priceBaseUnits} base units)`);

    // 3b. Pay + subscribe
    console.log("\n── 3b. x402 Payment + Create Protection Config ────────────────");
    const PROTECTED_USER = process.env.PROTECTED_USER ?? account.address;
    console.log("   Protected user:", PROTECTED_USER);

    const aaveRes = await x402Fetch(`${SERVER}/api/protect/liquidation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protectedUser: PROTECTED_USER,
        protectionType: 0, // COLLATERAL_DEPOSIT
        healthFactorThreshold: "1500000000000000000", // 1.5 HF
        targetHealthFactor: "2000000000000000000",    // 2.0 HF
        collateralAsset: WETH,
        debtAsset: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f", // USDC debt token
        preferDebtRepayment: false,
        duration: SUBSCRIPTION_SECONDS,
      }),
    });

    if (!aaveRes.ok) {
      const err = await aaveRes.json().catch(() => ({ error: aaveRes.statusText }));
      console.error("   FAILED:", JSON.stringify(err, null, 2));
    } else {
      const result = await aaveRes.json();
      aaveConfigId = result.configId;
      console.log("   Config ID:", result.configId);
      console.log("   Tx hash:  ", result.txHash);
      console.log("   Message:  ", result.message);
      if (result.nextSteps?.length) {
        console.log("   Next steps:");
        for (const step of result.nextSteps) console.log(`     - ${step}`);
      }

      // 3c. Verify on-chain
      console.log("\n── 3c. Verify config on-chain ──────────────────────────────────");
      await sleep(3000);
      const config = await jsonGet(`/api/status/config/${result.configId}`);
      console.log("   Status:         ", config.status);
      console.log("   Protected user: ", config.protectedUser);
      console.log("   Type:           ", ["COLLATERAL", "DEBT", "BOTH"][config.protectionType]);
      console.log("   HF threshold:   ", (Number(config.healthFactorThreshold) / 1e18).toFixed(2));
      console.log("   Target HF:     ", (Number(config.targetHealthFactor) / 1e18).toFixed(2));
      console.log("   Expires at:     ", config.expiresAt ? new Date(config.expiresAt * 1000).toISOString() : "never");

      // 3d. Health factor
      console.log("\n── 3d. Current health factor ───────────────────────────────────");
      const hf = await jsonGet(`/api/status/health/${PROTECTED_USER}`);
      if (hf.noAavePosition) {
        console.log("   No Aave position — protection won't fire until agent borrows on Aave");
      } else {
        console.log("   Health factor:", hf.healthFactorDecimal);
        console.log("   At risk:      ", hf.atRisk);
      }

      // 3e. Active configs
      console.log("\n── 3e. Active Aave configs ─────────────────────────────────────");
      const aaveConfigs = await jsonGet("/api/status/configs");
      console.log("   Active IDs:", aaveConfigs.activeConfigIds);
      console.log("   Count:     ", aaveConfigs.count);
    }
  }

  // ── 4. DCA Strategy ──────────────────────────────────────────────────────────
  if (runDCA) {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║   DCA STRATEGY (UNISWAP V3)                                ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");

    // 4a. Quote
    console.log("\n── 4a. Quote ──────────────────────────────────────────────────");
    const dcaQuote = await jsonPost("/api/quote", {
      service: "dca-strategy",
      durationSeconds: SUBSCRIPTION_SECONDS,
    });
    console.log(`   Duration: ${SUBSCRIPTION_SECONDS}s`);
    console.log(`   Price:    ${dcaQuote.price} (${dcaQuote.priceBaseUnits} base units)`);

    // 4b. ERC20 Approve — let CC spend agent's USDC for swaps
    console.log("\n── 4b. ERC20 Approval for DCA Callback ────────────────────────");
    const dcaCallbackAddress = (await jsonGet("/health")).dcaStrategy?.callbackAddress;
    // Fallback: read from server's DCA config endpoint or use env
    const totalNeeded = BigInt(DCA_AMOUNT_PER_SWAP) * BigInt(DCA_TOTAL_SWAPS);

    // We need to get the DCA callback address from the server response
    // The server returns it in nextSteps, but we need it before calling
    // So we extract it from the activate response below
    console.log(`   Total USDC needed for swaps: ${formatUnits(totalNeeded, 6)} USDC`);
    console.log(`   (Approval happens after config creation — we need the CC address from server)`);

    // 4c. Pay + subscribe
    console.log("\n── 4c. x402 Payment + Create DCA Config ────────────────────────");
    console.log(`   Strategy: USDC -> WETH`);
    console.log(`   Amount:   ${formatUnits(BigInt(DCA_AMOUNT_PER_SWAP), 6)} USDC per swap`);
    console.log(`   Swaps:    ${DCA_TOTAL_SWAPS} total`);
    console.log(`   Interval: 600s (10 min)`);

    const dcaRes = await x402Fetch(`${SERVER}/api/dca/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: account.address,
        tokenIn: USDC,
        tokenOut: WETH,
        amountPerSwap: DCA_AMOUNT_PER_SWAP,
        poolFee: 3000,
        totalSwaps: DCA_TOTAL_SWAPS,
        swapInterval: 600,     // 10 min — must be < CRON_100 interval (~700s)
        minAmountOut: "0",     // no slippage limit (testnet)
        duration: SUBSCRIPTION_SECONDS,
      }),
    });

    if (!dcaRes.ok) {
      const err = await dcaRes.json().catch(() => ({ error: dcaRes.statusText }));
      console.error("   FAILED:", JSON.stringify(err, null, 2));
    } else {
      const result = await dcaRes.json();
      dcaConfigId = result.configId;
      console.log("   Config ID:", result.configId);
      console.log("   Tx hash:  ", result.txHash);
      console.log("   Message:  ", result.message);

      // Extract CC address from nextSteps for approval
      if (result.nextSteps?.length) {
        console.log("   Next steps:");
        for (const step of result.nextSteps) console.log(`     - ${step}`);

        // Parse CC address from the first nextStep string
        const ccMatch = result.nextSteps[0]?.match(/0x[a-fA-F0-9]{40}/);
        if (ccMatch) {
          const ccAddr = ccMatch[0] as Address;
          console.log("\n── 4d. Approve DCA Callback to spend USDC ─────────────────────");
          await checkAndApprove(USDC, ccAddr, totalNeeded, "DCA");
        }
      }

      // 4e. Verify on-chain
      console.log("\n── 4e. Verify DCA config on-chain ─────────────────────────────");
      await sleep(3000);
      const dcaConfig = await jsonGet(`/api/dca/config/${result.configId}`);
      console.log("   Status:         ", dcaConfig.status);
      console.log("   Token pair:     ", `${dcaConfig.tokenIn} -> ${dcaConfig.tokenOut}`);
      console.log("   Per swap:       ", `${formatUnits(BigInt(dcaConfig.amountPerSwap), 6)} USDC`);
      console.log("   Swaps done:     ", `${dcaConfig.swapsExecuted} / ${dcaConfig.totalSwaps}`);
      console.log("   Total received: ", dcaConfig.totalAmountOut);
      console.log("   Swap interval:  ", `${dcaConfig.swapInterval}s`);
      console.log("   Expires at:     ", dcaConfig.expiresAt ? new Date(dcaConfig.expiresAt * 1000).toISOString() : "never");

      // 4f. User's DCA configs
      console.log("\n── 4f. User's DCA configs ─────────────────────────────────────");
      const userConfigs = await jsonGet(`/api/dca/user/${account.address}`);
      console.log("   Config IDs:", userConfigs.configIds);
      console.log("   Count:     ", userConfigs.count);

      // 4g. Active DCA configs
      console.log("\n── 4g. All active DCA configs ─────────────────────────────────");
      const dcaConfigs = await jsonGet("/api/dca/configs");
      console.log("   Active IDs:", dcaConfigs.activeConfigIds);
      console.log("   Count:     ", dcaConfigs.count);
    }
  }

  // ── 5. Monitor ───────────────────────────────────────────────────────────────
  if (aaveConfigId || dcaConfigId) {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║   MONITORING (waiting for CRON ticks)                      ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log(`\n   Polling every 2 minutes for ${MONITOR_MINUTES} minutes...`);
    console.log("   First CRON_100 tick expected in ~12 minutes.\n");

    const pollInterval = 2 * 60 * 1000; // 2 minutes
    const totalPolls = Math.ceil((MONITOR_MINUTES * 60 * 1000) / pollInterval);

    for (let i = 1; i <= totalPolls; i++) {
      await sleep(pollInterval);
      console.log(`── Poll ${i}/${totalPolls} [${timestamp()}] ──────────────────────────────`);

      if (dcaConfigId) {
        try {
          const dcaConfig = await jsonGet(`/api/dca/config/${dcaConfigId}`);
          console.log(`   DCA #${dcaConfigId}: status=${dcaConfig.status} swaps=${dcaConfig.swapsExecuted}/${dcaConfig.totalSwaps} received=${dcaConfig.totalAmountOut}`);

          if (dcaConfig.status === "Completed") {
            console.log("   DCA completed all swaps!");
            dcaConfigId = null; // No need to cancel
          }
        } catch (err: any) {
          console.log(`   DCA #${dcaConfigId}: error fetching — ${err.message}`);
        }
      }

      if (aaveConfigId) {
        try {
          const aaveConfig = await jsonGet(`/api/status/config/${aaveConfigId}`);
          console.log(`   Aave #${aaveConfigId}: status=${aaveConfig.status} executions=${aaveConfig.executionCount} failures=${aaveConfig.consecutiveFailures}`);

          const PROTECTED_USER = process.env.PROTECTED_USER ?? account.address;
          const hf = await jsonGet(`/api/status/health/${PROTECTED_USER}`);
          if (hf.noAavePosition) {
            console.log(`   Aave HF: no position (protection dormant)`);
          } else {
            console.log(`   Aave HF: ${hf.healthFactorDecimal} (at risk: ${hf.atRisk})`);
          }
        } catch (err: any) {
          console.log(`   Aave #${aaveConfigId}: error fetching — ${err.message}`);
        }
      }
    }
  }

  // ── 6. Deactivate ────────────────────────────────────────────────────────────
  if (aaveConfigId || dcaConfigId) {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║   DEACTIVATION                                             ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");

    if (dcaConfigId) {
      console.log(`\n── 6a. Cancel DCA config #${dcaConfigId} ──────────────────────────`);
      try {
        const cancelRes = await jsonPost("/api/dca/cancel", { configId: parseInt(dcaConfigId, 10) });
        console.log("   Result:", cancelRes.action);
        console.log("   Tx:    ", cancelRes.txHash);
      } catch (err: any) {
        console.error("   Cancel failed:", err.message);
      }
    }

    if (aaveConfigId) {
      console.log(`\n── 6b. Cancel Aave config #${aaveConfigId} ────────────────────────`);
      try {
        const cancelRes = await jsonPost("/api/protect/liquidation/cancel", { configId: parseInt(aaveConfigId, 10) });
        console.log("   Result:", cancelRes.action);
        console.log("   Tx:    ", cancelRes.txHash);
      } catch (err: any) {
        console.error("   Cancel failed:", err.message);
      }
    }

    // ── 7. Verify cancellation ───────────────────────────────────────────────
    console.log("\n── 7. Verify cancellation ─────────────────────────────────────");
    await sleep(3000);

    if (dcaConfigId) {
      try {
        const dcaConfig = await jsonGet(`/api/dca/config/${dcaConfigId}`);
        console.log(`   DCA #${dcaConfigId}: status=${dcaConfig.status}`);
      } catch (err: any) {
        console.log(`   DCA #${dcaConfigId}: ${err.message}`);
      }
    }

    if (aaveConfigId) {
      try {
        const aaveConfig = await jsonGet(`/api/status/config/${aaveConfigId}`);
        console.log(`   Aave #${aaveConfigId}: status=${aaveConfig.status}`);
      } catch (err: any) {
        console.log(`   Aave #${aaveConfigId}: ${err.message}`);
      }
    }

    // Final active config check
    console.log("\n── 8. Final active config counts ──────────────────────────────");
    if (runDCA) {
      const dcaConfigs = await jsonGet("/api/dca/configs");
      console.log("   Active DCA configs:", dcaConfigs.count);
    }
    if (runAave) {
      const aaveConfigs = await jsonGet("/api/status/configs");
      console.log("   Active Aave configs:", aaveConfigs.count);
    }
  }

  // ── Final balances ───────────────────────────────────────────────────────────
  console.log("\n── 9. Final agent balances ─────────────────────────────────────");
  const finalEth = await publicClient.getBalance({ address: account.address });
  const finalUsdc = await getBalance(USDC);
  console.log(`   ETH:  ${formatUnits(finalEth, 18)} ETH (spent ${formatUnits(ethBalance - finalEth, 18)} on gas)`);
  console.log(`   USDC: ${formatUnits(finalUsdc, 6)} USDC (spent ${formatUnits(usdcBalance - finalUsdc, 6)} total)`);

  // ── Done ─────────────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║   TEST COMPLETE                                            ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`
Summary:
  - Services tested: ${[runAave && "Aave Protection", runDCA && "DCA Strategy"].filter(Boolean).join(", ")}
  - Subscriptions created and ${aaveConfigId || dcaConfigId ? "cancelled" : "completed"}
  - Monitor window: ${MONITOR_MINUTES} minutes
  - Total USDC spent: ${formatUnits(usdcBalance - finalUsdc, 6)} USDC
  `);
}

main().catch((err) => {
  console.error("\nFATAL:", err?.message ?? err);
  process.exit(1);
});
