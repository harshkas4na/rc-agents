// ── Service Catalog ───────────────────────────────────────────────────────────
// One entry per deployed service. Each maps to its own specialized contract pair.
// Prices are in USDC base units (6 decimals). $0.10 = 100_000.

export interface ServiceDefinition {
  id: string;
  name: string;
  description: string;
  trigger: string;
  action: string;
  /** USDC price per day (base units, 6 decimals) */
  pricePerDay: number;
  /** Minimum duration in seconds */
  minDuration: number;
  /** Maximum duration in seconds */
  maxDuration: number;
  /** Env var name for the callback contract address */
  callbackAddressEnv: string;
  /** Env var name for the reactive contract address */
  reactiveAddressEnv: string;
}

export const SERVICES: Record<string, ServiceDefinition> = {
  "hf-guard": {
    id: "hf-guard",
    name: "Aave Liquidation Guard",
    description:
      "Monitors your Aave health factor and automatically supplies collateral " +
      "when it drops below your chosen threshold. Prevents liquidation.",
    trigger: "Aave Health Factor < threshold",
    action: "Supply collateral to Aave on your behalf",
    pricePerDay: 100_000, // $0.10 / day
    minDuration: 3_600,   // 1 hour
    maxDuration: 2_592_000, // 30 days
    callbackAddressEnv: "AAVE_HF_CALLBACK_ADDRESS",
    reactiveAddressEnv: "AAVE_HF_REACTIVE_ADDRESS",
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
export function computePrice(serviceId: string, durationSeconds: number): bigint {
  const svc = SERVICES[serviceId];
  if (!svc) throw new Error(`Unknown service: ${serviceId}`);

  const pricePerDay = BigInt(svc.pricePerDay);
  const duration = BigInt(durationSeconds);
  const withBuffer = 10_000n + GAS_BUFFER_BPS; // 12000

  // (pricePerDay * duration * 12000) / (86400 * 10000)
  const numerator = pricePerDay * duration * withBuffer;
  const denominator = 86_400n * 10_000n;
  const price = numerator / denominator;

  // Minimum charge of 1 base unit ($0.000001)
  return price > 0n ? price : 1n;
}

/** Format USDC base units as "$X.XX" */
export function formatUsdc(baseUnits: bigint): string {
  const dollars = Number(baseUnits) / 1_000_000;
  return `$${dollars.toFixed(6).replace(/\.?0+$/, "")}`;
}

// ── Chain constants ────────────────────────────────────────────────────────────

export const CHAIN = {
  BASE_SEPOLIA: { id: 84532, caip2: "eip155:84532" },
  KOPLI: { id: 5318008, caip2: "eip155:5318008" },
} as const;

export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const WETH_BASE_SEPOLIA = "0x4200000000000000000000000000000000000006" as const;
export const AAVE_POOL_BASE_SEPOLIA = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951" as const;
