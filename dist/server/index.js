"use strict";
/**
 * index.ts — x402 Aave Protection API
 *
 * Endpoints:
 *   GET  /api/services                         → service catalog + pricing (free)
 *   POST /api/quote                            → exact price estimate (free)
 *   POST /api/protect/liquidation              → [402-gated] create protection config
 *   POST /api/protect/liquidation/pause        → pause a config (free)
 *   POST /api/protect/liquidation/resume       → resume a config (free)
 *   POST /api/protect/liquidation/cancel       → cancel a config (free)
 *   GET  /api/status/config/:configId          → config details (free)
 *   GET  /api/status/health/:userAddress       → health factor (free)
 *   GET  /api/status/configs                   → all active configs (free)
 *   POST /api/approve/permit                   → relay EIP-2612 permit (free, for HTTP-only agents)
 *   GET  /health                               → server health (free)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_2 = require("@x402/express");
const server_1 = require("@x402/evm/exact/server");
const server_2 = require("@x402/core/server");
const zod_1 = require("zod");
const services_1 = require("../config/services");
const chain_1 = require("./chain");
const bridge_1 = require("./bridge");
const viem_1 = require("viem");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// ── Config ────────────────────────────────────────────────────────────────────
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";
const PAYMENT_RECIPIENT = process.env.SERVER_WALLET_ADDRESS;
const NETWORK = "eip155:84532";
if (!PAYMENT_RECIPIENT) {
    console.error("Fatal: SERVER_WALLET_ADDRESS not set");
    process.exit(1);
}
// ── x402 middleware setup (app-level, route-based) ────────────────────────────
const facilitatorClient = new server_2.HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new express_2.x402ResourceServer(facilitatorClient)
    .register(NETWORK, new server_1.ExactEvmScheme());
const routes = {
    "POST /api/protect/liquidation": {
        accepts: {
            scheme: "exact",
            network: NETWORK,
            payTo: PAYMENT_RECIPIENT,
            price: async (context) => {
                // Dynamic pricing: try to parse duration from request body
                // Default to 1 day if not available at pricing time
                const body = context.adapter?.getBody?.() ?? {};
                const duration = parseInt(body.duration ?? "86400", 10);
                const clampedDuration = Math.max(3600, Math.min(2592000, isNaN(duration) ? 86400 : duration));
                const priceBaseUnits = (0, services_1.computePrice)("aave-protection", clampedDuration);
                // Return full AssetAmount with EIP-712 domain info so client can sign EIP-3009.
                // The library skips defaultMoneyConversion (which adds name/version) when
                // given an AssetAmount object — we must include extra fields manually.
                return {
                    asset: services_1.USDC_BASE_SEPOLIA,
                    amount: priceBaseUnits.toString(),
                    extra: { name: "USDC", version: "2" },
                };
            },
        },
        description: "Aave Liquidation Protection — monitors health factor, supplies collateral or repays debt on trigger",
    },
};
app.use((0, express_2.paymentMiddleware)(routes, resourceServer));
// ── Validation ────────────────────────────────────────────────────────────────
const addressRegex = /^0x[a-fA-F0-9]{40}$/;
const protectionSchema = zod_1.z.object({
    protectedUser: zod_1.z.string().regex(addressRegex),
    protectionType: zod_1.z.number().int().min(0).max(2),
    healthFactorThreshold: zod_1.z.string().regex(/^\d+$/),
    targetHealthFactor: zod_1.z.string().regex(/^\d+$/),
    collateralAsset: zod_1.z.string().regex(addressRegex).default(services_1.WETH_BASE_SEPOLIA),
    debtAsset: zod_1.z.string().regex(addressRegex).default("0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f"),
    preferDebtRepayment: zod_1.z.boolean().default(false),
    duration: zod_1.z.number().int().min(3600).max(2592000).default(86400),
});
const configIdSchema = zod_1.z.object({
    configId: zod_1.z.number().int().min(0),
});
// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Extract the payer wallet from the x402 PAYMENT-SIGNATURE header.
 * The header is base64-encoded JSON containing the EIP-3009 authorization.
 */
