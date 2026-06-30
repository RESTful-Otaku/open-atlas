import { sortAndTrimDashboardBuffers } from "./sync-dashboard-cache";
import { logDebug } from "./telemetry/log";
import { getUpdateIntervalMs } from "./update-interval.svelte";

function minFlushIntervalMs(): number {
  return getUpdateIntervalMs();
}

let flushRaf = 0;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
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
  if (flushPaused) {
    flushPendingWhilePaused = true;
    return;
  }
  lastFlushAt = performance.now();
  try {
    sortAndTrimDashboardBuffers();
    logDebug("dashboard-flush", "trimmed dashboard buffers");
  } catch (err) {
    console.error("dashboard flush failed; pending data may be lost", err);
  }
}

function scheduleFlushTick(): void {
  const elapsed = performance.now() - lastFlushAt;
  const wait = Math.max(0, minFlushIntervalMs() - elapsed);
  const runSoon = (): void => {
<<<<<<< HEAD

    if (HAS_IDLE_CALLBACK) {
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
=======
    flushRaf = requestAnimationFrame(runFlush);
>>>>>>> 4a07e08 (fix: backoff polling, globe import, reactivity fixes, map defaults)
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
  flushScheduled = false;
}


export function pauseDashboardFlush(): void {
  flushPaused = true;
}

export function resumeDashboardFlush(): void {
  flushPaused = false;
  if (flushPendingWhilePaused) {
    flushPendingWhilePaused = false;
    scheduleDashboardFlush();
  }
}

let visibilityHookInstalled = false;


export function resetDashboardFlushSchedule(): void {
  lastFlushAt = 0;
  cancelScheduledDashboardFlush();
  if (!flushPaused) scheduleDashboardFlush();
}

export function installDashboardFlushVisibilityHook(): () => void {
  if (visibilityHookInstalled || typeof document === "undefined") return () => {};
  visibilityHookInstalled = true;
  const onVis = (): void => {
    if (document.hidden) pauseDashboardFlush();
    else resumeDashboardFlush();
  };
  document.addEventListener("visibilitychange", onVis);
  if (document.hidden) pauseDashboardFlush();
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    visibilityHookInstalled = false;
    if (flushPaused) {
      resumeDashboardFlush();
    }
  };
}
