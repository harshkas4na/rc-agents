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
export declare function startGoatScheduler(): void;
export declare function stopGoatScheduler(): void;
//# sourceMappingURL=goat-scheduler.d.ts.map