function extractPayerAddress(req) {
    try {
        const sig = req.headers["payment-signature"];
        if (!sig) {
            console.warn("[extractPayer] No PAYMENT-SIGNATURE header");
            return null;
        }
        const decoded = JSON.parse(Buffer.from(sig, "base64").toString("utf-8"));
        const from = decoded?.payload?.authorization?.from ??
            decoded?.payload?.from ??
            decoded?.from;
        if (!from || !/^0x[a-fA-F0-9]{40}$/.test(from)) {
            console.error("[extractPayer] Invalid address in payment header:", from);
            return null;
        }
        return from;
    }
    catch (err) {
        console.error("[extractPayer] Failed to decode payment header:", err);
        return null;
    }
}
// ── Free endpoints ────────────────────────────────────────────────────────────
app.get("/api/services", (_req, res) => {
    const catalog = Object.values(services_1.SERVICES).map((svc) => ({
        id: svc.id,
        name: svc.name,
        description: svc.description,
        trigger: svc.trigger,
        action: svc.action,
        pricing: {
            perDay: (0, services_1.formatUsdc)(BigInt(svc.pricePerDay)),
            perDayBaseUnits: svc.pricePerDay,
            example1Day: (0, services_1.formatUsdc)((0, services_1.computePrice)(svc.id, 86400)),
            example7Days: (0, services_1.formatUsdc)((0, services_1.computePrice)(svc.id, 604800)),
        },
        limits: {
            minDurationSeconds: svc.minDuration,
            maxDurationSeconds: svc.maxDuration,
        },
        network: NETWORK,
        status: "live",
    }));
    res.json({ services: catalog });
});
app.post("/api/quote", (req, res) => {
    const { service, durationSeconds } = req.body;
    const svc = services_1.SERVICES[service];
    if (!svc) {
        res.status(400).json({ error: `Unknown service: ${service}` });
        return;
    }
    const dur = parseInt(durationSeconds, 10);
    if (isNaN(dur) || dur < svc.minDuration || dur > svc.maxDuration) {
        res.status(400).json({
            error: `Duration must be between ${svc.minDuration}s and ${svc.maxDuration}s`,
        });
        return;
    }
    const priceBaseUnits = (0, services_1.computePrice)(service, dur);
    res.json({
        service,
        durationSeconds: dur,
        price: (0, services_1.formatUsdc)(priceBaseUnits),
        priceBaseUnits: priceBaseUnits.toString(),
        currency: "USDC",
        network: NETWORK,
    });
});
// ── 402-gated endpoint ────────────────────────────────────────────────────────
app.post("/api/protect/liquidation", async (req, res) => {
    const result = protectionSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({
            error: "Invalid parameters",
            details: result.error.flatten().fieldErrors,
        });
        return;
    }
    const params = result.data;
    // Check RC balance before creating config
    try {
        const rcBalance = await (0, chain_1.getReactiveBalance)();
        if (rcBalance < chain_1.MIN_RC_BALANCE) {
            res.status(503).json({
                error: "Service temporarily unavailable",
                reason: "Reactive Contract is underfunded — callbacks won't fire.",
            });
            return;
        }
    }
    catch {
        console.warn("[protect] Could not verify RC balance on Lasna");
    }
    try {
        const { configId, txHash } = await (0, chain_1.createProtectionConfig)({
            protectedUser: params.protectedUser,
            protectionType: params.protectionType,
            healthFactorThreshold: BigInt(params.healthFactorThreshold),
            targetHealthFactor: BigInt(params.targetHealthFactor),
            collateralAsset: params.collateralAsset,
            debtAsset: params.debtAsset,
            preferDebtRepayment: params.preferDebtRepayment,
            duration: BigInt(params.duration),
        });
        // Fund RC gas pool from payment
        const price = (0, services_1.computePrice)("aave-protection", params.duration);
        await (0, bridge_1.fundRCGasPool)(price, params.duration);
        const callbackAddress = process.env.AAVE_PROTECTION_CALLBACK_ADDRESS;
        res.json({
            success: true,
            configId: configId.toString(),
            txHash,
            protectedUser: params.protectedUser,
            protectionType: params.protectionType,
            healthFactorThreshold: params.healthFactorThreshold,
            targetHealthFactor: params.targetHealthFactor,
            collateralAsset: params.collateralAsset,
            debtAsset: params.debtAsset,
            preferDebtRepayment: params.preferDebtRepayment,
            message: `Protection config #${configId} active. Health factor monitored every ~12 min. ` +
                `Protection triggers when HF drops below threshold.`,
            nextSteps: [
                `Approve AaveProtectionCallback (${callbackAddress}) to spend ` +
                    `your ${params.collateralAsset} (for collateral) and/or ${params.debtAsset} (for debt repayment).`,
            ],
        });
    }
    catch (err) {
        console.error("[protect/liquidation] Failed:", err);
        res.status(500).json({
            error: "On-chain config creation failed",
            reason: err?.shortMessage ?? err?.message ?? "Unknown error",
        });
    }
});
// ── Config management endpoints ───────────────────────────────────────────────
app.post("/api/protect/liquidation/pause", async (req, res) => {
    const result = configIdSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: "Invalid configId", details: result.error.flatten().fieldErrors });
        return;
    }
    try {
        const txHash = await (0, chain_1.pauseProtectionConfig)(BigInt(result.data.configId));
        res.json({ success: true, configId: result.data.configId, txHash, action: "paused" });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to pause config", reason: err?.shortMessage ?? err?.message });
    }
});
app.post("/api/protect/liquidation/resume", async (req, res) => {
    const result = configIdSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: "Invalid configId", details: result.error.flatten().fieldErrors });
        return;
    }
    try {
        const txHash = await (0, chain_1.resumeProtectionConfig)(BigInt(result.data.configId));
        res.json({ success: true, configId: result.data.configId, txHash, action: "resumed" });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to resume config", reason: err?.shortMessage ?? err?.message });
    }
});
app.post("/api/protect/liquidation/cancel", async (req, res) => {
    const result = configIdSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: "Invalid configId", details: result.error.flatten().fieldErrors });
        return;
    }
    try {
        const txHash = await (0, chain_1.cancelProtectionConfig)(BigInt(result.data.configId));
        res.json({ success: true, configId: result.data.configId, txHash, action: "cancelled" });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to cancel config", reason: err?.shortMessage ?? err?.message });
    }
});
// ── Status endpoints ──────────────────────────────────────────────────────────
app.get("/api/status/config/:configId", async (req, res) => {
    let id;
    try {
        id = BigInt(req.params.configId);
    }
    catch {
        res.status(400).json({ error: "Invalid config ID" });
        return;
    }
    try {
        const config = await (0, chain_1.getProtectionConfig)(id);
        const statusLabels = ["Active", "Paused", "Cancelled"];
        res.json({
            configId: config.id.toString(),
            protectedUser: config.protectedUser,
            protectionType: config.protectionType,
            healthFactorThreshold: config.healthFactorThreshold.toString(),
            targetHealthFactor: config.targetHealthFactor.toString(),
            collateralAsset: config.collateralAsset,
            debtAsset: config.debtAsset,
            preferDebtRepayment: config.preferDebtRepayment,
            status: statusLabels[config.status] ?? "Unknown",
            createdAt: Number(config.createdAt),
            expiresAt: config.expiresAt > 0n ? Number(config.expiresAt) : null,
            lastExecutedAt: Number(config.lastExecutedAt),
            executionCount: config.executionCount,
            consecutiveFailures: config.consecutiveFailures,
        });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch config", reason: err.message });
    }
});
app.get("/api/status/health/:userAddress", async (req, res) => {
    const { userAddress } = req.params;
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
        res.status(400).json({ error: "Invalid address" });
        return;
    }
    try {
        const healthFactor = await (0, chain_1.getHealthFactor)(userAddress);
        const MAX_HF = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;
        const noPosition = healthFactor === MAX_HF;
        const hfDecimal = noPosition ? null : Number(healthFactor) / 1e18;
        res.json({
            userAddress,
            healthFactor: noPosition ? "MAX" : healthFactor.toString(),
            healthFactorDecimal: noPosition ? null : hfDecimal.toFixed(4),
            atRisk: noPosition ? false : hfDecimal < 1.5,
            noAavePosition: noPosition,
        });
    }
    catch (err) {
        // Reverts when user has no Aave position (lendingPool returns max HF or reverts)
        if (err?.message?.includes("execution reverted")) {
            res.json({
                userAddress,
                healthFactor: "MAX",
                healthFactorDecimal: null,
                atRisk: false,
                noAavePosition: true,
            });
            return;
        }
        res.status(500).json({ error: "Failed to fetch health factor", reason: err.message });
    }
});
app.get("/api/status/configs", async (_req, res) => {
    try {
        const activeConfigIds = await (0, chain_1.getActiveConfigs)();
        res.json({
            activeConfigIds: activeConfigIds.map((id) => id.toString()),
            count: activeConfigIds.length,
        });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch active configs", reason: err.message });
    }
});
// ── EIP-2612 permit relay ─────────────────────────────────────────────────────
const ERC20_PERMIT_ABI = (0, viem_1.parseAbi)([
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
    "function allowance(address owner, address spender) external view returns (uint256)",
]);
const permitSchema = zod_1.z.object({
    token: zod_1.z.string().regex(addressRegex),
    owner: zod_1.z.string().regex(addressRegex),
    spender: zod_1.z.string().regex(addressRegex),
    value: zod_1.z.string().regex(/^\d+$/),
    deadline: zod_1.z.number().int().positive(),
    v: zod_1.z.number().int().min(0).max(255),
    r: zod_1.z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    s: zod_1.z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});
