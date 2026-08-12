/**
 * goat-scheduler.ts — the server's default caller for the PERMISSIONLESS
 * executeDCAOrders() on GOAT Testnet3.
 *
 * This is not a privileged relay standing in for Reactive Network — it's
 * just a convenient, always-on caller. Anyone else with any wallet could
 * make the exact same call and collect the same bounty (if funded). See
 * /goat-research/06-automation-alternatives.md for why that distinction is
 * the whole point: trustlessness comes from the function being open and
 * audited, not from this scheduler being special.
 *
 * Deliberately setInterval, not a cron library — this is one recurring
 * call, not a scheduling system.
 */

import { executeDCAOrdersGoat } from "./chain-goat";

const POLL_INTERVAL_MS = 60_000; // matches the contract's minimum swapInterval (60s)

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick() {
  if (running) return; // don't overlap if a previous call is still pending
  running = true;
  try {
    const { txHash, swapsExecuted } = await executeDCAOrdersGoat();
    if (swapsExecuted > 0n) {
      console.log(`[goat-scheduler] executeDCAOrders: ${swapsExecuted} swap(s) executed (tx: ${txHash})`);
    }
  } catch (err: any) {
    // Expected when there are no active configs to check, or between deploys —
    // don't let a transient RPC/gas hiccup kill the whole server.
    console.warn(`[goat-scheduler] executeDCAOrders failed: ${err?.shortMessage ?? err?.message ?? err}`);
  } finally {
    running = false;
  }
}

export function startGoatScheduler() {
  if (timer) return;
  if (!process.env.GOAT_DEPLOYER_PRIVATE_KEY) {
    console.log("[goat-scheduler] GOAT_DEPLOYER_PRIVATE_KEY not set — GOAT DCA scheduler disabled");
    return;
  }
  console.log(`[goat-scheduler] Starting — polling executeDCAOrders() every ${POLL_INTERVAL_MS / 1000}s`);
  timer = setInterval(tick, POLL_INTERVAL_MS);
}

export function stopGoatScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
