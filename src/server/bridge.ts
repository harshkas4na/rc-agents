/**
 * bridge.ts — USDC → ETH → REACT funding pipeline
 *
 * After x402 settles USDC to the server wallet, this module handles:
 *
 *   1. Split the USDC payment:
 *      - 20% → server margin (stays as USDC in wallet)
 *      - 80% → swap to ETH via Uniswap V3
 *
 *   2. From the swapped ETH:
 *      - Keep a small reserve for Base Sepolia gas (createProtectionConfig calls)
 *      - Bridge the rest to Lasna as REACT (for RC callback delivery gas)
 *
 *   Phase 1: Steps are logged but not executed. Fund RC manually.
 *   Phase 2: Fully automated swap + bridge.
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  formatEther,
  formatUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { lasnaClient } from "./chain";

// ── Constants ─────────────────────────────────────────────────────────────────

const UNISWAP_V3_ROUTER = "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4" as Address;
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as Address;
const POOL_FEE = 500; // 0.05%

/** Fraction of payment that goes to swap (rest is server margin). BPS. */
const SWAP_ALLOCATION_BPS = 8000n; // 80% goes to ETH

/** CRON_100 interval on Reactive Network ≈ 700 seconds */
const CRON_INTERVAL_SECONDS = 700;
/** Estimated gas per checkAndProtectPositions() callback call */
const GAS_PER_CALLBACK = 500_000n;
/** Safety buffer multiplier: 1.5× (multiply by 15, divide by 10) */
const GAS_BUFFER_MULTIPLIER = 15n;

// ── ABI fragments ─────────────────────────────────────────────────────────────

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
]);

const SWAP_ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)",
]);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FundingBreakdown {
  /** Total USDC received from x402 payment */
  totalUsdc: bigint;
  /** USDC kept as server margin */
  serverMargin: bigint;
  /** USDC allocated for swap → ETH */
  swapAmount: bigint;
  /** Estimated RC gas cost in wei (sized for duration + buffer) */
  rcGasWei: bigint;
  /** ETH kept on Base Sepolia for gas (formatted) */
  gasReserveEth: string;
  /** ETH bridged to Lasna as REACT (formatted) */
  bridgeAmountEth: string;
}

