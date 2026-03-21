/**
 * chain.ts — viem clients and contract interactions.
 *
 * All on-chain writes use the server wallet (SERVER_PRIVATE_KEY).
 * The server wallet must be the `owner` of AaveProtectionCallback.
 *
 * Flow:
 *   1. Agent pays via x402 → server receives USDC
 *   2. Server calls createProtectionConfig() → writes to CC on Base Sepolia
 *   3. CC emits ProtectionConfigured → RC picks it up on Lasna (Reactive Network)
 *   4. RC fires checkAndProtectPositions() callbacks via CRON → CC checks HF + acts
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
import { baseSepolia } from "viem/chains";
import { AAVE_PROTECTION_CALLBACK_ABI } from "../abis/aave-protection-callback";
import { DCA_STRATEGY_CALLBACK_ABI } from "../abis/dca-strategy-callback";
import { CONTRACTS } from "../config/contracts";

// ── Lasna chain definition (Reactive Network testnet, not in viem built-ins) ──

export const lasnaChain = {
  id: 5_318_007,
  name: "Lasna Testnet",
  nativeCurrency: { name: "REACT", symbol: "REACT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://lasna-rpc.rnk.dev/"] },
  },
} as const;

// ── Event selector for log parsing ────────────────────────────────────────────

const PROTECTION_CONFIGURED_SELECTOR = keccak256(
  toHex("ProtectionConfigured(uint256,uint8,uint256,uint256,address,address)")
);

// ── Client setup ──────────────────────────────────────────────────────────────

function getAccount() {
  const pk = process.env.SERVER_PRIVATE_KEY;
  if (!pk) throw new Error("SERVER_PRIVATE_KEY not set");
  const hex = pk.startsWith("0x") ? pk : `0x${pk}`;
  return privateKeyToAccount(hex as `0x${string}`);
}

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"),
});

export const lasnaClient = createPublicClient({
  chain: lasnaChain,
  transport: http(process.env.LASNA_RPC_URL ?? "https://lasna-rpc.rnk.dev/"),
});

export function getWalletClient() {
  return createWalletClient({
    account: getAccount(),
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"),
  });
}

function getCallbackAddress(): Address {
  const addr = CONTRACTS.aaveProtectionCallback;
  if (!addr || (addr as string) === "") {
    throw new Error("AAVE_PROTECTION_CALLBACK_ADDRESS not set in .env");
  }
  return addr;
}

function getReactiveAddress(): Address {
  const addr = CONTRACTS.aaveProtectionReactive;
  if (!addr || (addr as string) === "") {
    throw new Error("AAVE_PROTECTION_REACTIVE_ADDRESS not set in .env");
  }
  return addr;
}

// ── Contract helpers ──────────────────────────────────────────────────────────

export interface CreateProtectionParams {
  protectedUser: Address;
  /** 0 = COLLATERAL_DEPOSIT, 1 = DEBT_REPAYMENT, 2 = BOTH */
  protectionType: number;
  /** HF threshold in WAD (1.5 HF → 1_500_000_000_000_000_000n) */
  healthFactorThreshold: bigint;
  /** Target HF in WAD (2.0 HF → 2_000_000_000_000_000_000n) */
  targetHealthFactor: bigint;
  collateralAsset: Address;
  debtAsset: Address;
  preferDebtRepayment: boolean;
  /** Duration in seconds; protection auto-expires after this. 0 = no expiry. */
  duration: bigint;
}

/**
 * Create a protection config on AaveProtectionCallback.
 *
 * Called by the server after x402 payment is confirmed.
 * The CC's createProtectionConfig() is owner-only — the server wallet must be the CC owner.
 *
 * Returns the config ID parsed from the ProtectionConfigured event.
 */
