rc-agentsgit:(main)✗ npx tsx test-agent.ts --both
╔══════════════════════════════════════════════════════════════╗
║         rc-agents — Full Lifecycle E2E Test                 ║
╚══════════════════════════════════════════════════════════════╝

  Agent wallet:   0x941b727Ad8ACF020558Ce58CD7Cb65b48B958DB1
  Server:         http://localhost:3000
  Mode:           --both
  Subscription:   3600s (1.0h)
  Monitor window: 15 minutes
  DCA config:     10 USDC/swap × 3 swaps

── 0. Agent wallet balances ────────────────────────────────────
   ETH:  0.055933204762517043 ETH
   USDC: 10.629892 USDC

── 1. Server health ────────────────────────────────────────────
   Status: ok
   Aave RC: {"reactiveContractBalance":"1000000000000000000","reactiveContractFunded":true}
   DCA RC:  {"reactiveContractBalance":"1000000000000000000","reactiveContractFunded":true}

── 2. Service catalog ──────────────────────────────────────────
   aave-protection:
     Name:   Aave Liquidation Protection
     Price:  $0.3/day
     Status: live
     Limits: 3600s – 2592000s
   dca-strategy:
     Name:   DCA Strategy (Uniswap V3)
     Price:  $0.24/day
     Status: live
     Limits: 3600s – 2592000s

╔══════════════════════════════════════════════════════════════╗
║   AAVE LIQUIDATION PROTECTION                              ║
╚══════════════════════════════════════════════════════════════╝

── 3a. Quote ──────────────────────────────────────────────────
   Duration: 3600s
   Price:    $0.0125 (12500 base units)

── 3b. x402 Payment + Create Protection Config ────────────────
   Protected user: 0x941b727Ad8ACF020558Ce58CD7Cb65b48B958DB1
   FAILED: {
  "error": "On-chain config creation failed",
  "reason": "The contract function \"createProtectionConfig\" reverted with the following reason:\nCollateral asset not supported"
}

╔══════════════════════════════════════════════════════════════╗
║   DCA STRATEGY (UNISWAP V3)                                ║
╚══════════════════════════════════════════════════════════════╝

── 4a. Quote ──────────────────────────────────────────────────
   Duration: 3600s
   Price:    $0.01 (10000 base units)

── 4b. ERC20 Approval for DCA Callback ────────────────────────
   Total USDC needed for swaps: 30 USDC
   (Approval happens after config creation — we need the CC address from server)

── 4c. x402 Payment + Create DCA Config ────────────────────────
   Strategy: USDC -> WETH
   Amount:   10 USDC per swap
   Swaps:    3 total
   Interval: 720s (12 min)
   Config ID: 0
   Tx hash:   0xf34298ab10d7266a0e98b979aea10b48b66076fe840e12b974f1ed04d62d7399
   Message:   DCA config #0 active. Swaps execute every ~720s (or on each CRON tick if interval < 700s). 3 swaps total.
   Next steps:
     - Approve DCAStrategyCallback (0x9e05d50B343BC4b718158EC1dAAf4d7a2a71e3C9) to spend your 0x036CbD53842c5426634e7929541eC2318f3
dCF7e (total needed: 30000000).

── 4d. Approve DCA Callback to spend USDC ─────────────────────
   DCA: Allowance already sufficient (30 USDC)

── 4e. Verify DCA config on-chain ─────────────────────────────
   Status:          Active
   Token pair:      0x036CbD53842c5426634e7929541eC2318f3dCF7e -> 0x4200000000000000000000000000000000000006
   Per swap:        10 USDC
   Swaps done:      0 / 3
   Total received:  0
   Swap interval:   720s
   Expires at:      2026-03-22T12:41:28.000Z

── 4f. User's DCA configs ─────────────────────────────────────
   Config IDs: ['0' ]
   Count:1

── 4g. All active DCA configs ─────────────────────────────────
   Active IDs: ['0' ]
   Count:1

╔══════════════════════════════════════════════════════════════╗
║   MONITORING (waiting for CRON ticks)                      ║
╚══════════════════════════════════════════════════════════════╝

   Polling every 2 minutes for 15 minutes...
   First CRON_100 tick expected in ~12 minutes.

── Poll 1/8 [5:13:39 PM] ──────────────────────────────
   DCA #0: status=Active swaps=0/3 received=0
── Poll 2/8 [5:15:39 PM] ──────────────────────────────
   DCA #0: status=Active swaps=1/3 received=16125235417692202
── Poll 3/8 [5:17:39 PM] ──────────────────────────────
   DCA #0: status=Active swaps=1/3 received=16125235417692202
── Poll 4/8 [5:19:40 PM] ──────────────────────────────
   DCA #0: status=Active swaps=1/3 received=16125235417692202
── Poll 5/8 [5:21:40 PM] ──────────────────────────────
   DCA #0: status=Active swaps=1/3 received=16125235417692202
── Poll 6/8 [5:23:40 PM] ──────────────────────────────
   DCA #0: status=Active swaps=1/3 received=16125235417692202
── Poll 7/8 [5:25:40 PM] ──────────────────────────────
   DCA #0: status=Active swaps=1/3 received=16125235417692202
── Poll 8/8 [5:27:41 PM] ──────────────────────────────
   DCA #0: status=Active swaps=1/3 received=16125235417692202

╔══════════════════════════════════════════════════════════════╗
║   DEACTIVATION                                             ║
╚══════════════════════════════════════════════════════════════╝

── 6a. Cancel DCA config #0 ──────────────────────────
   Result: cancelled
   Tx:     0x704008e09f79d4af7ed209105e0bd23b6c8bcfc25fc0f9272fa6fb1c589ea8db

── 7. Verify cancellation ─────────────────────────────────────
   DCA #0: status=Cancelled

── 8. Final active config counts ──────────────────────────────
   Active DCA configs:0
   Active Aave configs:0

── 9. Final agent balances ─────────────────────────────────────
   ETH:  0.055933204762517043 ETH (spent 0 on gas)
   USDC: 0.619892 USDC (spent 10.01 total)

╔══════════════════════════════════════════════════════════════╗
║   TEST COMPLETE                                            ║
╚══════════════════════════════════════════════════════════════╝

Summary:
  - Services tested: Aave Protection, DCA Strategy
  - Subscriptions created and cancelled
  - Monitor window: 15 minutes
  - Total USDC spent: 10.01 USDC