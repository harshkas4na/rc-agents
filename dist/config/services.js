"use strict";
// ── Service Catalog ───────────────────────────────────────────────────────────
// One entry per deployed service. Each maps to its own specialized contract pair.
// Prices are in USDC base units (6 decimals). $0.25 = 250_000.
Object.defineProperty(exports, "__esModule", { value: true });
exports.AAVE_POOL_BASE_SEPOLIA = exports.WETH_BASE_SEPOLIA = exports.USDC_BASE_SEPOLIA = exports.CHAIN = exports.SERVICES = void 0;
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
    // Future services get their own contract pairs and entries here:
    // "stop-loss": { ... callbackAddressEnv: "STOP_LOSS_CALLBACK_ADDRESS", ... },
    // "take-profit": { ... callbackAddressEnv: "TAKE_PROFIT_CALLBACK_ADDRESS", ... },
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
};
exports.USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
exports.WETH_BASE_SEPOLIA = "0x4200000000000000000000000000000000000006";
exports.AAVE_POOL_BASE_SEPOLIA = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
//# sourceMappingURL=services.js.map