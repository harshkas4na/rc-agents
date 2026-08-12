/**
 * index.ts — x402 Automation Marketplace API
 *
 * Aave Protection endpoints:
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
 *
 * DCA Strategy endpoints:
 *   POST /api/dca/activate                     → [402-gated] fund DCA automation + get instructions
 *   POST /api/dca/pause                        → pause a DCA config (free, admin)
 *   POST /api/dca/resume                       → resume a DCA config (free, admin)
 *   POST /api/dca/cancel                       → cancel a DCA config (free, admin)
 *   GET  /api/dca/config/:configId             → DCA config details (free)
 *   GET  /api/dca/configs                      → all active DCA configs (free)
 *   GET  /api/dca/user/:userAddress            → DCA configs for a user (free)
 *
 * General:
 *   GET  /health                               → server health (free)
 */

import "dotenv/config";
import path from "path";
import fs from "fs";
import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { RoutesConfig } from "@x402/core/server";
import { z } from "zod";
import {
  SERVICES,
  computePrice,
  formatUsdc,
  WETH_BASE_SEPOLIA,
  USDC_BASE_SEPOLIA,
  DEMO_USDC_GOAT_TESTNET3,
  WGBTC_GOAT_TESTNET3,
  CHAIN,
} from "../config/services";
import { GOAT_TESTNET3_CONTRACTS, GOAT_NETWORK } from "../config/contracts";
import {
  createProtectionConfig,
  pauseProtectionConfig,
  resumeProtectionConfig,
  cancelProtectionConfig,
  getProtectionConfig,
  getActiveConfigs,
  getHealthFactor,
  getReactiveBalance,
  getWalletClient,
  MIN_RC_BALANCE,
  createDCAConfig,
  getDCAConfig,
  getActiveDCAConfigs,
  getUserDCAConfigs,
  pauseDCAConfig,
  resumeDCAConfig,
  cancelDCAConfig,
  getDCAReactiveBalance,
} from "./chain";
import { fundRCGasPool } from "./bridge";
import { renderLandingPage, DASHBOARD_SCRIPT } from "./landing";
import {
  createDCAConfigGoat,
  pauseDCAConfigGoat,
  resumeDCAConfigGoat,
  cancelDCAConfigGoat,
  getDCAConfigGoat,
  getActiveDCAConfigsGoat,
  getUserDCAConfigsGoat,
  getAllDCAConfigsGoat,
  getGoatDeployerBalance,
  executeDCAOrdersGoat,
  MIN_GOAT_BALANCE,
} from "./chain-goat";
import { startGoatScheduler } from "./goat-scheduler";
import { parseAbi, type Address } from "viem";

const app = express();

// Behind Vercel's proxy, req.protocol reports "http" unless the forwarded
// headers are trusted — which leaks into two places that matter: the landing
// page hands agents http:// URLs on an https site, and the x402 challenge
// advertises its resource as http://, which strict clients may refuse to match
// against the URL they actually called.
app.set("trust proxy", true);

app.use(helmet());
app.use(cors());
app.use(express.json());

// ── Config ────────────────────────────────────────────────────────────────────

const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";
const PAYMENT_RECIPIENT = process.env.SERVER_WALLET_ADDRESS as `0x${string}`;
const NETWORK = "eip155:84532" as const;

if (!PAYMENT_RECIPIENT) {
  console.error("Fatal: SERVER_WALLET_ADDRESS not set");
  process.exit(1);
}

// ── x402 middleware setup (app-level, route-based) ────────────────────────────

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, new ExactEvmScheme());

const routes: RoutesConfig = {
  "POST /api/protect/liquidation": {
    accepts: {
      scheme: "exact",
      network: NETWORK,
      payTo: PAYMENT_RECIPIENT,
      price: async (context: any) => {
        const body = context.adapter?.getBody?.() ?? {};
        const duration = parseInt(body.duration ?? "86400", 10);
        const clampedDuration = Math.max(3600, Math.min(2592000, isNaN(duration) ? 86400 : duration));
        const priceBaseUnits = computePrice("aave-protection", clampedDuration);
        return {
          asset: USDC_BASE_SEPOLIA,
          amount: priceBaseUnits.toString(),
          extra: { name: "USDC", version: "2" },
        };
      },
    },
    description: "Aave Liquidation Protection — monitors health factor, supplies collateral or repays debt on trigger",
  },
  "POST /api/dca/activate": {
    accepts: {
      scheme: "exact",
      network: NETWORK,
      payTo: PAYMENT_RECIPIENT,
      price: async (context: any) => {
        const body = context.adapter?.getBody?.() ?? {};
        const duration = parseInt(body.duration ?? "86400", 10);
        const clampedDuration = Math.max(3600, Math.min(2592000, isNaN(duration) ? 86400 : duration));
        const priceBaseUnits = computePrice("dca-strategy", clampedDuration);
        return {
          asset: USDC_BASE_SEPOLIA,
          amount: priceBaseUnits.toString(),
          extra: { name: "USDC", version: "2" },
        };
      },
    },
    description: "DCA Strategy Activation — pays for Reactive Network automation gas to run periodic Uniswap V3 swaps",
  },
  "POST /api/goat/dca/activate": {
    accepts: {
      scheme: "exact",
      network: NETWORK,
      payTo: PAYMENT_RECIPIENT,
      price: async (context: any) => {
        const body = context.adapter?.getBody?.() ?? {};
        const duration = parseInt(body.duration ?? "86400", 10);
        const clampedDuration = Math.max(3600, Math.min(2592000, isNaN(duration) ? 86400 : duration));
        const priceBaseUnits = computePrice("dca-strategy-goat", clampedDuration);
        return {
          asset: USDC_BASE_SEPOLIA,
          amount: priceBaseUnits.toString(),
          extra: { name: "USDC", version: "2" },
        };
      },
    },
    description: "DCA Strategy on GOAT Testnet3 — payment is x402 USDC on Base Sepolia, execution is a real Uniswap V3 Core swap on GOAT, triggered by a genuinely permissionless on-chain function (no Reactive Network)",
  },
};

