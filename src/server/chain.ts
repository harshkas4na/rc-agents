/**
 * chain.ts — viem clients and AaveHFCallback contract interactions.
 *
 * All on-chain writes use the server wallet (SERVER_PRIVATE_KEY).
 * The server wallet must be the `owner` of AaveHFCallback.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  toHex,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// ── ABI (only what the server calls) ──────────────────────────────────────────

const AAVE_HF_CALLBACK_ABI = parseAbi([
  "function register(address agent, address protectedUser, address collateralAsset, uint256 threshold, uint256 collateralAmount, uint256 duration) returns (uint256 id)",
  "function cancelSubscription(uint256 id)",
  "function getSubscription(uint256 id) view returns (tuple(address agent, address protectedUser, address collateralAsset, uint256 threshold, uint256 collateralAmount, uint256 expiresAt, bool active))",
  "function activeSubscriptionCount() view returns (uint256)",
  "function getActiveIds() view returns (uint256[])",
  "event SubscriptionRegistered(uint256 indexed id, address indexed agent, address indexed protectedUser, uint256 threshold, uint256 expiresAt)",
]);

// ── Event selector for log parsing ────────────────────────────────────────────

const SUBSCRIPTION_REGISTERED_SELECTOR = keccak256(
  toHex("SubscriptionRegistered(uint256,address,address,uint256,uint256)")
);

// ── Kopli chain definition (not in viem's built-in chains) ────────────────────

const kopliChain = {
  id: 5_318_008,
  name: "Kopli Testnet",
  nativeCurrency: { name: "REACT", symbol: "REACT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://kopli-rpc.rkt.ink"] },
  },
} as const;

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

const kopliClient = createPublicClient({
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
  const addr = process.env.AAVE_HF_CALLBACK_ADDRESS;
  if (!addr || addr === "0x0000000000000000000000000000000000000000") {
    throw new Error("AAVE_HF_CALLBACK_ADDRESS not set in .env");
  }
  return addr as Address;
}

function getReactiveAddress(): Address {
  const addr = process.env.AAVE_HF_REACTIVE_ADDRESS;
  if (!addr || addr === "0x0000000000000000000000000000000000000000") {
    throw new Error("AAVE_HF_REACTIVE_ADDRESS not set in .env");
  }
  return addr as Address;
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
 * Returns the subscription ID parsed from the SubscriptionRegistered event log.
 */
export async function registerSubscription(
  params: RegisterParams
): Promise<{ subscriptionId: bigint; txHash: Hash }> {
  const walletClient = getWalletClient();
  const callbackAddress = getCallbackAddress();

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

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  // Find the SubscriptionRegistered log by matching topic[0] (event selector)
  const registeredLog = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === callbackAddress.toLowerCase() &&
      log.topics[0] === SUBSCRIPTION_REGISTERED_SELECTOR
  );

  if (!registeredLog || !registeredLog.topics[1]) {
    throw new Error(
      `SubscriptionRegistered event not found in tx ${txHash}. ` +
        `Logs: ${JSON.stringify(receipt.logs.map((l) => l.topics[0]))}`
    );
  }

  const subscriptionId = BigInt(registeredLog.topics[1]);
  return { subscriptionId, txHash };
}

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

  // viem returns a tuple; cast to our typed interface
  const r = result as any;
  return {
    agent: r.agent ?? r[0],
    protectedUser: r.protectedUser ?? r[1],
    collateralAsset: r.collateralAsset ?? r[2],
    threshold: BigInt(r.threshold ?? r[3]),
    collateralAmount: BigInt(r.collateralAmount ?? r[4]),
    expiresAt: BigInt(r.expiresAt ?? r[5]),
    active: Boolean(r.active ?? r[6]),
  };
}

/**
 * Get count of active (not expired, not cancelled) subscriptions.
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
 * Returns balance in wei. If the RC is underfunded, callbacks won't fire.
 */
export async function getReactiveBalance(): Promise<bigint> {
  const rcAddress = getReactiveAddress();
  return kopliClient.getBalance({ address: rcAddress });
}

/** Minimum REACT balance (0.01 REACT) below which we refuse new registrations. */
export const MIN_RC_BALANCE = 10_000_000_000_000_000n; // 0.01 ether