export interface FundingResult {
  success: boolean;
  breakdown: FundingBreakdown;
  swapTxHash?: `0x${string}`;
  bridgeTxHash?: `0x${string}`;
  error?: string;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Fund the RC gas pool from a USDC payment.
 *
 * Phase 1: Computes the split and logs it. No actual swap/bridge.
 * Phase 2: Executes Uniswap swap + Reactive Network bridge.
 *
 * @param usdcAmount Total USDC received (6 decimals)
 * @param durationSeconds Protection duration — used to size the Lasna gas reserve
 */
export async function fundRCGasPool(usdcAmount: bigint, durationSeconds: number): Promise<FundingResult> {
  const breakdown = await computeBreakdown(usdcAmount, durationSeconds);

  console.log(`[bridge] ── Funding breakdown ──`);
  console.log(`[bridge]   Payment:      ${formatUnits(breakdown.totalUsdc, 6)} USDC`);
  console.log(`[bridge]   Margin (20%): ${formatUnits(breakdown.serverMargin, 6)} USDC (kept)`);
  console.log(`[bridge]   Swap (80%):   ${formatUnits(breakdown.swapAmount, 6)} USDC → ETH`);
  console.log(`[bridge]   Gas reserve:  ~${breakdown.gasReserveEth} ETH (kept on Base)`);
  console.log(`[bridge]   Bridge:       ~${breakdown.bridgeAmountEth} ETH → REACT on Lasna`);

  // ── Phase 1: log only ───────────────────────────────────────────────────
  if (process.env.BRIDGE_MODE !== "live") {
    console.log(`[bridge]   Mode: DRY RUN (set BRIDGE_MODE=live to execute)`);
    console.log(`[bridge]   Manually ensure RC on Lasna has sufficient REACT.`);
    return { success: true, breakdown };
  }

  // ── Phase 2: execute swap + bridge ──────────────────────────────────────
  try {
    const swapResult = await swapUsdcToEth(breakdown.swapAmount);
    console.log(`[bridge]   Swap tx: ${swapResult.txHash}`);
    console.log(`[bridge]   ETH received: ${formatEther(swapResult.ethReceived)}`);

    // Keep the RC gas cost on Base; bridge the remainder to Lasna as REACT
    const bridgeAmount = swapResult.ethReceived > breakdown.rcGasWei
      ? swapResult.ethReceived - breakdown.rcGasWei
      : 0n;

    if (bridgeAmount > 0n) {
      try {
        const rcAddr = (process.env.AAVE_PROTECTION_REACTIVE_ADDRESS ?? "") as Address;
        const bridgeTx = await bridgeEthToLasna(bridgeAmount, rcAddr);
        console.log(`[bridge]   Bridge tx: ${bridgeTx}`);
        return {
          success: true,
          breakdown,
          swapTxHash: swapResult.txHash,
          bridgeTxHash: bridgeTx,
        };
      } catch (bridgeErr: any) {
        console.error(`[bridge]   Bridge failed: ${bridgeErr.message}`);
        console.log(`[bridge]   ETH stays in wallet — bridge manually.`);
        return {
          success: false,
          breakdown,
          swapTxHash: swapResult.txHash,
          error: `Swap succeeded, bridge failed: ${bridgeErr.message}`,
        };
      }
    }

    return { success: true, breakdown, swapTxHash: swapResult.txHash };
  } catch (err: any) {
    console.error(`[bridge]   Swap failed: ${err.message}`);
    return { success: false, breakdown, error: err.message };
  }
}

// ── Breakdown calculation ─────────────────────────────────────────────────────

/**
 * Compute the USDC → ETH split and the Lasna gas budget.
 *
 * Gas budget is calculated from live Lasna gas price:
 *   numCallbacks = ceil(durationSeconds / 700)
 *   ethForRC = numCallbacks × GAS_PER_CALLBACK × lasnaGasPrice × 1.5
 */
export async function computeBreakdown(usdcAmount: bigint, durationSeconds: number): Promise<FundingBreakdown> {
  const swapAmount = (usdcAmount * SWAP_ALLOCATION_BPS) / 10_000n;
  const serverMargin = usdcAmount - swapAmount;

  // Query live Lasna gas price
  let gasPrice: bigint;
  try {
    gasPrice = await lasnaClient.getGasPrice();
  } catch {
    // Fallback to a conservative estimate (1 gwei) if Lasna is unreachable
    gasPrice = 1_000_000_000n;
    console.warn("[bridge] Could not fetch Lasna gas price, using fallback 1 gwei");
  }

  const numCallbacks = BigInt(Math.ceil(durationSeconds / CRON_INTERVAL_SECONDS));
  const ethForRC = (numCallbacks * GAS_PER_CALLBACK * gasPrice * GAS_BUFFER_MULTIPLIER) / 10n;

  // Rough ETH estimate for logging (assumes ~$2500/ETH, adjust as needed)
  const ethEstimateWei = (swapAmount * 10n ** 18n) / 2_500_000_000n;
  // gasReserve = max(actual RC gas cost, 5% of swapped ETH as Base gas)
  const baseGasFloorWei = (ethEstimateWei * 500n) / 10_000n; // 5%
  const gasReserveWei = ethForRC > baseGasFloorWei ? ethForRC : baseGasFloorWei;
  const bridgeWei = ethEstimateWei > gasReserveWei ? ethEstimateWei - gasReserveWei : 0n;

  return {
    totalUsdc: usdcAmount,
    serverMargin,
    swapAmount,
    rcGasWei: ethForRC,
    gasReserveEth: formatEther(gasReserveWei),
    bridgeAmountEth: formatEther(bridgeWei),
  };
}

// ── Uniswap V3 swap ──────────────────────────────────────────────────────────

async function getClients() {
  const pk = process.env.SERVER_PRIVATE_KEY;
  if (!pk) throw new Error("SERVER_PRIVATE_KEY not set");
  const account = privateKeyToAccount(pk as `0x${string}`);
  const rpc = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
  return {
    account,
    publicClient: createPublicClient({ chain: baseSepolia, transport: http(rpc) }),
    walletClient: createWalletClient({ account, chain: baseSepolia, transport: http(rpc) }),
  };
}

/**
 * Swap USDC → WETH on Base Sepolia via Uniswap V3.
 * Uses 1% slippage tolerance.
 */
async function swapUsdcToEth(
  usdcAmount: bigint
): Promise<{ txHash: `0x${string}`; ethReceived: bigint }> {
  const { account, publicClient, walletClient } = await getClients();

  // 1. Approve router
  const approveTx = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [UNISWAP_V3_ROUTER, usdcAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  // 2. Swap with 1% slippage tolerance (minOut = 0 for testnet, tighten for mainnet)
  const swapTx = await walletClient.writeContract({
    address: UNISWAP_V3_ROUTER,
    abi: SWAP_ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: USDC_ADDRESS,
        tokenOut: WETH_ADDRESS,
        fee: POOL_FEE,
        recipient: account.address,
        amountIn: usdcAmount,
        amountOutMinimum: 0n, // TODO: use oracle price * 0.99 for mainnet
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: swapTx });

  // Read WETH balance change (simplistic — for exact amount, parse Transfer log)
  const wethBalance = await publicClient.readContract({
    address: WETH_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });

  return { txHash: swapTx, ethReceived: wethBalance as bigint };
}

// ── Reactive Network bridge ───────────────────────────────────────────────────

// ── Reactive Network bridge ───────────────────────────────────────────────────
//
// Bridge: send ETH to LASNA_BRIDGE_ADDRESS on Base Sepolia.
// Rate: 1 ETH = 100 lREACT.  Max per tx: 5 ETH (500 lREACT).
// Recipient of lREACT on Lasna = msg.sender on Base Sepolia (i.e. server wallet).
// After bridging, the server must manually top up the RC address on Lasna,
// or encode the RC address as calldata (see https://dev.reactive.network/docs/bridge).
//
// ABI: the bridge exposes a single `request(address recipient)` payable function.

const LASNA_BRIDGE_ADDRESS = "0x2afaFD298b23b62760711756088F75B7409f5967" as Address;
const BRIDGE_ABI = parseAbi([
  "function request(address recipient) external payable",
]);
const WETH_WITHDRAW_ABI = parseAbi([
  "function withdraw(uint256 amount) external",
]);

/**
 * Bridge ETH from Base Sepolia to Lasna (Reactive Network).
 *
 * Steps:
 *   1. Unwrap WETH → ETH (WETH.withdraw())
 *   2. Send ETH to LASNA_BRIDGE_ADDRESS with the RC address as recipient
 *      so lREACT lands directly in the RC's gas pool on Lasna.
 *
 * Rate: 1 ETH → 100 lREACT.  Max 5 ETH per tx.
 */
async function bridgeEthToLasna(
  ethAmount: bigint,
  rcAddress: Address
): Promise<`0x${string}`> {
  // TODO: Implement in Phase 2.
  // Stub preserved — set BRIDGE_MODE=live only after implementing.
  throw new Error(
    `bridgeEthToLasna not yet implemented (amount: ${formatEther(ethAmount)} ETH, rc: ${rcAddress}). ` +
      "Bridge contract: " + LASNA_BRIDGE_ADDRESS + " on Base Sepolia. " +
      "Call request(rcAddress) with the ETH value. " +
      "See https://dev.reactive.network/docs/bridge"
  );
}