export async function createProtectionConfig(
  params: CreateProtectionParams
): Promise<{ configId: bigint; txHash: Hash }> {
  const walletClient = getWalletClient();
  const callbackAddress = getCallbackAddress();

  console.log(`[chain] Creating protection config on ${callbackAddress}...`);
  console.log(`[chain]   protectedUser=${params.protectedUser}`);
  console.log(`[chain]   type=${params.protectionType} threshold=${params.healthFactorThreshold}`);

  const txHash = await walletClient.writeContract({
    address: callbackAddress,
    abi: AAVE_PROTECTION_CALLBACK_ABI,
    functionName: "createProtectionConfig",
    args: [
      params.protectedUser,
      params.protectionType,
      params.healthFactorThreshold,
      params.targetHealthFactor,
      params.collateralAsset,
      params.debtAsset,
      params.preferDebtRepayment,
      params.duration,
    ],
  });

  console.log(`[chain] Tx submitted: ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[chain] Tx confirmed in block ${receipt.blockNumber}`);

  // Find the ProtectionConfigured log by matching topic[0]
  const configuredLog = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === callbackAddress.toLowerCase() &&
      log.topics[0] === PROTECTION_CONFIGURED_SELECTOR
  );

  if (!configuredLog || !configuredLog.topics[1]) {
    throw new Error(
      `ProtectionConfigured event not found in tx ${txHash}. ` +
        `This likely means the CC ABI doesn't match the deployed contract. ` +
        `Logs found: ${receipt.logs.length}`
    );
  }

  // topic[1] = indexed configId (uint256)
  const configId = BigInt(configuredLog.topics[1]);
  console.log(`[chain] Protection config #${configId} created`);

  return { configId, txHash };
}

// ── Config management ─────────────────────────────────────────────────────────

