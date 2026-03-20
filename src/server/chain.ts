/**
 * chain.ts — viem clients and contract interactions.
 *
 * All on-chain writes use the server wallet (SERVER_PRIVATE_KEY).
 * The server wallet must be the `owner` of AaveHFCallback.
 *
 * Flow:
 *   1. Agent pays via x402 → server receives USDC
 *   2. Server calls registerSubscription() → writes to CC on Base Sepolia
 *   3. CC emits SubscriptionRegistered → RC picks it up on Kopli
 *   4. RC fires runCycle() callbacks via CRON → CC checks HF + acts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  decodeEventLog,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { AAVE_HF_CALLBACK_ABI } from "../abis/aave-hf-callback.js";
import { CONTRACTS } from "../config/contracts.js";

// ── Kopli chain definition (not in viem's built-in chains) ────────────────────

export const kopliChain = {
  id: 5_318_008,
  name: "Kopli Testnet",
  nativeCurrency: { name: "REACT", symbol: "REACT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://kopli-rpc.rkt.ink"] },
  },
} as const;

// ── Event selector for log parsing ────────────────────────────────────────────

const SUBSCRIPTION_REGISTERED_SELECTOR = keccak256(
  toHex("SubscriptionRegistered(uint256,address,address,uint256,uint256)")
);

// ── Client setup ──────────────────────────────────────────────────────────────

function getAccount() {
  const pk = process.env.SERVER_PRIVATE_KEY;
  if (!pk) throw new Error("SERVER_PRIVATE_KEY not set");
  return privateKeyToAccount(pk as `0x${string}`);
}

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"),
});

export const kopliClient = createPublicClient({
  chain: kopliChain,
  transport: http(process.env.KOPLI_RPC_URL ?? "https://kopli-rpc.rkt.ink"),
});

export function getWalletClient() {
  return createWalletClient({
    account: getAccount(),
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"),
  });
}

function getCallbackAddress(): Address {
  const addr = CONTRACTS.aaveHFCallback;
  if (!addr || (addr as string) === "") {
    throw new Error("AAVE_HF_CALLBACK_ADDRESS not set in .env");
  }
  return addr;
}

function getReactiveAddress(): Address {
  const addr = CONTRACTS.aaveHFReactive;
  if (!addr || (addr as string) === "") {
    throw new Error("AAVE_HF_REACTIVE_ADDRESS not set in .env");
  }
  return addr;
}

// ── Contract helpers ──────────────────────────────────────────────────────────

export interface RegisterParams {
  agent: Address;
  protectedUser: Address;
  collateralAsset: Address;
  /** HF threshold in WAD (1.5 HF → 1_500_000_000_000_000_000n) */
  threshold: bigint;
  /** Collateral amount in token base units */
  collateralAmount: bigint;
  /** Duration in seconds */
  duration: bigint;
}

/**
 * Register an HF guard subscription on AaveHFCallback.
 *
 * Called by the server after x402 payment is confirmed.
 * The CC's register() is owner-only — the server wallet must be the CC owner.
 *
 * Returns the subscription ID parsed from the SubscriptionRegistered event.
 */
export async function registerSubscription(
  params: RegisterParams
): Promise<{ subscriptionId: bigint; txHash: Hash }> {
  const walletClient = getWalletClient();
  const callbackAddress = getCallbackAddress();

  console.log(`[chain] Registering subscription on ${callbackAddress}...`);
  console.log(`[chain]   agent=${params.agent} user=${params.protectedUser}`);
  console.log(`[chain]   threshold=${params.threshold} duration=${params.duration}s`);

  const txHash = await walletClient.writeContract({
    address: callbackAddress,
    abi: AAVE_HF_CALLBACK_ABI,
    functionName: "register",
    args: [
      params.agent,
      params.protectedUser,
      params.collateralAsset,
      params.threshold,
      params.collateralAmount,
      params.duration,
    ],
  });

  console.log(`[chain] Tx submitted: ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[chain] Tx confirmed in block ${receipt.blockNumber}`);

  // Find the SubscriptionRegistered log by matching topic[0]
  const registeredLog = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === callbackAddress.toLowerCase() &&
      log.topics[0] === SUBSCRIPTION_REGISTERED_SELECTOR
  );

  if (!registeredLog || !registeredLog.topics[1]) {
    throw new Error(
      `SubscriptionRegistered event not found in tx ${txHash}. ` +
        `This likely means the CC ABI doesn't match the deployed contract. ` +
        `Logs found: ${receipt.logs.length}`
    );
  }

  // topic[1] = indexed id (uint256)
  const subscriptionId = BigInt(registeredLog.topics[1]);
  console.log(`[chain] Subscription #${subscriptionId} registered`);

  return { subscriptionId, txHash };
}

// ── Read helpers ──────────────────────────────────────────────────────────────

export interface SubscriptionData {
  agent: string;
  protectedUser: string;
  collateralAsset: string;
  threshold: bigint;
  collateralAmount: bigint;
  expiresAt: bigint;
  active: boolean;
}

/**
 * Fetch a subscription from on-chain state.
 */
export async function getSubscription(subscriptionId: bigint): Promise<SubscriptionData> {
  const result = await publicClient.readContract({
    address: getCallbackAddress(),
    abi: AAVE_HF_CALLBACK_ABI,
    functionName: "getSubscription",
    args: [subscriptionId],
  });

  // viem returns a tuple for multi-return functions
  const r = result as any;
  return {
    agent: r[0] ?? r.agent,
    protectedUser: r[1] ?? r.protectedUser,
    collateralAsset: r[2] ?? r.collateralAsset,
    threshold: BigInt(r[3] ?? r.threshold),
    collateralAmount: BigInt(r[4] ?? r.collateralAmount),
    expiresAt: BigInt(r[5] ?? r.expiresAt),
    active: Boolean(r[6] ?? r.active),
  };
}

/**
 * Get count of active subscriptions.
 */
export async function getActiveCount(): Promise<bigint> {
  const result = await publicClient.readContract({
    address: getCallbackAddress(),
    abi: AAVE_HF_CALLBACK_ABI,
    functionName: "activeSubscriptionCount",
  });
  return BigInt(result as any);
}

/**
 * Check the REACT balance of the Reactive Contract on Kopli.
 * If RC is underfunded, callbacks won't fire.
 */
export async function getReactiveBalance(): Promise<bigint> {
  const rcAddress = getReactiveAddress();
  return kopliClient.getBalance({ address: rcAddress });
}

/** Minimum REACT balance (0.01 REACT) below which we refuse new registrations. */
export const MIN_RC_BALANCE = 10_000_000_000_000_000n; // 0.01 ether
