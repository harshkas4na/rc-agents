"use strict";
// ── Service Catalog ───────────────────────────────────────────────────────────
// One entry per deployed service. Each maps to its own specialized contract pair.
// Prices are in USDC base units (6 decimals). $0.25 = 250_000.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMO_USDC_GOAT_TESTNET3 = exports.WGBTC_GOAT_TESTNET3 = exports.AAVE_POOL_BASE_SEPOLIA = exports.WETH_BASE_SEPOLIA = exports.USDC_BASE_SEPOLIA = exports.CHAIN = exports.SERVICES = void 0;
exports.computePrice = computePrice;
exports.formatUsdc = formatUsdc;
exports.SERVICES = {
    "aave-protection": {
        id: "aave-protection",
        name: "Aave Liquidation Protection",
        description: "Advanced Aave liquidation protection with collateral deposit, debt repayment, " +
            "or both. Monitors health factor and automatically acts when it drops below " +
            "your chosen threshold. Supports multi-config management (create/pause/resume/cancel).",
        trigger: "Aave Health Factor < threshold",
        action: "Supply collateral, repay debt, or both on your behalf",
        pricePerDay: 250_000, // $0.25 / day
        minDuration: 3_600, // 1 hour
        maxDuration: 2_592_000, // 30 days
        callbackAddressEnv: "AAVE_PROTECTION_CALLBACK_ADDRESS",
        reactiveAddressEnv: "AAVE_PROTECTION_REACTIVE_ADDRESS",
    },
    "dca-strategy": {
        id: "dca-strategy",
        name: "DCA Strategy (Uniswap V3)",
        description: "Automated Dollar Cost Averaging on Uniswap V3. Configure periodic token swaps " +
            "(e.g., USDC → WETH every 12 minutes) that execute autonomously via the Reactive Network. " +
            "Supports custom swap intervals, slippage protection, and fixed or unlimited swap counts. " +
            "Agent creates configs directly on-chain — payment covers RC gas for automation.",
        trigger: "CRON tick (~12 min) + swap interval elapsed",
        action: "Swap tokenIn → tokenOut via Uniswap V3 on behalf of user",
        pricePerDay: 200_000, // $0.20 / day
        minDuration: 3_600, // 1 hour
        maxDuration: 2_592_000, // 30 days
        callbackAddressEnv: "DCA_STRATEGY_CALLBACK_ADDRESS",
        reactiveAddressEnv: "DCA_STRATEGY_REACTIVE_ADDRESS",
    },
    "dca-strategy-goat": {
        id: "dca-strategy-goat",
        name: "DCA Strategy (GOAT Testnet3)",
        description: "Automated Dollar Cost Averaging on GOAT Network Testnet3, against a real, live " +
            "Uniswap V3 Core pool (dUSDC/WGBTC). No Reactive Network involved — the execution " +
            "function is genuinely permissionless (anyone can call it, not just this server), " +
            "since Reactive Network does not support GOAT as a destination chain. Payment is " +
            "still x402 USDC on Base Sepolia; execution happens on GOAT.",
        trigger: "Server-run scheduler polls every 60s + swap interval elapsed (permissionless — anyone could poll instead)",
        action: "Swap dUSDC → WGBTC via a real Uniswap V3 Core pool on GOAT Testnet3",
        pricePerDay: 200_000, // $0.20 / day
        minDuration: 3_600, // 1 hour
        maxDuration: 2_592_000, // 30 days
        callbackAddressEnv: "", // GOAT_TESTNET3_CONTRACTS.dcaStrategyCallbackGoat — not env-sourced, see src/config/contracts.ts
        reactiveAddressEnv: "", // none — no Reactive Network on GOAT
    },
};
// ── Pricing ────────────────────────────────────────────────────────────────────
/** 20% buffer on top of base price to cover gas cost volatility. */
const GAS_BUFFER_BPS = 2000n; // 20% in basis points
/**
 * Compute total USDC price (base units) for a subscription.
 * Uses integer math only — no floating point.
 *
 *   price = (pricePerDay × durationSeconds × 12000) / (86400 × 10000)
 *         = base price + 20% gas buffer
 *
 * Multiply before divide to preserve precision on sub-day durations.
 */
function computePrice(serviceId, durationSeconds) {
    const svc = exports.SERVICES[serviceId];
    if (!svc)
        throw new Error(`Unknown service: ${serviceId}`);
    const pricePerDay = BigInt(svc.pricePerDay);
    const duration = BigInt(durationSeconds);
    const withBuffer = 10000n + GAS_BUFFER_BPS; // 12000
    // (pricePerDay * duration * 12000) / (86400 * 10000)
    const numerator = pricePerDay * duration * withBuffer;
    const denominator = 86400n * 10000n;
    const price = numerator / denominator;
    // Minimum charge of 1 base unit ($0.000001)
    return price > 0n ? price : 1n;
}
/** Format USDC base units as "$X.XX" */
function formatUsdc(baseUnits) {
    const dollars = Number(baseUnits) / 1_000_000;
    return `$${dollars.toFixed(6).replace(/\.?0+$/, "")}`;
}
// ── Chain constants ────────────────────────────────────────────────────────────
exports.CHAIN = {
    BASE_SEPOLIA: { id: 84532, caip2: "eip155:84532" },
    LASNA: { id: 5318007, caip2: "eip155:5318007" },
    GOAT_TESTNET3: { id: 48816, caip2: "eip155:48816" },
};
exports.USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
exports.WETH_BASE_SEPOLIA = "0x4200000000000000000000000000000000000006";
exports.AAVE_POOL_BASE_SEPOLIA = "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27";
/** GOAT Testnet3's canonical wrapped-native predeploy (WGBTC). Same address as mainnet. */
exports.WGBTC_GOAT_TESTNET3 = "0xbC10000000000000000000000000000000000000";
/** Testnet-only demo USDC stand-in — see src/contracts/goat/DemoUSDC.sol. */
exports.DEMO_USDC_GOAT_TESTNET3 = "0xF35b99BaE312FD59145F5eBE4482fD433d1C7E20";
//# sourceMappingURL=services.js.map