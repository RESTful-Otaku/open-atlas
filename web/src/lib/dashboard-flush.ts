/**
 * Coalesce SpacetimeDB row mutations into at most one trim/sort per animation
 * frame so live ingest does not run O(n log n) work on every row.
 */

import { sortAndTrimDashboardBuffers } from "./sync-dashboard-cache";

let flushRaf = 0;
let flushScheduled = false;

export function scheduleDashboardFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  flushRaf = requestAnimationFrame(() => {
    flushScheduled = false;
    flushRaf = 0;
    sortAndTrimDashboardBuffers();
  });
}

export function cancelScheduledDashboardFlush(): void {
  if (flushRaf) {
    cancelAnimationFrame(flushRaf);
    flushRaf = 0;
  }
  flushScheduled = false;
}