/**
 * POST /api/approve/permit
 *
 * Relay an EIP-2612 permit signature on-chain (server pays gas).
 * Only works for tokens that support EIP-2612 (USDC — NOT WETH).
 * This is free: the fee is already included in the protection service price.
 *
 * HTTP-only agents use this to grant the CC a spending allowance without
 * needing to submit an EVM transaction themselves.
 */
app.post("/api/approve/permit", async (req, res) => {
    const result = permitSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: "Invalid parameters", details: result.error.flatten().fieldErrors });
        return;
    }
    const { token, owner, spender, value, deadline, v, r, s } = result.data;
    // Only allow permit for known USDC tokens — block WETH (no permit support)
    const WETH = services_1.WETH_BASE_SEPOLIA.toLowerCase();
    if (token.toLowerCase() === WETH) {
        res.status(400).json({
            error: "WETH does not support EIP-2612 permit",
            hint: "Use protectionType=1 (DEBT_REPAYMENT) with USDC, or submit an EVM approval transaction for WETH.",
        });
        return;
    }
    try {
        const walletClient = (0, chain_1.getWalletClient)();
        const txHash = await walletClient.writeContract({
            address: token,
            abi: ERC20_PERMIT_ABI,
            functionName: "permit",
            args: [owner, spender, BigInt(value), BigInt(deadline), v, r, s],
        });
        console.log(`[permit] Relayed permit for owner=${owner} spender=${spender} value=${value} tx=${txHash}`);
        res.json({ success: true, txHash });
    }
    catch (err) {
        console.error("[permit] Failed:", err);
        res.status(500).json({
            error: "Permit relay failed",
            reason: err?.shortMessage ?? err?.message ?? "Unknown error",
        });
    }
});
// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
    try {
        const rcBalance = await (0, chain_1.getReactiveBalance)().catch(() => -1n);
        const rcFunded = rcBalance >= chain_1.MIN_RC_BALANCE;
        res.json({
            status: rcFunded ? "ok" : "degraded",
            reactiveContractBalance: rcBalance >= 0n ? rcBalance.toString() : "unreachable",
            reactiveContractFunded: rcBalance >= 0n ? rcFunded : "unknown",
        });
    }
    catch (err) {
        res.status(503).json({ status: "error", reason: err.message });
    }
});
// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
    console.log(`[server] Listening on :${PORT}`);
    console.log(`[server] Facilitator: ${FACILITATOR_URL}`);
    console.log(`[server] Recipient:   ${PAYMENT_RECIPIENT}`);
    console.log(`[server] Callback:    ${process.env.AAVE_PROTECTION_CALLBACK_ADDRESS ?? "NOT SET"}`);
    console.log(`[server] Reactive:    ${process.env.AAVE_PROTECTION_REACTIVE_ADDRESS ?? "NOT SET"}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map