app.use(paymentMiddleware(routes, resourceServer));

// ── Validation ────────────────────────────────────────────────────────────────

const addressRegex = /^0x[a-fA-F0-9]{40}$/;

const protectionSchema = z.object({
  protectedUser: z.string().regex(addressRegex),
  protectionType: z.number().int().min(0).max(2),
  healthFactorThreshold: z.string().regex(/^\d+$/),
  targetHealthFactor: z.string().regex(/^\d+$/),
  collateralAsset: z.string().regex(addressRegex).default("0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f"),
  debtAsset: z.string().regex(addressRegex).default(WETH_BASE_SEPOLIA),
  preferDebtRepayment: z.boolean().default(false),
  duration: z.number().int().min(3600).max(2592000).default(86400),
});

const configIdSchema = z.object({
  configId: z.number().int().min(0),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the payer wallet from the x402 PAYMENT-SIGNATURE header.
 * The header is base64-encoded JSON containing the EIP-3009 authorization.
 */
function extractPayerAddress(req: Request): `0x${string}` | null {
  try {
    const sig = req.headers["payment-signature"] as string | undefined;
    if (!sig) {
      console.warn("[extractPayer] No PAYMENT-SIGNATURE header");
      return null;
    }

    const decoded = JSON.parse(Buffer.from(sig, "base64").toString("utf-8"));
    const from =
      decoded?.payload?.authorization?.from ??
      decoded?.payload?.from ??
      decoded?.from;

    if (!from || !/^0x[a-fA-F0-9]{40}$/.test(from)) {
      console.error("[extractPayer] Invalid address in payment header:", from);
      return null;
    }

    return from as `0x${string}`;
  } catch (err) {
    console.error("[extractPayer] Failed to decode payment header:", err);
    return null;
  }
}

// ── Landing page (human-facing; the real interface is /openapi.yaml) ─────────

app.get("/", (req: Request, res: Response) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(renderLandingPage(baseUrl));
});

// Served as its own file rather than inlined: helmet's default CSP is
// `script-src 'self'`, which blocks inline <script>. See landing.ts.
app.get("/dashboard.js", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(DASHBOARD_SCRIPT);
});

// ── Free endpoints ────────────────────────────────────────────────────────────

/**
 * A service is only "live" if the contracts it dispatches to actually exist in
 * this deployment. Reporting a hardcoded "live" for everything means an agent
 * discovers a service here, pays for it, and only then finds out the contract
 * address was never configured — the catalog has to agree with /health.
 *
 * dca-strategy-goat has no env dependency: its addresses are baked into
 * src/config/contracts.ts because they're a fixed Testnet3 deployment.
 */
function serviceStatus(serviceId: string): "live" | "not configured" {
  const svc = SERVICES[serviceId];
  if (!svc?.callbackAddressEnv) return "live";
  return process.env[svc.callbackAddressEnv] ? "live" : "not configured";
}

app.get("/api/services", (_req: Request, res: Response) => {
  const catalog = Object.values(SERVICES).map((svc) => ({
    id: svc.id,
    name: svc.name,
    description: svc.description,
    trigger: svc.trigger,
    action: svc.action,
    pricing: {
      perDay: formatUsdc(BigInt(svc.pricePerDay)),
      perDayBaseUnits: svc.pricePerDay,
      example1Day: formatUsdc(computePrice(svc.id, 86400)),
      example7Days: formatUsdc(computePrice(svc.id, 604800)),
    },
    limits: {
      minDurationSeconds: svc.minDuration,
      maxDurationSeconds: svc.maxDuration,
    },
    network: NETWORK,
    status: serviceStatus(svc.id),
  }));

  res.json({ services: catalog });
});

app.post("/api/quote", (req: Request, res: Response) => {
  const { service, durationSeconds } = req.body;

  const svc = SERVICES[service];
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

  const priceBaseUnits = computePrice(service, dur);

  res.json({
    service,
    durationSeconds: dur,
    price: formatUsdc(priceBaseUnits),
    priceBaseUnits: priceBaseUnits.toString(),
    currency: "USDC",
    network: NETWORK,
  });
});

// ── 402-gated endpoint ────────────────────────────────────────────────────────