export async function pauseProtectionConfig(configId: bigint): Promise<Hash> {
  const walletClient = getWalletClient();
  const callbackAddress = getCallbackAddress();

  const txHash = await walletClient.writeContract({
    address: callbackAddress,
    abi: AAVE_PROTECTION_CALLBACK_ABI,
    functionName: "pauseProtectionConfig",
    args: [configId],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[chain] Config #${configId} paused (tx: ${txHash})`);
  return txHash;
}

export async function resumeProtectionConfig(configId: bigint): Promise<Hash> {
  const walletClient = getWalletClient();
  const callbackAddress = getCallbackAddress();

  const txHash = await walletClient.writeContract({
    address: callbackAddress,
    abi: AAVE_PROTECTION_CALLBACK_ABI,
    functionName: "resumeProtectionConfig",
    args: [configId],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[chain] Config #${configId} resumed (tx: ${txHash})`);
  return txHash;
}

export async function cancelProtectionConfig(configId: bigint): Promise<Hash> {
  const walletClient = getWalletClient();
  const callbackAddress = getCallbackAddress();

  const txHash = await walletClient.writeContract({
    address: callbackAddress,
    abi: AAVE_PROTECTION_CALLBACK_ABI,
    functionName: "cancelProtectionConfig",
    args: [configId],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[chain] Config #${configId} cancelled (tx: ${txHash})`);
  return txHash;
}

// ── Read helpers ──────────────────────────────────────────────────────────────

export interface ProtectionConfigData {
  id: bigint;
  protectedUser: string;
  protectionType: number;
  healthFactorThreshold: bigint;
  targetHealthFactor: bigint;
  collateralAsset: string;
  debtAsset: string;
  preferDebtRepayment: boolean;
  status: number;
  createdAt: bigint;
  expiresAt: bigint;
  lastExecutedAt: bigint;
  executionCount: number;
  consecutiveFailures: number;
  lastExecutionAttempt: bigint;
}

/**
 * Fetch a protection config from on-chain state.
 */
export async function getProtectionConfig(configId: bigint): Promise<ProtectionConfigData> {
  const result = await publicClient.readContract({
    address: getCallbackAddress(),
    abi: AAVE_PROTECTION_CALLBACK_ABI,
    functionName: "protectionConfigs",
    args: [configId],
  });

  const r = result as any;
  return {
    id: BigInt(r[0] ?? r.id),
    protectedUser: r[1] ?? r.protectedUser,
    protectionType: Number(r[2] ?? r.protectionType),
    healthFactorThreshold: BigInt(r[3] ?? r.healthFactorThreshold),
    targetHealthFactor: BigInt(r[4] ?? r.targetHealthFactor),
    collateralAsset: r[5] ?? r.collateralAsset,
    debtAsset: r[6] ?? r.debtAsset,
    preferDebtRepayment: Boolean(r[7] ?? r.preferDebtRepayment),
    status: Number(r[8] ?? r.status),
    createdAt: BigInt(r[9] ?? r.createdAt),
    expiresAt: BigInt(r[10] ?? r.expiresAt ?? 0),
    lastExecutedAt: BigInt(r[11] ?? r.lastExecutedAt),
    executionCount: Number(r[12] ?? r.executionCount),
    consecutiveFailures: Number(r[13] ?? r.consecutiveFailures),
    lastExecutionAttempt: BigInt(r[14] ?? r.lastExecutionAttempt),
  };
}

/**
 * Get all active config IDs.
 */
export async function getActiveConfigs(): Promise<bigint[]> {
  const result = await publicClient.readContract({
    address: getCallbackAddress(),
    abi: AAVE_PROTECTION_CALLBACK_ABI,
    functionName: "getActiveConfigs",
  });
  return (result as any[]).map((id: any) => BigInt(id));
}

/**
 * Get current health factor for a user from the CC.
 */
export async function getHealthFactor(userAddress: Address): Promise<bigint> {
  const result = await publicClient.readContract({
    address: getCallbackAddress(),
    abi: AAVE_PROTECTION_CALLBACK_ABI,
    functionName: "getCurrentHealthFactor",
    args: [userAddress],
  });
  return BigInt(result as any);
}

/**
 * Check the REACT balance of the Reactive Contract on Lasna.
 * If RC is underfunded, callbacks won't fire.
 */
export async function getReactiveBalance(): Promise<bigint> {
  const rcAddress = getReactiveAddress();
  return lasnaClient.getBalance({ address: rcAddress });
}

/** Minimum REACT balance (0.01 REACT) below which we refuse new registrations. */
export const MIN_RC_BALANCE = 10_000_000_000_000_000n; // 0.01 ether

// ── DCA Strategy helpers ─────────────────────────────────────────────────────

const DCA_CONFIG_CREATED_SELECTOR = keccak256(
  toHex("DCAConfigCreated(uint256,address,address,uint256,uint24,uint256)")
);

function getDCACallbackAddress(): Address {
  const addr = CONTRACTS.dcaStrategyCallback;
  if (!addr || (addr as string) === "") {
    throw new Error("DCA_STRATEGY_CALLBACK_ADDRESS not set in .env");
  }
  return addr;
}

function getDCAReactiveAddress(): Address {
  const addr = CONTRACTS.dcaStrategyReactive;
  if (!addr || (addr as string) === "") {
    throw new Error("DCA_STRATEGY_REACTIVE_ADDRESS not set in .env");
  }
  return addr;
}

export interface CreateDCAParams {
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
 * Create a DCA config on DCAStrategyCallback.
 *
 * Called by the server after x402 payment is confirmed.
 * The CC's createDCAConfig() is owner-only — the server wallet must be the CC owner.
 *
 * Returns the config ID parsed from the DCAConfigCreated event.
 */
export async function createDCAConfig(
  params: CreateDCAParams
): Promise<{ configId: bigint; txHash: Hash }> {
  const walletClient = getWalletClient();
  const callbackAddress = getDCACallbackAddress();

  console.log(`[chain] Creating DCA config on ${callbackAddress}...`);
  console.log(`[chain]   user=${params.user} tokenIn=${params.tokenIn} tokenOut=${params.tokenOut}`);
  console.log(`[chain]   amountPerSwap=${params.amountPerSwap} totalSwaps=${params.totalSwaps}`);

  const txHash = await walletClient.writeContract({
    address: callbackAddress,
    abi: DCA_STRATEGY_CALLBACK_ABI,
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

  console.log(`[chain] DCA tx submitted: ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[chain] DCA tx confirmed in block ${receipt.blockNumber}`);

  const configuredLog = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === callbackAddress.toLowerCase() &&
      log.topics[0] === DCA_CONFIG_CREATED_SELECTOR
  );

  if (!configuredLog || !configuredLog.topics[1]) {
    throw new Error(
      `DCAConfigCreated event not found in tx ${txHash}. ` +
        `Logs found: ${receipt.logs.length}`
    );
  }

  const configId = BigInt(configuredLog.topics[1]);
  console.log(`[chain] DCA config #${configId} created`);

  return { configId, txHash };
}

export interface DCAConfigData {
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

export async function getDCAConfig(configId: bigint): Promise<DCAConfigData> {
  const result = await publicClient.readContract({
    address: getDCACallbackAddress(),
    abi: DCA_STRATEGY_CALLBACK_ABI,
    functionName: "dcaConfigs",
    args: [configId],
  });

  const r = result as any;
  return {
    id: BigInt(r[0] ?? r.id),
    user: r[1] ?? r.user,
    tokenIn: r[2] ?? r.tokenIn,
    tokenOut: r[3] ?? r.tokenOut,
    amountPerSwap: BigInt(r[4] ?? r.amountPerSwap),
    poolFee: Number(r[5] ?? r.poolFee),
    totalSwaps: BigInt(r[6] ?? r.totalSwaps),
    swapsExecuted: BigInt(r[7] ?? r.swapsExecuted),
    totalAmountOut: BigInt(r[8] ?? r.totalAmountOut),
    swapInterval: BigInt(r[9] ?? r.swapInterval),
    minAmountOut: BigInt(r[10] ?? r.minAmountOut),
    status: Number(r[11] ?? r.status),
    createdAt: BigInt(r[12] ?? r.createdAt),
    expiresAt: BigInt(r[13] ?? r.expiresAt ?? 0),
    lastSwapAt: BigInt(r[14] ?? r.lastSwapAt),
    consecutiveFailures: Number(r[15] ?? r.consecutiveFailures),
    lastAttemptAt: BigInt(r[16] ?? r.lastAttemptAt),
  };
}

export async function getActiveDCAConfigs(): Promise<bigint[]> {
  const result = await publicClient.readContract({
    address: getDCACallbackAddress(),
    abi: DCA_STRATEGY_CALLBACK_ABI,
    functionName: "getActiveConfigs",
  });
  return (result as any[]).map((id: any) => BigInt(id));
}

export async function getUserDCAConfigs(userAddress: Address): Promise<bigint[]> {
  const result = await publicClient.readContract({
    address: getDCACallbackAddress(),
    abi: DCA_STRATEGY_CALLBACK_ABI,
    functionName: "getUserConfigs",
    args: [userAddress],
  });
  return (result as any[]).map((id: any) => BigInt(id));
}

export async function pauseDCAConfig(configId: bigint): Promise<Hash> {
  const walletClient = getWalletClient();
  const txHash = await walletClient.writeContract({
    address: getDCACallbackAddress(),
    abi: DCA_STRATEGY_CALLBACK_ABI,
    functionName: "pauseDCAConfig",
    args: [configId],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[chain] DCA config #${configId} paused (tx: ${txHash})`);
  return txHash;
}

export async function resumeDCAConfig(configId: bigint): Promise<Hash> {
  const walletClient = getWalletClient();
  const txHash = await walletClient.writeContract({
    address: getDCACallbackAddress(),
    abi: DCA_STRATEGY_CALLBACK_ABI,
    functionName: "resumeDCAConfig",
    args: [configId],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[chain] DCA config #${configId} resumed (tx: ${txHash})`);
  return txHash;
}

export async function cancelDCAConfig(configId: bigint): Promise<Hash> {
  const walletClient = getWalletClient();
  const txHash = await walletClient.writeContract({
    address: getDCACallbackAddress(),
    abi: DCA_STRATEGY_CALLBACK_ABI,
    functionName: "cancelDCAConfig",
    args: [configId],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[chain] DCA config #${configId} cancelled (tx: ${txHash})`);
  return txHash;
}

/**
 * Check the REACT balance of the DCA Reactive Contract on Lasna.
 */
export async function getDCAReactiveBalance(): Promise<bigint> {
  const rcAddress = getDCAReactiveAddress();
  return lasnaClient.getBalance({ address: rcAddress });
}
