/**
 * Coalesce SpacetimeDB row mutations into bounded trim/sort work so live
 * ingest cannot schedule unbounded O(n log n) passes per animation frame.
 */
import { sortAndTrimDashboardBuffers } from "./sync-dashboard-cache";
import { logDebug } from "./telemetry/log";
import { getUpdateIntervalMs } from "./update-interval.svelte";

function minFlushIntervalMs(): number {
  return getUpdateIntervalMs();
}

let flushRaf = 0;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushIdle: number | undefined;
let flushScheduled = false;
let lastFlushAt = 0;
let flushPaused = false;
let flushPendingWhilePaused = false;

function runFlush(): void {
  flushScheduled = false;
  flushRaf = 0;
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  if (flushIdle !== undefined && typeof cancelIdleCallback !== "undefined") {
    cancelIdleCallback(flushIdle);
    flushIdle = undefined;
  }
  if (flushPaused) {
    flushPendingWhilePaused = true;
    return;
  }
  lastFlushAt = performance.now();
  sortAndTrimDashboardBuffers();
  logDebug("dashboard-flush", "trimmed dashboard buffers");
}

function scheduleFlushTick(): void {
  const elapsed = performance.now() - lastFlushAt;
  const wait = Math.max(0, minFlushIntervalMs() - elapsed);
  const runSoon = (): void => {
    if (typeof requestIdleCallback !== "undefined") {
      flushIdle = requestIdleCallback(
        () => {
          flushIdle = undefined;
          flushRaf = requestAnimationFrame(runFlush);
        },
        { timeout: 120 },
      );
    } else {
      flushRaf = requestAnimationFrame(runFlush);
    }
  };
  if (wait <= 0) {
    runSoon();
    return;
  }
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    runSoon();
  }, wait);
}

export function scheduleDashboardFlush(): void {
  if (flushPaused) {
    flushPendingWhilePaused = true;
    return;
  }
  if (flushScheduled) return;
  flushScheduled = true;
  scheduleFlushTick();
}

export function cancelScheduledDashboardFlush(): void {
  if (flushRaf) {
    cancelAnimationFrame(flushRaf);
    flushRaf = 0;
  }
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  if (flushIdle !== undefined && typeof cancelIdleCallback !== "undefined") {
    cancelIdleCallback(flushIdle);
    flushIdle = undefined;
  }
  flushScheduled = false;
}

/** Pause trim/revision bumps (tab hidden, route teardown). */
export function pauseDashboardFlush(): void {
  flushPaused = true;
  cancelScheduledDashboardFlush();
}

export function resumeDashboardFlush(): void {
  flushPaused = false;
  if (flushPendingWhilePaused) {
    flushPendingWhilePaused = false;
    scheduleDashboardFlush();
  }
}

let visibilityHookInstalled = false;

/** Call once at app boot — defers ingest work while the tab is in the background. */
/** After the user changes refresh cadence, allow an immediate flush on next ingest. */
export function resetDashboardFlushSchedule(): void {
  lastFlushAt = 0;
  cancelScheduledDashboardFlush();
  if (!flushPaused) scheduleDashboardFlush();
}

export function installDashboardFlushVisibilityHook(): void {
  if (visibilityHookInstalled || typeof document === "undefined") return;
  visibilityHookInstalled = true;
  const onVis = (): void => {
    if (document.hidden) pauseDashboardFlush();
    else resumeDashboardFlush();
  };
  document.addEventListener("visibilitychange", onVis);
  if (document.hidden) pauseDashboardFlush();
}