app.post("/api/protect/liquidation", async (req: Request, res: Response) => {
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
    const rcBalance = await getReactiveBalance();
    if (rcBalance < MIN_RC_BALANCE) {
      res.status(503).json({
        error: "Service temporarily unavailable",
        reason: "Reactive Contract is underfunded — callbacks won't fire.",
      });
      return;
    }
  } catch {
    console.warn("[protect] Could not verify RC balance on Lasna");
  }

  try {
    const { configId, txHash } = await createProtectionConfig({
      protectedUser: params.protectedUser as Address,
      protectionType: params.protectionType,
      healthFactorThreshold: BigInt(params.healthFactorThreshold),
      targetHealthFactor: BigInt(params.targetHealthFactor),
      collateralAsset: params.collateralAsset as Address,
      debtAsset: params.debtAsset as Address,
      preferDebtRepayment: params.preferDebtRepayment,
      duration: BigInt(params.duration),
    });

    // Fund RC gas pool from payment
    const price = computePrice("aave-protection", params.duration);
    await fundRCGasPool(price, params.duration);

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
      message:
        `Protection config #${configId} active. Health factor monitored every ~12 min. ` +
        `Protection triggers when HF drops below threshold.`,
      nextSteps: [
        `Approve AaveProtectionCallback (${callbackAddress}) to spend ` +
          `your ${params.collateralAsset} (for collateral) and/or ${params.debtAsset} (for debt repayment).`,
      ],
    });
  } catch (err: any) {
    console.error("[protect/liquidation] Failed:", err);
    res.status(500).json({
      error: "On-chain config creation failed",
      reason: err?.shortMessage ?? err?.message ?? "Unknown error",
    });
  }
});

// ── Config management endpoints ───────────────────────────────────────────────

