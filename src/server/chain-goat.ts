/**
 * chain-goat.ts — viem clients and contract interactions for GOAT Testnet3.
 *
 * Parallel to chain.ts (Base Sepolia + Reactive Network), not a replacement —
 * the two products run on different chains with different automation models.
 * See /goat-research for the full reasoning.
 *
 * Flow (no Reactive Network involved):
 *   1. Agent pays via x402 → server receives USDC (still on Base Sepolia —
 *      x402 payment rail is unchanged; only DCA execution moves to GOAT)
 *   2. Server calls createDCAConfig() on DCAStrategyCallbackGoat (owner-only)
 *   3. The server's own scheduler (goat-scheduler.ts) calls the PERMISSIONLESS
 *      executeDCAOrders() periodically — same call anyone else could make.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DCA_STRATEGY_CALLBACK_GOAT_ABI } from "../abis/dca-strategy-callback-goat";
import { GOAT_TESTNET3_CONTRACTS } from "../config/contracts";

// ── GOAT Testnet3 chain definition (not in viem built-ins) ───────────────────

export const goatTestnet3 = {
  id: 48_816,
  name: "GOAT Testnet3",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.GOAT_TESTNET3_RPC_URL ?? "https://rpc.testnet3.goat.network"] },
  },
} as const;

const DCA_CONFIG_CREATED_SELECTOR = keccak256(
  toHex("DCAConfigCreated(uint256,address,address,uint256,uint24,uint256)")
);

// ── Client setup ──────────────────────────────────────────────────────────────

function getAccount() {
  const pk = process.env.GOAT_DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("GOAT_DEPLOYER_PRIVATE_KEY not set");
  const hex = pk.startsWith("0x") ? pk : `0x${pk}`;
  return privateKeyToAccount(hex as `0x${string}`);
}

export const goatPublicClient = createPublicClient({
  chain: goatTestnet3,
  transport: http(goatTestnet3.rpcUrls.default.http[0]),
});

export function getGoatWalletClient() {
  return createWalletClient({
    account: getAccount(),
    chain: goatTestnet3,
    transport: http(goatTestnet3.rpcUrls.default.http[0]),
  });
}

function getDCACallbackAddress(): Address {
  return GOAT_TESTNET3_CONTRACTS.dcaStrategyCallbackGoat;
}

// ── Config management ──────────────────────────────────────────────────────

export interface CreateDCAParamsGoat {
  user: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountPerSwap: bigint;
  poolFee: number;
  totalSwaps: bigint;
  swapInterval: bigint;
  minAmountOut: bigint;
  duration: bigint;
}

/**
 * Create a DCA config on DCAStrategyCallbackGoat.
 * Owner-only — the server wallet (GOAT_DEPLOYER_PRIVATE_KEY) must be the contract owner.
 */
export async function createDCAConfigGoat(
  params: CreateDCAParamsGoat
): Promise<{ configId: bigint; txHash: Hash }> {
  const walletClient = getGoatWalletClient();
  const callbackAddress = getDCACallbackAddress();

  console.log(`[chain-goat] Creating DCA config on ${callbackAddress}...`);
  console.log(`[chain-goat]   user=${params.user} tokenIn=${params.tokenIn} tokenOut=${params.tokenOut}`);

  const txHash = await walletClient.writeContract({
    address: callbackAddress,
    abi: DCA_STRATEGY_CALLBACK_GOAT_ABI,
    functionName: "createDCAConfig",
    args: [
      params.user,
      params.tokenIn,
      params.tokenOut,
      params.amountPerSwap,
      params.poolFee,
      params.totalSwaps,
      params.swapInterval,
      params.minAmountOut,
      params.duration,
    ],
  });

  const receipt = await goatPublicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[chain-goat] DCA tx confirmed in block ${receipt.blockNumber}`);

  const configuredLog = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === callbackAddress.toLowerCase() &&
      log.topics[0] === DCA_CONFIG_CREATED_SELECTOR
  );

  if (!configuredLog || !configuredLog.topics[1]) {
    throw new Error(`DCAConfigCreated event not found in tx ${txHash}. Logs found: ${receipt.logs.length}`);
  }

  const configId = BigInt(configuredLog.topics[1]);
  console.log(`[chain-goat] DCA config #${configId} created`);

  return { configId, txHash };
}

