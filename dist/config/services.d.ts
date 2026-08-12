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
export declare const SERVICES: Record<string, ServiceDefinition>;
/**
 * Compute total USDC price (base units) for a subscription.
 * Uses integer math only — no floating point.
 *
 *   price = (pricePerDay × durationSeconds × 12000) / (86400 × 10000)
 *         = base price + 20% gas buffer
 *
 * Multiply before divide to preserve precision on sub-day durations.
 */
export declare function computePrice(serviceId: string, durationSeconds: number): bigint;
/** Format USDC base units as "$X.XX" */
export declare function formatUsdc(baseUnits: bigint): string;
export declare const CHAIN: {
    readonly BASE_SEPOLIA: {
        readonly id: 84532;
        readonly caip2: "eip155:84532";
    };
    readonly LASNA: {
        readonly id: 5318007;
        readonly caip2: "eip155:5318007";
    };
    readonly GOAT_TESTNET3: {
        readonly id: 48816;
        readonly caip2: "eip155:48816";
    };
};
export declare const USDC_BASE_SEPOLIA: "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export declare const WETH_BASE_SEPOLIA: "0x4200000000000000000000000000000000000006";
export declare const AAVE_POOL_BASE_SEPOLIA: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27";
/** GOAT Testnet3's canonical wrapped-native predeploy (WGBTC). Same address as mainnet. */
export declare const WGBTC_GOAT_TESTNET3: "0xbC10000000000000000000000000000000000000";
/** Testnet-only demo USDC stand-in — see src/contracts/goat/DemoUSDC.sol. */
export declare const DEMO_USDC_GOAT_TESTNET3: "0xF35b99BaE312FD59145F5eBE4482fD433d1C7E20";
//# sourceMappingURL=services.d.ts.map