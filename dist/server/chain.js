"use strict";
/**
 * chain.ts — viem clients and contract interactions.
 *
 * All on-chain writes use the server wallet (SERVER_PRIVATE_KEY).
 * The server wallet must be the `owner` of AaveProtectionCallback.
 *
 * Flow:
 *   1. Agent pays via x402 → server receives USDC
 *   2. Server calls createProtectionConfig() → writes to CC on Base Sepolia
 *   3. CC emits ProtectionConfigured → RC picks it up on Lasna (Reactive Network)
 *   4. RC fires checkAndProtectPositions() callbacks via CRON → CC checks HF + acts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_RC_BALANCE = exports.lasnaClient = exports.publicClient = exports.lasnaChain = void 0;
exports.getWalletClient = getWalletClient;
exports.createProtectionConfig = createProtectionConfig;
exports.pauseProtectionConfig = pauseProtectionConfig;
exports.resumeProtectionConfig = resumeProtectionConfig;
exports.cancelProtectionConfig = cancelProtectionConfig;
exports.getProtectionConfig = getProtectionConfig;
exports.getActiveConfigs = getActiveConfigs;
exports.getHealthFactor = getHealthFactor;
exports.getReactiveBalance = getReactiveBalance;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const aave_protection_callback_1 = require("../abis/aave-protection-callback");
const contracts_1 = require("../config/contracts");
// ── Lasna chain definition (Reactive Network testnet, not in viem built-ins) ──
exports.lasnaChain = {
    id: 5_318_007,
    name: "Lasna Testnet",
    nativeCurrency: { name: "REACT", symbol: "REACT", decimals: 18 },
    rpcUrls: {
        default: { http: ["https://lasna-rpc.rnk.dev/"] },
    },
};
// ── Event selector for log parsing ────────────────────────────────────────────
const PROTECTION_CONFIGURED_SELECTOR = (0, viem_1.keccak256)((0, viem_1.toHex)("ProtectionConfigured(uint256,uint8,uint256,uint256,address,address)"));
// ── Client setup ──────────────────────────────────────────────────────────────
function getAccount() {
    const pk = process.env.SERVER_PRIVATE_KEY;
    if (!pk)
        throw new Error("SERVER_PRIVATE_KEY not set");
    const hex = pk.startsWith("0x") ? pk : `0x${pk}`;
    return (0, accounts_1.privateKeyToAccount)(hex);
}
exports.publicClient = (0, viem_1.createPublicClient)({
    chain: chains_1.baseSepolia,
    transport: (0, viem_1.http)(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"),
});
exports.lasnaClient = (0, viem_1.createPublicClient)({
    chain: exports.lasnaChain,
    transport: (0, viem_1.http)(process.env.LASNA_RPC_URL ?? "https://lasna-rpc.rnk.dev/"),
});
function getWalletClient() {
    return (0, viem_1.createWalletClient)({
        account: getAccount(),
        chain: chains_1.baseSepolia,
        transport: (0, viem_1.http)(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"),
    });
}
function getCallbackAddress() {
    const addr = contracts_1.CONTRACTS.aaveProtectionCallback;
    if (!addr || addr === "") {
        throw new Error("AAVE_PROTECTION_CALLBACK_ADDRESS not set in .env");
    }
    return addr;
}
function getReactiveAddress() {
    const addr = contracts_1.CONTRACTS.aaveProtectionReactive;
    if (!addr || addr === "") {
        throw new Error("AAVE_PROTECTION_REACTIVE_ADDRESS not set in .env");
    }
    return addr;
}
/**
 * Create a protection config on AaveProtectionCallback.
 *
 * Called by the server after x402 payment is confirmed.
 * The CC's createProtectionConfig() is owner-only — the server wallet must be the CC owner.
 *
 * Returns the config ID parsed from the ProtectionConfigured event.
 */
