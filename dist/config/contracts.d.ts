/**
 * Deployed contract addresses and Reactive Network constants.
 *
 * CC must inherit AbstractCallback, use authorizedSenderOnly,
 * and have `address` as first param on all callback-target functions.
 *
 * RC must inherit AbstractPausableReactive, use react(LogRecord),
 * emit Callback(), and use self-callbacks for state persistence.
 */
import type { Address } from "viem";
export declare const CONTRACTS: {
    /** AaveProtectionCallback on Base Sepolia */
    readonly aaveProtectionCallback: Address;
    /** AaveProtectionReactive on Reactive Network */
    readonly aaveProtectionReactive: Address;
};
export declare const AAVE_ADDRESSES: {
    readonly LENDING_POOL: Address;
    readonly PROTOCOL_DATA_PROVIDER: Address;
    readonly ADDRESSES_PROVIDER: Address;
};
export declare const CALLBACK_PROXIES: {
    readonly baseSepolia: Address;
    readonly sepolia: Address;
    readonly base: Address;
    readonly ethereum: Address;
    readonly arbitrum: Address;
};
/** System contract on RN (used for subscriptions + cron) */
export declare const SERVICE_ADDR: Address;
/** Self-callback proxy on RN (for RC → RC state persistence callbacks) */
export declare const RN_CALLBACK_PROXY: Address;
export declare const CRON_TOPICS: {
    /** Every block (~7 seconds) */
    readonly CRON_1: "0xf02d6ea5c22a71cffe930a4523fcb4f129be6c804db50e4202fb4e0b07ccb514";
    /** Every 10 blocks (~1 minute) */
    readonly CRON_10: "0x04463f7c1651e6b9774d7f85c85bb94654e3c46ca79b0c16fb16d4183307b687";
    /** Every 100 blocks (~12 minutes) — default for HF guard */
    readonly CRON_100: "0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70";
    /** Every 1000 blocks (~2 hours) */
    readonly CRON_1000: "0xe20b31294d84c3661ddc8f423abb9c70310d0cf172aa2714ead78029b325e3f4";
    /** Every 10000 blocks (~28 hours) */
    readonly CRON_10000: "0xd214e1d84db704ed42d37f538ea9bf71e44ba28bc1cc088b2f5deca654677a56";
};
export declare const CHAIN_IDS: {
    readonly LASNA: 5318007;
    readonly SEPOLIA: 11155111;
    readonly BASE_SEPOLIA: 84532;
    readonly REACTIVE: 1597;
    readonly ETHEREUM: 1;
    readonly BASE: 8453;
};
export declare const FAUCETS: {
    readonly sepolia: Address;
    readonly baseSepolia: Address;
};
//# sourceMappingURL=contracts.d.ts.map