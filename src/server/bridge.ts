/**
 * bridge.ts — USDC → ETH → Reactive Network gas funding
 *
 * Phase 1: Manual funding — functions here are stubs that log what WOULD happen.
 *          The RC on Kopli is funded manually by the operator.
 *
 * Phase 2: Automate USDC → ETH swap via Uniswap V3 on Base Sepolia, then bridge
 *          ETH to Kopli via the Reactive Network official bridge.
 *
 * Architecture:
 *   USDC (Base Sepolia)
 *     → swap via Uniswap V3 → ETH (Base Sepolia)
 *     → bridge via Reactive Network bridge → REACT/ETH (Kopli)
 *     → funds ServiceReactive contract gas pool
 */

import { createWalletClient, createPublicClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// Uniswap V3 SwapRouter02 on Base Sepolia
const UNISWAP_V3_ROUTER = "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4";

// USDC on Base Sepolia
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// WETH on Base Sepolia
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

// Uniswap V3 USDC/ETH pool fee tier (0.05%)
const POOL_FEE = 500;

export interface BridgeResult {
  success: boolean;
  swapTxHash?: `0x${string}`;
  bridgeTxHash?: `0x${string}`;
  ethAmount?: string;
  error?: string;
}

/**
 * Phase 1 stub: Log the required funding without executing.
 * Replace with actual implementation in Phase 2.
 */
export async function fundRCGasPool(usdcAmount: bigint): Promise<BridgeResult> {
  console.log(
    `[bridge] PHASE 1 STUB: Would swap ${usdcAmount} USDC → ETH → bridge to Kopli for RC gas.`
  );
  console.log(
    `[bridge] Manually ensure ServiceReactive on Kopli has sufficient REACT/ETH balance.`
  );
  return { success: true };
}

/**
 * Phase 2: Swap USDC → ETH on Base Sepolia via Uniswap V3.
 * Requires SERVER_PRIVATE_KEY in env with sufficient USDC balance.
 *
 * @param usdcAmount  Amount to swap (6 decimals)
 * @param minEthOut   Minimum ETH to receive (slippage protection, 18 decimals)
 */
export async function swapUsdcToEth(
  usdcAmount: bigint,
  minEthOut: bigint
): Promise<{ txHash: `0x${string}`; ethReceived: bigint }> {
  const privateKey = process.env.SERVER_PRIVATE_KEY;
  if (!privateKey) throw new Error("SERVER_PRIVATE_KEY not set");

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http() });

  // ABI fragments
  const erc20ApproveAbi = [
    {
      name: "approve",
      type: "function",
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    },
  ] as const;

  const swapRouterAbi = [
    {
      name: "exactInputSingle",
      type: "function",
      inputs: [
        {
          name: "params",
          type: "tuple",
          components: [
            { name: "tokenIn", type: "address" },
            { name: "tokenOut", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "recipient", type: "address" },
            { name: "amountIn", type: "uint256" },
            { name: "amountOutMinimum", type: "uint256" },
            { name: "sqrtPriceLimitX96", type: "uint160" },
          ],
        },
      ],
      outputs: [{ name: "amountOut", type: "uint256" }],
    },
  ] as const;

  // 1. Approve Uniswap router to spend USDC
  const approveTx = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [UNISWAP_V3_ROUTER, usdcAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  // 2. Swap USDC → WETH
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 min
  const swapTx = await walletClient.writeContract({
    address: UNISWAP_V3_ROUTER,
    abi: swapRouterAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: USDC_ADDRESS,
        tokenOut: WETH_ADDRESS,
        fee: POOL_FEE,
        recipient: account.address,
        amountIn: usdcAmount,
        amountOutMinimum: minEthOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: swapTx });
  console.log(`[bridge] Swap complete: ${swapTx}`);

  // TODO Phase 2: Unwrap WETH → ETH, then bridge to Kopli
  return { txHash: swapTx, ethReceived: minEthOut };
}

/**
 * Phase 2: Bridge ETH from Base Sepolia to Kopli (Reactive Network).
 * Uses the official Reactive Network bridge contract.
 *
 * TODO: Fill in the actual bridge contract address and ABI from
 *       https://dev.reactive.network/docs/bridge
 */
export async function bridgeEthToKopli(
  ethAmount: bigint,
  recipient: `0x${string}`
): Promise<`0x${string}`> {
  throw new Error(
    "Phase 2 not implemented: bridgeEthToKopli. " +
      "Bridge ETH manually to Kopli until Phase 2. " +
      "See https://dev.reactive.network/docs/bridge"
  );
}
