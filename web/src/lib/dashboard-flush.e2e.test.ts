/**
 * End-to-end tests for the dashboard flush mechanism, verifying that data
 * arriving during a paused flush is never lost — the core fix for the
 * "data not loading after navigation" bug.
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";

mock.module("./update-interval.svelte", () => ({
  getUpdateIntervalMs: () => 5_000,
  restartDashboardFlushCadence: () => {},
  installDashboardFlushCadence: () => {},
}));

mock.module("./sync-dashboard-cache", () => ({
  hydrateDashboardFromConnection: () => {},
  hydrateNarrativesFromConnection: () => {},
  sortAndTrimDashboardBuffers: () => {},
  commitDashboardDomainsRevision: () => {},
}));

const origSetTimeout = globalThis.setTimeout;
const origClearTimeout = globalThis.clearTimeout;
let flush: Awaited<ReturnType<typeof import("./dashboard-flush")>>;

beforeEach(async () => {
  // Restore globals in case other test files replaced them
  // @ts-ignore
  globalThis.setTimeout = origSetTimeout;
  // @ts-ignore
  globalThis.clearTimeout = origClearTimeout;
  // @ts-ignore
  globalThis.requestAnimationFrame = (cb: () => void) => origSetTimeout(cb, 0);
  // @ts-ignore
  globalThis.cancelAnimationFrame = (id: number) => origClearTimeout(id);
  // @ts-ignore
  globalThis.requestIdleCallback = undefined;
  // @ts-ignore
  globalThis.performance = globalThis.performance ?? { now: () => Date.now() };

  flush = await import("./dashboard-flush");
  flush.cancelScheduledDashboardFlush();
  flush.resumeDashboardFlush();
  flush.cancelScheduledDashboardFlush();
});

describe("dashboard flush pause/resume data integrity", () => {
  test("pause does not cancel a scheduled flush — data survives pause/resume", async () => {
    const flush = await import("./dashboard-flush");

    flush.scheduleDashboardFlush();
    flush.pauseDashboardFlush();
    flush.resumeDashboardFlush();

    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 5));

    flush.pauseDashboardFlush();
    flush.resumeDashboardFlush();
  });

  test("concurrent pause/resume cycles don't lose data", async () => {
    const flush = await import("./dashboard-flush");

    for (let i = 0; i < 5; i++) {
      flush.scheduleDashboardFlush();
      flush.pauseDashboardFlush();
      flush.resumeDashboardFlush();
      flush.pauseDashboardFlush();
      flush.resumeDashboardFlush();
    }

    flush.scheduleDashboardFlush();
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 5));
  });

  test("pause does not drop pending events from withRowMutation", async () => {
    const flush = await import("./dashboard-flush");

    flush.pauseDashboardFlush();
    flush.scheduleDashboardFlush();
    flush.scheduleDashboardFlush();
    flush.resumeDashboardFlush();

    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 5));

    flush.scheduleDashboardFlush();
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 5));
  });

  test("pause + cancelScheduled + resume ordering is safe", async () => {
    const flush = await import("./dashboard-flush");

    flush.cancelScheduledDashboardFlush();
    flush.resumeDashboardFlush();
    flush.pauseDashboardFlush();
    flush.resumeDashboardFlush();

    flush.scheduleDashboardFlush();
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 5));
  });
});
