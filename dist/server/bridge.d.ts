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
/**
 * Fund the RC gas pool from a USDC payment.
 *
 * Phase 1: Computes the split and logs it. No actual swap/bridge.
 * Phase 2: Executes Uniswap swap + Reactive Network bridge.
 *
 * @param usdcAmount Total USDC received (6 decimals)
 * @param durationSeconds Protection duration — used to size the Lasna gas reserve
 */
export declare function fundRCGasPool(usdcAmount: bigint, durationSeconds: number): Promise<FundingResult>;
/**
 * Compute the USDC → ETH split and the Lasna gas budget.
 *
 * Gas budget is calculated from live Lasna gas price:
 *   numCallbacks = ceil(durationSeconds / 700)
 *   ethForRC = numCallbacks × GAS_PER_CALLBACK × lasnaGasPrice × 1.5
 */
export declare function computeBreakdown(usdcAmount: bigint, durationSeconds: number): Promise<FundingBreakdown>;
//# sourceMappingURL=bridge.d.ts.map