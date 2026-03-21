/**
 * test-bridge.ts — Targeted bridge test (BRIDGE_MODE=live)
 *
 * Tests the ETH → lREACT bridge path directly, bypassing Uniswap.
 * (The Uniswap pool on Base Sepolia testnet has too little liquidity
 *  for a reliable automated test of the swap step.)
 *
 * Flow:
 *   1. Wrap 0.025 ETH → WETH (WETH.deposit())
 *   2. Call bridgeEthToLasna(0.021 ETH, rcAddress)
 *      → unwraps WETH → ETH, sends to Reactive bridge contract
 *   3. Verify RC address on Lasna received lREACT
 *
 * Usage:
 *   npx tsx test-bridge.ts
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
  parseAbi,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { lasnaClient } from "./src/server/chain";
import { computeBreakdown } from "./src/server/bridge";

// ── Addresses ─────────────────────────────────────────────────────────────────

const USDC          = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const WETH          = "0x4200000000000000000000000000000000000006" as const;
const BRIDGE        = "0x2afaFD298b23b62760711756088F75B7409f5967" as const;
const RC_ADDRESS    = process.env.AAVE_PROTECTION_REACTIVE_ADDRESS as `0x${string}`;
const RPC           = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";

// Amount to wrap then bridge
const WRAP_AMOUNT   = parseEther("0.025"); // wrap 0.025 ETH to WETH
const BRIDGE_AMOUNT = parseEther("0.021"); // bridge 0.021 ETH worth of WETH (keeps 0.004 as gas)

// ── ABIs ──────────────────────────────────────────────────────────────────────

const WETH_ABI = parseAbi([
  "function deposit() external payable",
  "function withdraw(uint256) external",
  "function balanceOf(address) external view returns (uint256)",
]);
const ERC20_ABI = parseAbi([
  "function balanceOf(address) external view returns (uint256)",
]);
const BRIDGE_ABI = parseAbi([
  "function request(address recipient) external payable",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getBalances(pub: ReturnType<typeof createPublicClient>, wallet: `0x${string}`) {
  const eth  = await pub.getBalance({ address: wallet });
  const usdc = await pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [wallet] }) as bigint;
  const weth = await pub.readContract({ address: WETH, abi: WETH_ABI,  functionName: "balanceOf", args: [wallet] }) as bigint;
  const rcLreact = await lasnaClient.getBalance({ address: RC_ADDRESS });
  return { eth, usdc, weth, rcLreact };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── Setup ──────────────────────────────────────────────────────────────────
  const pk = process.env.SERVER_PRIVATE_KEY;
  if (!pk) throw new Error("SERVER_PRIVATE_KEY not set");
  if (!RC_ADDRESS) throw new Error("AAVE_PROTECTION_REACTIVE_ADDRESS not set");
  if (process.env.BRIDGE_MODE !== "live") throw new Error("Set BRIDGE_MODE=live in .env");

  const hex = pk.startsWith("0x") ? pk : `0x${pk}`;
  const account = privateKeyToAccount(hex as `0x${string}`);

  const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const wal = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

  console.log("=== Bridge Test (BRIDGE_MODE=live) ===");
  console.log(`Wallet:      ${account.address}`);
  console.log(`RC address:  ${RC_ADDRESS}`);
  console.log(`Bridge:      ${BRIDGE}`);

  // ── Balances BEFORE ────────────────────────────────────────────────────────
  console.log("\n── Balances BEFORE ──────────────────────────────");
  const before = await getBalances(pub, account.address);
  console.log(`  ETH:        ${formatEther(before.eth)} ETH`);
  console.log(`  USDC:       ${formatUnits(before.usdc, 6)} USDC`);
  console.log(`  WETH:       ${formatEther(before.weth)} WETH`);
  console.log(`  RC lREACT:  ${formatEther(before.rcLreact)} lREACT`);

  if (before.eth < WRAP_AMOUNT + parseEther("0.005")) {
    throw new Error(`Insufficient ETH: have ${formatEther(before.eth)}, need ~${formatEther(WRAP_AMOUNT + parseEther("0.005"))} (wrap + gas)`);
  }

  // ── Show breakdown for 1-day protection ───────────────────────────────────
  console.log("\n── Breakdown for $5 USDC / 1 day (for reference) ───");
  const bd = await computeBreakdown(5_000_000n, 86400);
  console.log(`  Lasna gas → lREACT needed:  ${formatEther(bd.rcGasWei * 100n)} lREACT`);
  console.log(`  ETH to bridge (=lREACT/100): ${formatEther(bd.rcGasWei)} ETH`);
  console.log(`  Bridging now:               ${formatEther(BRIDGE_AMOUNT)} ETH`);
  console.log(`  Expected lREACT gained:     ${formatEther(BRIDGE_AMOUNT * 100n)} lREACT`);

  // ── Step 1: Wrap ETH → WETH (skip if already have enough) ─────────────────
  let depositTx: `0x${string}` | undefined;
  if (before.weth >= BRIDGE_AMOUNT) {
    console.log(`\n── Step 1: Already have ${formatEther(before.weth)} WETH — skipping wrap ──`);
  } else {
    console.log(`\n── Step 1: Wrapping ${formatEther(WRAP_AMOUNT)} ETH → WETH ──────────`);
    depositTx = await wal.writeContract({
      address: WETH,
      abi: WETH_ABI,
      functionName: "deposit",
      value: WRAP_AMOUNT,
    });
    const depositReceipt = await pub.waitForTransactionReceipt({ hash: depositTx });
    console.log(`  Tx:     ${depositTx}`);
    console.log(`  Block:  ${depositReceipt.blockNumber}`);
    console.log(`  Status: ${depositReceipt.status}`);
    // Brief delay to allow RPC to catch up to latest state
    await new Promise(r => setTimeout(r, 2_000));
  }

  const wethBalance = await pub.readContract({ address: WETH, abi: WETH_ABI, functionName: "balanceOf", args: [account.address] }) as bigint;
  console.log(`  WETH balance: ${formatEther(wethBalance)} WETH`);
  if (wethBalance < BRIDGE_AMOUNT) {
    throw new Error(`WETH balance too low: ${formatEther(wethBalance)}, need ${formatEther(BRIDGE_AMOUNT)}`);
  }

  // ── Step 2: Unwrap WETH → ETH ──────────────────────────────────────────────
  console.log(`\n── Step 2: Unwrapping ${formatEther(BRIDGE_AMOUNT)} WETH → ETH ────────`);
  const withdrawTx = await wal.writeContract({
    address: WETH,
    abi: WETH_ABI,
    functionName: "withdraw",
    args: [BRIDGE_AMOUNT],
  });
  const withdrawReceipt = await pub.waitForTransactionReceipt({ hash: withdrawTx });
  console.log(`  Tx:     ${withdrawTx}`);
  console.log(`  Block:  ${withdrawReceipt.blockNumber}`);
  console.log(`  Status: ${withdrawReceipt.status}`);

  // ── Step 3: Bridge ETH → Lasna (lREACT to RC) ─────────────────────────────
  console.log(`\n── Step 3: Bridging ${formatEther(BRIDGE_AMOUNT)} ETH → lREACT to RC ──`);
  console.log(`  Recipient on Lasna: ${RC_ADDRESS}`);
  console.log(`  Expected lREACT:    ${formatEther(BRIDGE_AMOUNT * 100n)} lREACT`);

  const bridgeTx = await wal.writeContract({
    address: BRIDGE,
    abi: BRIDGE_ABI,
    functionName: "request",
    args: [RC_ADDRESS],
    value: BRIDGE_AMOUNT,
  });
  const bridgeReceipt = await pub.waitForTransactionReceipt({ hash: bridgeTx });
  console.log(`  Tx:     ${bridgeTx}`);
  console.log(`  Block:  ${bridgeReceipt.blockNumber}`);
  console.log(`  Status: ${bridgeReceipt.status}`);

  if (bridgeReceipt.status !== "success") {
    throw new Error(`Bridge tx reverted: ${bridgeTx}`);
  }

  // ── Wait for Lasna finality (~15s) then read balance ──────────────────────
  console.log("\n── Waiting 20s for Lasna bridge finality... ─────────");
  await new Promise(r => setTimeout(r, 20_000));

  // ── Balances AFTER ─────────────────────────────────────────────────────────
  console.log("\n── Balances AFTER ───────────────────────────────────");
  const after = await getBalances(pub, account.address);
  const ethDelta  = after.eth - before.eth;
  const wethDelta = after.weth - before.weth;
  const lreactDelta = after.rcLreact - before.rcLreact;

  console.log(`  ETH:        ${formatEther(after.eth)} ETH   (Δ ${formatEther(ethDelta)})`);
  console.log(`  USDC:       ${formatUnits(after.usdc, 6)} USDC (Δ ${formatUnits(after.usdc - before.usdc, 6)})`);
  console.log(`  WETH:       ${formatEther(after.weth)} WETH  (Δ ${formatEther(wethDelta)})`);
  console.log(`  RC lREACT:  ${formatEther(after.rcLreact)} lREACT (Δ ${formatEther(lreactDelta)})`);

  // ── Result ─────────────────────────────────────────────────────────────────
  console.log("\n── Result ───────────────────────────────────────────");
  if (lreactDelta > 0n) {
    console.log(`✓ BRIDGE CONFIRMED`);
    console.log(`  RC gained ${formatEther(lreactDelta)} lREACT on Lasna`);
    console.log(`  Expected: ${formatEther(BRIDGE_AMOUNT * 100n)} lREACT (1 ETH = 100 lREACT)`);
    const gasConsumed = lreactDelta < BRIDGE_AMOUNT * 100n
      ? `(some consumed by RC gas already)`
      : "";
    console.log(`  ${gasConsumed}`);
  } else {
    console.log(`⚠  RC lREACT unchanged after 20s — bridge may still be finalising.`);
    console.log(`   Bridge tx: ${bridgeTx}`);
    console.log(`   Poll:  cast balance ${RC_ADDRESS} --rpc-url https://lasna-rpc.rnk.dev/`);
    console.log(`   View on Lasna explorer: https://lasna.reactscan.net/address/${RC_ADDRESS}`);
  }

  console.log(`\nExplorer links:`);
  if (depositTx) console.log(`  Deposit:  https://sepolia.basescan.org/tx/${depositTx}`);
  console.log(`  Withdraw: https://sepolia.basescan.org/tx/${withdrawTx}`);
  console.log(`  Bridge:   https://sepolia.basescan.org/tx/${bridgeTx}`);
}

main().catch(err => {
  console.error("\n✗ Error:", err?.shortMessage ?? err?.message ?? err);
  process.exit(1);
});