export async function pauseDCAConfigGoat(configId: bigint): Promise<Hash> {
  const walletClient = getGoatWalletClient();
  const txHash = await walletClient.writeContract({
    address: getDCACallbackAddress(),
    abi: DCA_STRATEGY_CALLBACK_GOAT_ABI,
    functionName: "pauseDCAConfig",
    args: [configId],
  });
  await goatPublicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export async function resumeDCAConfigGoat(configId: bigint): Promise<Hash> {
  const walletClient = getGoatWalletClient();
  const txHash = await walletClient.writeContract({
    address: getDCACallbackAddress(),
    abi: DCA_STRATEGY_CALLBACK_GOAT_ABI,
    functionName: "resumeDCAConfig",
    args: [configId],
  });
  await goatPublicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export async function cancelDCAConfigGoat(configId: bigint): Promise<Hash> {
  const walletClient = getGoatWalletClient();
  const txHash = await walletClient.writeContract({
    address: getDCACallbackAddress(),
    abi: DCA_STRATEGY_CALLBACK_GOAT_ABI,
    functionName: "cancelDCAConfig",
    args: [configId],
  });
  await goatPublicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

/**
 * Call the PERMISSIONLESS executeDCAOrders(). Used by goat-scheduler.ts as the
 * default caller — but this is not a privileged call; anyone with any wallet
 * could make this exact same call. See /goat-research/06-automation-alternatives.md.
 *
 * IMPORTANT: pass an explicit gas limit. eth_estimateGas underestimates this
 * function because it wraps the actual swap in try/catch — the outer call
 * "succeeds" even when the inner swap silently fails, so the estimator can
 * converge on a limit too low for the inner swap to actually complete. Hit
 * this for real during testnet deployment; see goat-research/07.
 */
export async function executeDCAOrdersGoat(): Promise<{ txHash: Hash; swapsExecuted: bigint }> {
  const walletClient = getGoatWalletClient();
  const callbackAddress = getDCACallbackAddress();

  const txHash = await walletClient.writeContract({
    address: callbackAddress,
    abi: DCA_STRATEGY_CALLBACK_GOAT_ABI,
    functionName: "executeDCAOrders",
    gas: 2_000_000n,
  });

  const receipt = await goatPublicClient.waitForTransactionReceipt({ hash: txHash });

  const swapExecutedSelector = keccak256(
    toHex("DCASwapExecuted(uint256,address,address,uint256,uint256)")
  );
  const swapsExecuted = BigInt(
    receipt.logs.filter(
      (log) =>
        log.address.toLowerCase() === callbackAddress.toLowerCase() &&
        log.topics[0] === swapExecutedSelector
    ).length
  );

  return { txHash, swapsExecuted };
}

// ── Read helpers ──────────────────────────────────────────────────────────────

export interface DCAConfigDataGoat {
  id: bigint;
  user: string;
  tokenIn: string;
  tokenOut: string;
  amountPerSwap: bigint;
  poolFee: number;
  totalSwaps: bigint;
  swapsExecuted: bigint;
  totalAmountOut: bigint;
  swapInterval: bigint;
  minAmountOut: bigint;
  status: number;
  createdAt: bigint;
  expiresAt: bigint;
  lastSwapAt: bigint;
  consecutiveFailures: number;
  lastAttemptAt: bigint;
}

export async function getDCAConfigGoat(configId: bigint): Promise<DCAConfigDataGoat> {
  const result = await goatPublicClient.readContract({
    address: getDCACallbackAddress(),
    abi: DCA_STRATEGY_CALLBACK_GOAT_ABI,
    functionName: "dcaConfigs",
    args: [configId],
  });

  const r = result as any;
  return {
    id: BigInt(r[0]),
    user: r[1],
    tokenIn: r[2],
    tokenOut: r[3],
    amountPerSwap: BigInt(r[4]),
    poolFee: Number(r[5]),
    totalSwaps: BigInt(r[6]),
    swapsExecuted: BigInt(r[7]),
    totalAmountOut: BigInt(r[8]),
    swapInterval: BigInt(r[9]),
    minAmountOut: BigInt(r[10]),
    status: Number(r[11]),
    createdAt: BigInt(r[12]),
    expiresAt: BigInt(r[13] ?? 0),
    lastSwapAt: BigInt(r[14]),
    consecutiveFailures: Number(r[15]),
    lastAttemptAt: BigInt(r[16]),
  };
}

export async function getActiveDCAConfigsGoat(): Promise<bigint[]> {
  const result = await goatPublicClient.readContract({
    address: getDCACallbackAddress(),
    abi: DCA_STRATEGY_CALLBACK_GOAT_ABI,
    functionName: "getActiveConfigs",
  });
  return (result as any[]).map((id: any) => BigInt(id));
}

/**
 * Every config ever created, active or not. getActiveDCAConfigsGoat() is the
 * right read for "what still needs executing"; this is the right read for the
 * monitoring page, where a completed config that actually swapped is the most
 * useful thing a visitor can see.
 */
export async function getAllDCAConfigsGoat(): Promise<bigint[]> {
  const result = await goatPublicClient.readContract({
    address: getDCACallbackAddress(),
    abi: DCA_STRATEGY_CALLBACK_GOAT_ABI,
    functionName: "getAllConfigs",
  });
  return (result as any[]).map((id: any) => BigInt(id));
}

export async function getUserDCAConfigsGoat(userAddress: Address): Promise<bigint[]> {
  const result = await goatPublicClient.readContract({
    address: getDCACallbackAddress(),
    abi: DCA_STRATEGY_CALLBACK_GOAT_ABI,
    functionName: "getUserConfigs",
    args: [userAddress],
  });
  return (result as any[]).map((id: any) => BigInt(id));
}

/** Deployer wallet's native BTC balance on GOAT Testnet3 — used for a health check. */
export async function getGoatDeployerBalance(): Promise<bigint> {
  return goatPublicClient.getBalance({ address: getAccount().address });
}

/** Minimum BTC balance below which the scheduler should stop trying to pay gas. */
export const MIN_GOAT_BALANCE = 1_000_000_000n; // 1 gwei-equivalent of BTC — testnet gas is ~0.00013 gwei