app.post("/api/protect/liquidation/pause", async (req: Request, res: Response) => {
  const result = configIdSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid configId", details: result.error.flatten().fieldErrors });
    return;
  }

  try {
    const txHash = await pauseProtectionConfig(BigInt(result.data.configId));
    res.json({ success: true, configId: result.data.configId, txHash, action: "paused" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to pause config", reason: err?.shortMessage ?? err?.message });
  }
});

app.post("/api/protect/liquidation/resume", async (req: Request, res: Response) => {
  const result = configIdSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid configId", details: result.error.flatten().fieldErrors });
    return;
  }

  try {
    const txHash = await resumeProtectionConfig(BigInt(result.data.configId));
    res.json({ success: true, configId: result.data.configId, txHash, action: "resumed" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to resume config", reason: err?.shortMessage ?? err?.message });
  }
});

app.post("/api/protect/liquidation/cancel", async (req: Request, res: Response) => {
  const result = configIdSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid configId", details: result.error.flatten().fieldErrors });
    return;
  }

  try {
    const txHash = await cancelProtectionConfig(BigInt(result.data.configId));
    res.json({ success: true, configId: result.data.configId, txHash, action: "cancelled" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to cancel config", reason: err?.shortMessage ?? err?.message });
  }
});

// ── Status endpoints ──────────────────────────────────────────────────────────

app.get("/api/status/config/:configId", async (req: Request, res: Response) => {
  let id: bigint;
  try {
    id = BigInt(req.params.configId);
  } catch {
    res.status(400).json({ error: "Invalid config ID" });
    return;
  }

  try {
    const config = await getProtectionConfig(id);
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
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch config", reason: err.message });
  }
});

app.get("/api/status/health/:userAddress", async (req: Request, res: Response) => {
  const { userAddress } = req.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }

  try {
    const healthFactor = await getHealthFactor(userAddress as Address);
    const MAX_HF = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;
    const noPosition = healthFactor === MAX_HF;
    const hfDecimal = noPosition ? null : Number(healthFactor) / 1e18;

    res.json({
      userAddress,
      healthFactor: noPosition ? "MAX" : healthFactor.toString(),
      healthFactorDecimal: noPosition ? null : hfDecimal!.toFixed(4),
      atRisk: noPosition ? false : hfDecimal! < 1.5,
      noAavePosition: noPosition,
    });
  } catch (err: any) {
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

app.get("/api/status/configs", async (_req: Request, res: Response) => {
  try {
    const activeConfigIds = await getActiveConfigs();
    res.json({
      activeConfigIds: activeConfigIds.map((id) => id.toString()),
      count: activeConfigIds.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch active configs", reason: err.message });
  }
});

// ── EIP-2612 permit relay ─────────────────────────────────────────────────────

const ERC20_PERMIT_ABI = parseAbi([
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  "function allowance(address owner, address spender) external view returns (uint256)",
]);

const permitSchema = z.object({
  token: z.string().regex(addressRegex),
  owner: z.string().regex(addressRegex),
  spender: z.string().regex(addressRegex),
  value: z.string().regex(/^\d+$/),
  deadline: z.number().int().positive(),
  v: z.number().int().min(0).max(255),
  r: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  s: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
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
app.post("/api/approve/permit", async (req: Request, res: Response) => {
  const result = permitSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid parameters", details: result.error.flatten().fieldErrors });
    return;
  }

  const { token, owner, spender, value, deadline, v, r, s } = result.data;

  // Only allow permit for known USDC tokens — block WETH (no permit support)
  const WETH = WETH_BASE_SEPOLIA.toLowerCase();
  if (token.toLowerCase() === WETH) {
    res.status(400).json({
      error: "WETH does not support EIP-2612 permit",
      hint: "Use protectionType=1 (DEBT_REPAYMENT) with USDC, or submit an EVM approval transaction for WETH.",
    });
    return;
  }

  try {
    const walletClient = getWalletClient();
    const txHash = await walletClient.writeContract({
      address: token as Address,
      abi: ERC20_PERMIT_ABI,
      functionName: "permit",
      args: [owner as Address, spender as Address, BigInt(value), BigInt(deadline), v, r as `0x${string}`, s as `0x${string}`],
    });

    console.log(`[permit] Relayed permit for owner=${owner} spender=${spender} value=${value} tx=${txHash}`);
    res.json({ success: true, txHash });
  } catch (err: any) {
    console.error("[permit] Failed:", err);
    res.status(500).json({
      error: "Permit relay failed",
      reason: err?.shortMessage ?? err?.message ?? "Unknown error",
    });
  }
});

// ── DCA Strategy endpoints ────────────────────────────────────────────────────

const dcaCreateSchema = z.object({
  user: z.string().regex(addressRegex),
  tokenIn: z.string().regex(addressRegex),
  tokenOut: z.string().regex(addressRegex),
  amountPerSwap: z.string().regex(/^\d+$/),
  poolFee: z.number().int().refine((v) => v === 500 || v === 3000 || v === 10000, {
    message: "Pool fee must be 500, 3000, or 10000",
  }),
  totalSwaps: z.number().int().min(0).default(0),
  swapInterval: z.number().int().min(60).default(720),
  minAmountOut: z.string().regex(/^\d+$/).default("0"),
  duration: z.number().int().min(3600).max(2592000).default(86400),
});

/**
 * POST /api/dca/activate — [402-gated]
 *
 * Agent pays via x402, server creates DCA config on-chain and funds the
 * DCA Reactive Contract. Works identically to /api/protect/liquidation.
 */
app.post("/api/dca/activate", async (req: Request, res: Response) => {
  const result = dcaCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "Invalid parameters",
      details: result.error.flatten().fieldErrors,
    });
    return;
  }

  const params = result.data;

  // Check DCA RC balance before creating config
  try {
    const rcBalance = await getDCAReactiveBalance();
    if (rcBalance < MIN_RC_BALANCE) {
      res.status(503).json({
        error: "Service temporarily unavailable",
        reason: "DCA Reactive Contract is underfunded — automation callbacks won't fire.",
      });
      return;
    }
  } catch {
    console.warn("[dca/activate] Could not verify DCA RC balance on Lasna");
  }

  try {
    const { configId, txHash } = await createDCAConfig({
      user: params.user as Address,
      tokenIn: params.tokenIn as Address,
      tokenOut: params.tokenOut as Address,
      amountPerSwap: BigInt(params.amountPerSwap),
      poolFee: params.poolFee,
      totalSwaps: BigInt(params.totalSwaps),
      swapInterval: BigInt(params.swapInterval),
      minAmountOut: BigInt(params.minAmountOut),
      duration: BigInt(params.duration),
    });

    // Fund DCA RC gas pool from payment
    const price = computePrice("dca-strategy", params.duration);
    await fundRCGasPool(price, params.duration);

    const dcaCallbackAddress = process.env.DCA_STRATEGY_CALLBACK_ADDRESS;

    res.json({
      success: true,
      configId: configId.toString(),
      txHash,
      user: params.user,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountPerSwap: params.amountPerSwap,
      poolFee: params.poolFee,
      totalSwaps: params.totalSwaps,
      swapInterval: params.swapInterval,
      minAmountOut: params.minAmountOut,
      message:
        `DCA config #${configId} active. Swaps execute every ~${params.swapInterval}s ` +
        `(or on each CRON tick if interval < 700s). ` +
        `${params.totalSwaps > 0 ? `${params.totalSwaps} swaps total.` : "Runs until expiry or cancel."}`,
      nextSteps: [
        `Approve DCAStrategyCallback (${dcaCallbackAddress}) to spend your ${params.tokenIn} ` +
          `(total needed: ${params.totalSwaps > 0 ? BigInt(params.amountPerSwap) * BigInt(params.totalSwaps) : "unlimited — approve a large amount"}).`,
      ],
    });
  } catch (err: any) {
    console.error("[dca/activate] Failed:", err);
    res.status(500).json({
      error: "On-chain DCA config creation failed",
      reason: err?.shortMessage ?? err?.message ?? "Unknown error",
    });
  }
});

// ── DCA config management ────────────────────────────────────────────────────

app.post("/api/dca/pause", async (req: Request, res: Response) => {
  const result = configIdSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid configId", details: result.error.flatten().fieldErrors });
    return;
  }

  try {
    const txHash = await pauseDCAConfig(BigInt(result.data.configId));
    res.json({ success: true, configId: result.data.configId, txHash, action: "paused" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to pause DCA config", reason: err?.shortMessage ?? err?.message });
  }
});

app.post("/api/dca/resume", async (req: Request, res: Response) => {
  const result = configIdSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid configId", details: result.error.flatten().fieldErrors });
    return;
  }

  try {
    const txHash = await resumeDCAConfig(BigInt(result.data.configId));
    res.json({ success: true, configId: result.data.configId, txHash, action: "resumed" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to resume DCA config", reason: err?.shortMessage ?? err?.message });
  }
});

app.post("/api/dca/cancel", async (req: Request, res: Response) => {
  const result = configIdSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid configId", details: result.error.flatten().fieldErrors });
    return;
  }

  try {
    const txHash = await cancelDCAConfig(BigInt(result.data.configId));
    res.json({ success: true, configId: result.data.configId, txHash, action: "cancelled" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to cancel DCA config", reason: err?.shortMessage ?? err?.message });
  }
});

// ── DCA status endpoints ─────────────────────────────────────────────────────

app.get("/api/dca/config/:configId", async (req: Request, res: Response) => {
  let id: bigint;
  try {
    id = BigInt(req.params.configId);
  } catch {
    res.status(400).json({ error: "Invalid config ID" });
    return;
  }

  try {
    const config = await getDCAConfig(id);
    const statusLabels = ["Active", "Paused", "Cancelled", "Completed"];

    res.json({
      configId: config.id.toString(),
      user: config.user,
      tokenIn: config.tokenIn,
      tokenOut: config.tokenOut,
      amountPerSwap: config.amountPerSwap.toString(),
      poolFee: config.poolFee,
      totalSwaps: config.totalSwaps.toString(),
      swapsExecuted: config.swapsExecuted.toString(),
      totalAmountOut: config.totalAmountOut.toString(),
      swapInterval: config.swapInterval.toString(),
      minAmountOut: config.minAmountOut.toString(),
      status: statusLabels[config.status] ?? "Unknown",
      createdAt: Number(config.createdAt),
      expiresAt: config.expiresAt > 0n ? Number(config.expiresAt) : null,
      lastSwapAt: Number(config.lastSwapAt),
      consecutiveFailures: config.consecutiveFailures,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch DCA config", reason: err.message });
  }
});

app.get("/api/dca/configs", async (_req: Request, res: Response) => {
  try {
    const activeConfigIds = await getActiveDCAConfigs();
    res.json({
      activeConfigIds: activeConfigIds.map((id) => id.toString()),
      count: activeConfigIds.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch active DCA configs", reason: err.message });
  }
});

app.get("/api/dca/user/:userAddress", async (req: Request, res: Response) => {
  const { userAddress } = req.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }

  try {
    const configIds = await getUserDCAConfigs(userAddress as Address);
    res.json({
      userAddress,
      configIds: configIds.map((id) => id.toString()),
      count: configIds.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch user DCA configs", reason: err.message });
  }
});

// ── GOAT Testnet3 DCA Strategy endpoints ─────────────────────────────────────
// No Reactive Network involved — see /goat-research. Payment is still x402 USDC
// on Base Sepolia; execution is a real Uniswap V3 Core swap on GOAT Testnet3,
// triggered by the permissionless executeDCAOrders() (goat-scheduler.ts polls
// it, but anyone else could too).

const dcaGoatCreateSchema = z.object({
  user: z.string().regex(addressRegex),
  amountPerSwap: z.string().regex(/^\d+$/),
  totalSwaps: z.number().int().min(0).default(0),
  swapInterval: z.number().int().min(60).default(60),
  minAmountOut: z.string().regex(/^\d+$/).default("0"),
  duration: z.number().int().min(3600).max(2592000).default(86400),
});

app.post("/api/goat/dca/activate", async (req: Request, res: Response) => {
  const result = dcaGoatCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid parameters", details: result.error.flatten().fieldErrors });
    return;
  }

  const params = result.data;

  try {
    const balance = await getGoatDeployerBalance();
    if (balance < MIN_GOAT_BALANCE) {
      res.status(503).json({
        error: "Service temporarily unavailable",
        reason: "GOAT deployer wallet is low on BTC — the permissionless scheduler needs gas to poll.",
      });
      return;
    }
  } catch {
    console.warn("[goat/dca/activate] Could not verify GOAT deployer balance");
  }

  try {
    const { configId, txHash } = await createDCAConfigGoat({
      user: params.user as Address,
      tokenIn: DEMO_USDC_GOAT_TESTNET3 as Address,
      tokenOut: WGBTC_GOAT_TESTNET3 as Address,
      amountPerSwap: BigInt(params.amountPerSwap),
      poolFee: 3000,
      totalSwaps: BigInt(params.totalSwaps),
      swapInterval: BigInt(params.swapInterval),
      minAmountOut: BigInt(params.minAmountOut),
      duration: BigInt(params.duration),
    });

    res.json({
      success: true,
      configId: configId.toString(),
      txHash,
      network: CHAIN.GOAT_TESTNET3.caip2,
      user: params.user,
      tokenIn: DEMO_USDC_GOAT_TESTNET3,
      tokenOut: WGBTC_GOAT_TESTNET3,
      amountPerSwap: params.amountPerSwap,
      message:
        `GOAT DCA config #${configId} active. A permissionless scheduler polls every ~60s ` +
        `(anyone can call executeDCAOrders() — this isn't a privileged relay).`,
      nextSteps: [
        `Approve DCAStrategyCallbackGoat (${GOAT_TESTNET3_CONTRACTS.dcaStrategyCallbackGoat}) ` +
          `to spend your ${DEMO_USDC_GOAT_TESTNET3} (dUSDC) on GOAT Testnet3.`,
      ],
    });
  } catch (err: any) {
    console.error("[goat/dca/activate] Failed:", err);
    res.status(500).json({
      error: "On-chain GOAT DCA config creation failed",
      reason: err?.shortMessage ?? err?.message ?? "Unknown error",
    });
  }
});

app.post("/api/goat/dca/pause", async (req: Request, res: Response) => {
  const result = configIdSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid configId", details: result.error.flatten().fieldErrors });
    return;
  }
  try {
    const txHash = await pauseDCAConfigGoat(BigInt(result.data.configId));
    res.json({ success: true, configId: result.data.configId, txHash, action: "paused" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to pause GOAT DCA config", reason: err?.shortMessage ?? err?.message });
  }
});

app.post("/api/goat/dca/resume", async (req: Request, res: Response) => {
  const result = configIdSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid configId", details: result.error.flatten().fieldErrors });
    return;
  }
  try {
    const txHash = await resumeDCAConfigGoat(BigInt(result.data.configId));
    res.json({ success: true, configId: result.data.configId, txHash, action: "resumed" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to resume GOAT DCA config", reason: err?.shortMessage ?? err?.message });
  }
});

app.post("/api/goat/dca/cancel", async (req: Request, res: Response) => {
  const result = configIdSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid configId", details: result.error.flatten().fieldErrors });
    return;
  }
  try {
    const txHash = await cancelDCAConfigGoat(BigInt(result.data.configId));
    res.json({ success: true, configId: result.data.configId, txHash, action: "cancelled" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to cancel GOAT DCA config", reason: err?.shortMessage ?? err?.message });
  }
});

app.get("/api/goat/dca/config/:configId", async (req: Request, res: Response) => {
  let id: bigint;
  try {
    id = BigInt(req.params.configId);
  } catch {
    res.status(400).json({ error: "Invalid config ID" });
    return;
  }

  try {
    const config = await getDCAConfigGoat(id);
    const statusLabels = ["Active", "Paused", "Cancelled", "Completed"];

    res.json({
      configId: config.id.toString(),
      user: config.user,
      tokenIn: config.tokenIn,
      tokenOut: config.tokenOut,
      amountPerSwap: config.amountPerSwap.toString(),
      totalSwaps: config.totalSwaps.toString(),
      swapsExecuted: config.swapsExecuted.toString(),
      totalAmountOut: config.totalAmountOut.toString(),
      status: statusLabels[config.status] ?? "Unknown",
      createdAt: Number(config.createdAt),
      expiresAt: config.expiresAt > 0n ? Number(config.expiresAt) : null,
      lastSwapAt: Number(config.lastSwapAt),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch GOAT DCA config", reason: err.message });
  }
});

app.get("/api/goat/dca/configs", async (_req: Request, res: Response) => {
  try {
    const activeConfigIds = await getActiveDCAConfigsGoat();
    res.json({ activeConfigIds: activeConfigIds.map((id) => id.toString()), count: activeConfigIds.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch active GOAT DCA configs", reason: err.message });
  }
});

app.get("/api/goat/dca/user/:userAddress", async (req: Request, res: Response) => {
  const { userAddress } = req.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }
  try {
    const configIds = await getUserDCAConfigsGoat(userAddress as Address);
    res.json({ userAddress, configIds: configIds.map((id) => id.toString()), count: configIds.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch user's GOAT DCA configs", reason: err.message });
  }
});

// ── Dashboard data ────────────────────────────────────────────────────────────
// Everything the read-only monitoring page at "/" renders, in one call. The page
// fetches this client-side rather than being server-rendered, so a slow or dead
// RPC degrades one panel instead of blocking the whole page on a cold start.
//
// Read-only by construction: every value here comes from an on-chain read or the
// static service catalog. There is no action on this surface a visitor can take.

app.get("/api/dashboard", async (_req: Request, res: Response) => {
  const settled = await Promise.allSettled([
    getReactiveBalance(),
    getActiveConfigs(),
    getDCAReactiveBalance(),
    getActiveDCAConfigs(),
    getGoatDeployerBalance(),
    getActiveDCAConfigsGoat(),
    getAllDCAConfigsGoat(),
  ]);

  const val = <T>(i: number): T | null =>
    settled[i].status === "fulfilled" ? ((settled[i] as PromiseFulfilledResult<T>).value) : null;

  const aaveRcBalance = val<bigint>(0);
  const aaveConfigs = val<bigint[]>(1);
  const dcaRcBalance = val<bigint>(2);
  const dcaConfigs = val<bigint[]>(3);
  const goatBalance = val<bigint>(4);
  const goatActiveIds = val<bigint[]>(5);
  const goatAllIds = val<bigint[]>(6);

  // Pull detail for the GOAT configs — this is the chain where execution actually
  // happens, so it's the one worth showing swap-by-swap rather than as a count.
  // Deliberately every config, not just the active ones: a completed config that
  // executed its swaps is the strongest evidence the pipeline works, and it would
  // be invisible in an active-only view.
  let goatConfigs: any[] = [];
  let lifetimeSwaps = 0n;
  let lifetimeAmountOut = 0n;
  const idsToShow = goatAllIds ?? goatActiveIds;
  if (idsToShow && idsToShow.length > 0) {
    const newestFirst = [...idsToShow].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
    const details = await Promise.allSettled(
      newestFirst.slice(0, 25).map((id) => getDCAConfigGoat(id))
    );
    const statusLabels = ["Active", "Paused", "Cancelled", "Completed"];
    goatConfigs = details
      .filter((d): d is PromiseFulfilledResult<any> => d.status === "fulfilled")
      .map((d) => {
        lifetimeSwaps += d.value.swapsExecuted;
        lifetimeAmountOut += d.value.totalAmountOut;
        return {
          configId: d.value.id.toString(),
          user: d.value.user,
          amountPerSwap: d.value.amountPerSwap.toString(),
          swapsExecuted: d.value.swapsExecuted.toString(),
          totalSwaps: d.value.totalSwaps.toString(),
          totalAmountOut: d.value.totalAmountOut.toString(),
          status: statusLabels[d.value.status] ?? "Unknown",
          lastSwapAt: Number(d.value.lastSwapAt),
        };
      });
  }

  res.json({
    generatedAt: Math.floor(Date.now() / 1000),
    services: Object.values(SERVICES).map((svc) => ({
      id: svc.id,
      name: svc.name,
      trigger: svc.trigger,
      pricePerDay: formatUsdc(BigInt(svc.pricePerDay)),
    })),
    payment: {
      network: NETWORK,
      asset: USDC_BASE_SEPOLIA,
      recipient: PAYMENT_RECIPIENT,
      facilitator: FACILITATOR_URL,
    },
    aaveProtection: {
      chain: CHAIN.BASE_SEPOLIA.caip2,
      automation: "Reactive Network (Lasna) — CRON_100, ~12 min",
      reactiveContractBalance: aaveRcBalance !== null ? aaveRcBalance.toString() : null,
      reactiveContractFunded: aaveRcBalance !== null ? aaveRcBalance >= MIN_RC_BALANCE : null,
      callbackContract: process.env.AAVE_PROTECTION_CALLBACK_ADDRESS ?? null,
      reactiveContract: process.env.AAVE_PROTECTION_REACTIVE_ADDRESS ?? null,
      activeConfigCount: aaveConfigs !== null ? aaveConfigs.length : null,
    },
    dcaStrategy: {
      chain: CHAIN.BASE_SEPOLIA.caip2,
      automation: "Reactive Network (Lasna)",
      reactiveContractBalance: dcaRcBalance !== null ? dcaRcBalance.toString() : null,
      reactiveContractFunded: dcaRcBalance !== null ? dcaRcBalance >= MIN_RC_BALANCE : null,
      callbackContract: process.env.DCA_STRATEGY_CALLBACK_ADDRESS ?? null,
      reactiveContract: process.env.DCA_STRATEGY_REACTIVE_ADDRESS ?? null,
      activeConfigCount: dcaConfigs !== null ? dcaConfigs.length : null,
      configured: dcaRcBalance !== null,
    },
    dcaStrategyGoat: {
      chain: CHAIN.GOAT_TESTNET3.caip2,
      automation:
        "Permissionless executeDCAOrders() — no privileged caller, no Reactive Network",
      explorer: GOAT_NETWORK.testnet3.explorer,
      executorBalance: goatBalance !== null ? goatBalance.toString() : null,
      executorFunded: goatBalance !== null ? goatBalance >= MIN_GOAT_BALANCE : null,
      contracts: GOAT_TESTNET3_CONTRACTS,
      tokens: { tokenIn: DEMO_USDC_GOAT_TESTNET3, tokenOut: WGBTC_GOAT_TESTNET3 },
      activeConfigCount: goatActiveIds !== null ? goatActiveIds.length : null,
      totalConfigCount: goatAllIds !== null ? goatAllIds.length : null,
      lifetimeSwapsExecuted: lifetimeSwaps.toString(),
      lifetimeAmountOut: lifetimeAmountOut.toString(),
      configs: goatConfigs,
    },
  });
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/health", async (_req: Request, res: Response) => {
  try {
    const rcBalance = await getReactiveBalance().catch(() => -1n);
    const rcFunded = rcBalance >= MIN_RC_BALANCE;

    let dcaRcBalance = -1n;
    let dcaRcFunded = false;
    let dcaConfigured = true;
    try {
      dcaRcBalance = await getDCAReactiveBalance();
      dcaRcFunded = dcaRcBalance >= MIN_RC_BALANCE;
    } catch {
      // DCA contracts may not be deployed yet — don't fail the health check
      dcaConfigured = false;
    }

    let goatBalance = -1n;
    let goatFunded = false;
    let goatConfigured = true;
    try {
      goatBalance = await getGoatDeployerBalance();
      goatFunded = goatBalance >= MIN_GOAT_BALANCE;
    } catch {
      goatConfigured = false;
    }

    const allFunded = rcFunded && (dcaRcFunded || !dcaConfigured) && (goatFunded || !goatConfigured);

    res.json({
      status: allFunded ? "ok" : "degraded",
      aaveProtection: {
        reactiveContractBalance: rcBalance >= 0n ? rcBalance.toString() : "unreachable",
        reactiveContractFunded: rcBalance >= 0n ? rcFunded : "unknown",
      },
      dcaStrategy: dcaConfigured
        ? {
            reactiveContractBalance: dcaRcBalance >= 0n ? dcaRcBalance.toString() : "unreachable",
            reactiveContractFunded: dcaRcBalance >= 0n ? dcaRcFunded : "unknown",
          }
        : { status: "not configured" },
      dcaStrategyGoat: goatConfigured
        ? {
            note: "No Reactive Network — permissionless executeDCAOrders(), polled by goat-scheduler.ts",
            deployerBalance: goatBalance >= 0n ? goatBalance.toString() : "unreachable",
            deployerFunded: goatBalance >= 0n ? goatFunded : "unknown",
          }
        : { status: "not configured" },
    });
  } catch (err: any) {
    res.status(503).json({ status: "error", reason: err.message });
  }
});

// ── OpenAPI spec ──────────────────────────────────────────────────────────────

app.get("/openapi.yaml", (_req: Request, res: Response) => {
  const specPath = path.resolve(__dirname, "../../openapi.yaml");
  if (!fs.existsSync(specPath)) {
    res.status(404).json({ error: "Spec not found" });
    return;
  }
  res.setHeader("Content-Type", "text/yaml; charset=utf-8");
  res.send(fs.readFileSync(specPath, "utf-8"));
});

// ── Agent skill card ──────────────────────────────────────────────────────────
// SKILLS.md is the prose counterpart to openapi.yaml: the spec says what the
// endpoints are, the skill card says when an agent should reach for them and
// how the x402 payment loop actually behaves. Served as text/markdown so an
// agent fetching it gets something it can read directly into context.
//
// Exposed at both /skills.md and /.well-known/skills.md — the latter is where
// several agent frameworks probe by convention.

function sendSkillCard(_req: Request, res: Response) {
  const skillPath = path.resolve(__dirname, "../../SKILLS.md");
  if (!fs.existsSync(skillPath)) {
    res.status(404).json({ error: "Skill card not found" });
    return;
  }
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.send(fs.readFileSync(skillPath, "utf-8"));
}

app.get("/skills.md", sendSkillCard);
app.get("/.well-known/skills.md", sendSkillCard);

// ── GOAT scheduler tick (single-shot, for Vercel Cron) ────────────────────────
// setInterval (goat-scheduler.ts) only works on a persistent process — it does
// nothing useful on Vercel's serverless functions, which don't stay alive
// between requests. This endpoint is the serverless-compatible equivalent:
// call executeDCAOrders() once per hit. Wire it to Vercel Cron in vercel.json,
// or any external scheduler, to get the same periodic polling in production.
// Still just as permissionless underneath — this endpoint is a convenience
// for triggering the call, not a privileged path; see chain-goat.ts.
//
// Registered on GET as well as POST on purpose: Vercel Cron invokes its target
// with a GET, so a POST-only route would simply 404 on every scheduled run.
async function goatDcaTick(_req: Request, res: Response) {
  try {
    const { txHash, swapsExecuted } = await executeDCAOrdersGoat();
    res.json({ success: true, txHash, swapsExecuted: swapsExecuted.toString() });
  } catch (err: any) {
    res.status(500).json({ error: "GOAT DCA tick failed", reason: err?.shortMessage ?? err?.message });
  }
}

app.get("/api/goat/dca/tick", goatDcaTick);
app.post("/api/goat/dca/tick", goatDcaTick);

// ── Start ─────────────────────────────────────────────────────────────────────

if (process.env.VERCEL !== "1") {
  const PORT = parseInt(process.env.PORT ?? "3000", 10);
  app.listen(PORT, () => {
    console.log(`[server] Listening on :${PORT}`);
    console.log(`[server] Facilitator: ${FACILITATOR_URL}`);
    console.log(`[server] Recipient:   ${PAYMENT_RECIPIENT}`);
    console.log(`[server] Aave CC:     ${process.env.AAVE_PROTECTION_CALLBACK_ADDRESS ?? "NOT SET"}`);
    console.log(`[server] Aave RC:     ${process.env.AAVE_PROTECTION_REACTIVE_ADDRESS ?? "NOT SET"}`);
    console.log(`[server] DCA CC:      ${process.env.DCA_STRATEGY_CALLBACK_ADDRESS ?? "NOT SET"}`);
    console.log(`[server] DCA RC:      ${process.env.DCA_STRATEGY_REACTIVE_ADDRESS ?? "NOT SET"}`);
    console.log(`[server] GOAT DCA CC: ${GOAT_TESTNET3_CONTRACTS.dcaStrategyCallbackGoat}`);
    startGoatScheduler();
  });
}

export default app;