async function createProtectionConfig(params) {
    const walletClient = getWalletClient();
    const callbackAddress = getCallbackAddress();
    console.log(`[chain] Creating protection config on ${callbackAddress}...`);
    console.log(`[chain]   protectedUser=${params.protectedUser}`);
    console.log(`[chain]   type=${params.protectionType} threshold=${params.healthFactorThreshold}`);
    const txHash = await walletClient.writeContract({
        address: callbackAddress,
        abi: aave_protection_callback_1.AAVE_PROTECTION_CALLBACK_ABI,
        functionName: "createProtectionConfig",
        args: [
            params.protectedUser,
            params.protectionType,
            params.healthFactorThreshold,
            params.targetHealthFactor,
            params.collateralAsset,
            params.debtAsset,
            params.preferDebtRepayment,
            params.duration,
        ],
    });
    console.log(`[chain] Tx submitted: ${txHash}`);
    const receipt = await exports.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[chain] Tx confirmed in block ${receipt.blockNumber}`);
    // Find the ProtectionConfigured log by matching topic[0]
    const configuredLog = receipt.logs.find((log) => log.address.toLowerCase() === callbackAddress.toLowerCase() &&
        log.topics[0] === PROTECTION_CONFIGURED_SELECTOR);
    if (!configuredLog || !configuredLog.topics[1]) {
        throw new Error(`ProtectionConfigured event not found in tx ${txHash}. ` +
            `This likely means the CC ABI doesn't match the deployed contract. ` +
            `Logs found: ${receipt.logs.length}`);
    }
    // topic[1] = indexed configId (uint256)
    const configId = BigInt(configuredLog.topics[1]);
    console.log(`[chain] Protection config #${configId} created`);
    return { configId, txHash };
}
// ── Config management ─────────────────────────────────────────────────────────
async function pauseProtectionConfig(configId) {
    const walletClient = getWalletClient();
    const callbackAddress = getCallbackAddress();
    const txHash = await walletClient.writeContract({
        address: callbackAddress,
        abi: aave_protection_callback_1.AAVE_PROTECTION_CALLBACK_ABI,
        functionName: "pauseProtectionConfig",
        args: [configId],
    });
    await exports.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[chain] Config #${configId} paused (tx: ${txHash})`);
    return txHash;
}
async function resumeProtectionConfig(configId) {
    const walletClient = getWalletClient();
    const callbackAddress = getCallbackAddress();
    const txHash = await walletClient.writeContract({
        address: callbackAddress,
        abi: aave_protection_callback_1.AAVE_PROTECTION_CALLBACK_ABI,
        functionName: "resumeProtectionConfig",
        args: [configId],
    });
    await exports.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[chain] Config #${configId} resumed (tx: ${txHash})`);
    return txHash;
}
async function cancelProtectionConfig(configId) {
    const walletClient = getWalletClient();
    const callbackAddress = getCallbackAddress();
    const txHash = await walletClient.writeContract({
        address: callbackAddress,
        abi: aave_protection_callback_1.AAVE_PROTECTION_CALLBACK_ABI,
        functionName: "cancelProtectionConfig",
        args: [configId],
    });
    await exports.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[chain] Config #${configId} cancelled (tx: ${txHash})`);
    return txHash;
}
/**
 * Fetch a protection config from on-chain state.
 */
async function getProtectionConfig(configId) {
    const result = await exports.publicClient.readContract({
        address: getCallbackAddress(),
        abi: aave_protection_callback_1.AAVE_PROTECTION_CALLBACK_ABI,
        functionName: "protectionConfigs",
        args: [configId],
    });
    const r = result;
    return {
        id: BigInt(r[0] ?? r.id),
        protectedUser: r[1] ?? r.protectedUser,
        protectionType: Number(r[2] ?? r.protectionType),
        healthFactorThreshold: BigInt(r[3] ?? r.healthFactorThreshold),
        targetHealthFactor: BigInt(r[4] ?? r.targetHealthFactor),
        collateralAsset: r[5] ?? r.collateralAsset,
        debtAsset: r[6] ?? r.debtAsset,
        preferDebtRepayment: Boolean(r[7] ?? r.preferDebtRepayment),
        status: Number(r[8] ?? r.status),
        createdAt: BigInt(r[9] ?? r.createdAt),
        expiresAt: BigInt(r[10] ?? r.expiresAt ?? 0),
        lastExecutedAt: BigInt(r[11] ?? r.lastExecutedAt),
        executionCount: Number(r[12] ?? r.executionCount),
        consecutiveFailures: Number(r[13] ?? r.consecutiveFailures),
        lastExecutionAttempt: BigInt(r[14] ?? r.lastExecutionAttempt),
    };
}
/**
 * Get all active config IDs.
 */
async function getActiveConfigs() {
    const result = await exports.publicClient.readContract({
        address: getCallbackAddress(),
        abi: aave_protection_callback_1.AAVE_PROTECTION_CALLBACK_ABI,
        functionName: "getActiveConfigs",
    });
    return result.map((id) => BigInt(id));
}
/**
 * Get current health factor for a user from the CC.
 */
async function getHealthFactor(userAddress) {
    const result = await exports.publicClient.readContract({
        address: getCallbackAddress(),
        abi: aave_protection_callback_1.AAVE_PROTECTION_CALLBACK_ABI,
        functionName: "getCurrentHealthFactor",
        args: [userAddress],
    });
    return BigInt(result);
}
/**
 * Check the REACT balance of the Reactive Contract on Lasna.
 * If RC is underfunded, callbacks won't fire.
 */
async function getReactiveBalance() {
    const rcAddress = getReactiveAddress();
    return exports.lasnaClient.getBalance({ address: rcAddress });
}
/** Minimum REACT balance (0.01 REACT) below which we refuse new registrations. */
exports.MIN_RC_BALANCE = 10000000000000000n; // 0.01 ether
//# sourceMappingURL=chain.js.map