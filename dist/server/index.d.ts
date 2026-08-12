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
declare const app: import("express-serve-static-core").Express;
export default app;
//# sourceMappingURL=index.d.ts.map