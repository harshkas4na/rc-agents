/**
 * index.ts — x402 Aave Protection API
 *
 * Endpoints:
 *   GET  /api/services                → service catalog + pricing (free)
 *   POST /api/quote                   → exact price estimate (free)
 *   GET  /api/protect/liquidation     → [402-gated] register Aave HF guard
 *   GET  /api/status/:subscriptionId  → subscription status (free)
 *   GET  /health                      → server health (free)
 */

import "dotenv/config";
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
} from "../config/services.js";
import {
  registerSubscription,
  getSubscription,
  getActiveCount,
  getReactiveBalance,
  MIN_RC_BALANCE,
} from "./chain.js";
import { fundRCGasPool } from "./bridge.js";

const app = express();
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
  "GET /api/protect/liquidation": {
    accepts: {
      scheme: "exact",
      network: NETWORK,
      payTo: PAYMENT_RECIPIENT,
      // Dynamic pricing: compute from query params at request time
      price: async (context: any) => {
        const params = context.adapter?.getQueryParams?.() ?? {};
        const duration = parseInt((params.duration as string) ?? "86400", 10);
        const clampedDuration = Math.max(3600, Math.min(2592000, isNaN(duration) ? 86400 : duration));
        const priceBaseUnits = computePrice("hf-guard", clampedDuration);
        return { asset: "USDC", amount: priceBaseUnits.toString() };
      },
    },
    description: "Aave Liquidation Guard — monitors health factor, supplies collateral on trigger",
  },
};

app.use(paymentMiddleware(routes, resourceServer));

// ── Validation ────────────────────────────────────────────────────────────────

const hfGuardSchema = z.object({
  protectedUser: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  threshold: z
    .string()
    .transform((v) => parseFloat(v))
    .pipe(z.number().min(1.01).max(3.0)),
  duration: z
    .string()
    .optional()
    .default("86400")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().min(3600).max(2592000)),
  collateralAsset: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .default(WETH_BASE_SEPOLIA),
  collateralAmount: z
    .string()
    .optional()
    .default("100000000000000000") // 0.1 ETH
    .transform((v) => BigInt(v)),
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

// ── Free endpoints ────────────────────────────────────────────────────────────

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
    status: "live",
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
// The x402 middleware (above) intercepts this route. If the client hasn't paid,
// it returns 402 with payment terms. If payment is valid, it calls next() and
// this handler runs.

app.get("/api/protect/liquidation", async (req: Request, res: Response) => {
  // Validate query params
  const result = hfGuardSchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({
      error: "Invalid parameters",
      details: result.error.flatten().fieldErrors,
    });
    return;
  }

  const params = result.data;

  // Check RC balance before registering
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
    // Can't reach Kopli — warn but don't block
    console.warn("[protect] Could not verify RC balance on Kopli");
  }

  try {
    const agentAddress = extractPayerAddress(req);
    if (!agentAddress) {
      res.status(400).json({ error: "Could not determine payer address from payment" });
      return;
    }

    const protectedUser = (params.protectedUser ?? agentAddress) as `0x${string}`;
    const thresholdWad = BigInt(Math.floor(params.threshold * 1e18));

    const { subscriptionId, txHash } = await registerSubscription({
      agent: agentAddress,
      protectedUser,
      collateralAsset: params.collateralAsset as `0x${string}`,
      threshold: thresholdWad,
      collateralAmount: params.collateralAmount,
      duration: BigInt(params.duration),
    });

    // Phase 1: log funding need; Phase 2 automates USDC→ETH→Kopli
    const price = computePrice("hf-guard", params.duration);
    await fundRCGasPool(price);

    const expiresAt = Math.floor(Date.now() / 1000) + params.duration;
    const callbackAddress = process.env.AAVE_HF_CALLBACK_ADDRESS;

    res.json({
      success: true,
      subscriptionId: subscriptionId.toString(),
      txHash,
      agent: agentAddress,
      protectedUser,
      threshold: params.threshold,
      collateralAsset: params.collateralAsset,
      collateralAmount: params.collateralAmount.toString(),
      expiresAt,
      expiresAtISO: new Date(expiresAt * 1000).toISOString(),
      message:
        `Protection active. Health factor monitored every ~12 min. ` +
        `Collateral supplied if HF drops below ${params.threshold}.`,
      nextSteps: [
        `Approve AaveHFCallback (${callbackAddress}) to spend ` +
          `${params.collateralAmount.toString()} of ${params.collateralAsset}.`,
      ],
    });
  } catch (err: any) {
    console.error("[protect/liquidation] Failed:", err);
    res.status(500).json({
      error: "On-chain registration failed",
      reason: err?.shortMessage ?? err?.message ?? "Unknown error",
    });
  }
});

// ── Status endpoint ───────────────────────────────────────────────────────────

app.get("/api/status/:subscriptionId", async (req: Request, res: Response) => {
  let id: bigint;
  try {
    id = BigInt(req.params.subscriptionId);
  } catch {
    res.status(400).json({ error: "Invalid subscription ID" });
    return;
  }

  try {
    const sub = await getSubscription(id);
    const expiresAt = Number(sub.expiresAt);
    const now = Math.floor(Date.now() / 1000);

    res.json({
      subscriptionId: id.toString(),
      agent: sub.agent,
      protectedUser: sub.protectedUser,
      collateralAsset: sub.collateralAsset,
      threshold: (Number(sub.threshold) / 1e18).toFixed(4),
      collateralAmount: sub.collateralAmount.toString(),
      expiresAt,
      expiresAtISO: new Date(expiresAt * 1000).toISOString(),
      active: sub.active,
      expired: now > expiresAt,
      timeRemaining: sub.active ? Math.max(0, expiresAt - now) : 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch subscription", reason: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/health", async (_req: Request, res: Response) => {
  try {
    const [activeCount, rcBalance] = await Promise.all([
      getActiveCount(),
      getReactiveBalance().catch(() => -1n),
    ]);

    const rcFunded = rcBalance >= MIN_RC_BALANCE;

    res.json({
      status: rcFunded ? "ok" : "degraded",
      activeSubscriptions: activeCount.toString(),
      reactiveContractBalance: rcBalance >= 0n ? rcBalance.toString() : "unreachable",
      reactiveContractFunded: rcBalance >= 0n ? rcFunded : "unknown",
    });
  } catch (err: any) {
    res.status(503).json({ status: "error", reason: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);

app.listen(PORT, () => {
  console.log(`[server] Listening on :${PORT}`);
  console.log(`[server] Facilitator: ${FACILITATOR_URL}`);
  console.log(`[server] Recipient:   ${PAYMENT_RECIPIENT}`);
  console.log(`[server] Callback:    ${process.env.AAVE_HF_CALLBACK_ADDRESS ?? "NOT SET"}`);
  console.log(`[server] Reactive:    ${process.env.AAVE_HF_REACTIVE_ADDRESS ?? "NOT SET"}`);
});

export default app;
