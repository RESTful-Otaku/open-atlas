import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";

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

type TimeoutEntry = { fn: () => void; ms: number };
let rafCallbacks: Array<() => void> = [];
let idleCallbacks: Array<(deadline: { didTimeout: boolean; timeRemaining: () => number }) => void> = [];
let timeoutMap = new Map<number, TimeoutEntry>();
let timeouts: TimeoutEntry[] = [];
let rafIdCounter = 0;
let idleIdCounter = 0;
let timeoutIdCounter = 0;

const origRaf = globalThis.requestAnimationFrame;
const origCancelRaf = globalThis.cancelAnimationFrame;
const origRic = globalThis.requestIdleCallback;
const origCancelRic = globalThis.cancelIdleCallback;
const origPerf = globalThis.performance;
const origSetTimeout = globalThis.setTimeout;
const origClearTimeout = globalThis.clearTimeout;

function clearAllTimers(): void {
  rafCallbacks = [];
  idleCallbacks = [];
  timeoutMap.clear();
  timeouts = [];
}

let flush: Awaited<ReturnType<typeof import("./dashboard-flush")>>;

beforeEach(async () => {
  clearAllTimers();
  rafIdCounter = 0;
  idleIdCounter = 0;
  timeoutIdCounter = 0;

  // @ts-ignore
  globalThis.requestAnimationFrame = (cb: () => void) => {
    rafIdCounter++;
    rafCallbacks.push(cb);
    return rafIdCounter;
  };
  // @ts-ignore
  globalThis.cancelAnimationFrame = (id: number) => {
    rafCallbacks = [];
    rafIdCounter = 0;
  };
  // @ts-ignore
  globalThis.requestIdleCallback = (cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void, _opts?: { timeout: number }) => {
    idleIdCounter++;
    idleCallbacks.push(cb);
    return idleIdCounter;
  };
  // @ts-ignore
  globalThis.cancelIdleCallback = (id: number) => {
    idleCallbacks = [];
    idleIdCounter = 0;
  };
  // @ts-ignore
  globalThis.performance = { now: () => 10 };
  // @ts-ignore
  globalThis.setTimeout = (fn: () => void, ms: number) => {
    timeoutIdCounter++;
    const entry: TimeoutEntry = { fn, ms };
    timeoutMap.set(timeoutIdCounter, entry);
    timeouts.push(entry);
    return timeoutIdCounter;
  };
  // @ts-ignore
  globalThis.clearTimeout = (id: number) => {
    const entry = timeoutMap.get(id);
    if (entry) {
      timeoutMap.delete(id);
      const idx = timeouts.indexOf(entry);
      if (idx !== -1) timeouts.splice(idx, 1);
    }
  };

  flush = await import("./dashboard-flush");
  flush.cancelScheduledDashboardFlush();
  flush.resumeDashboardFlush();
  flush.cancelScheduledDashboardFlush();
  clearAllTimers();
});

afterEach(() => {
  clearAllTimers();
  globalThis.requestAnimationFrame = origRaf;
  globalThis.cancelAnimationFrame = origCancelRaf;
  globalThis.requestIdleCallback = origRic;
  globalThis.cancelIdleCallback = origCancelRic;
  globalThis.performance = origPerf;
  globalThis.setTimeout = origSetTimeout;
  globalThis.clearTimeout = origClearTimeout;
});

describe("dashboard-flush unit tests", () => {
  test("scheduleDashboardFlush schedules a flush", () => {
    flush.scheduleDashboardFlush();
    expect(timeouts.length).toBeGreaterThanOrEqual(1);
    expect(rafCallbacks.length).toBe(0);
  });

  test("scheduleDashboardFlush is idempotent when already scheduled", () => {
    flush.scheduleDashboardFlush();
    flush.scheduleDashboardFlush();
    flush.scheduleDashboardFlush();
    expect(timeouts.length).toBe(1);
  });

  test("pauseDashboardFlush prevents flush from running", () => {
    flush.pauseDashboardFlush();
    flush.scheduleDashboardFlush();
    expect(timeouts.length).toBe(0);
  });

  test("resumeDashboardFlush after pause triggers a new schedule", () => {
    flush.pauseDashboardFlush();
    flush.scheduleDashboardFlush();
    expect(timeouts.length).toBe(0);

    flush.resumeDashboardFlush();
    expect(timeouts.length).toBeGreaterThanOrEqual(1);
  });

  test("pause + resume cycle preserves pending", () => {
    flush.pauseDashboardFlush();
    flush.scheduleDashboardFlush();
    flush.resumeDashboardFlush();
    expect(timeouts.length).toBeGreaterThanOrEqual(1);
  });

  test("cancelScheduledDashboardFlush clears pending schedule", () => {
    flush.scheduleDashboardFlush();
    expect(timeouts.length).toBe(1);
    flush.cancelScheduledDashboardFlush();
    expect(timeouts.length).toBe(0);
  });

  test("cancelScheduledDashboardFlush is safe when nothing scheduled", () => {
    expect(() => flush.cancelScheduledDashboardFlush()).not.toThrow();
  });

  test("pauseDashboardFlush is idempotent", () => {
    flush.pauseDashboardFlush();
    flush.pauseDashboardFlush();
    flush.pauseDashboardFlush();
    flush.scheduleDashboardFlush();
    expect(timeouts.length).toBe(0);
  });

  test("resumeDashboardFlush is safe when not paused", () => {
    expect(() => flush.resumeDashboardFlush()).not.toThrow();
  });

  test("resetDashboardFlushSchedule resets lastFlushAt and re-schedules", () => {
    flush.pauseDashboardFlush();
    flush.resetDashboardFlushSchedule();
    expect(timeouts.length).toBe(0);

    clearAllTimers();
    flush.resumeDashboardFlush();
    clearAllTimers();

    flush.scheduleDashboardFlush();
    expect(timeouts.length).toBeGreaterThanOrEqual(1);
  });

  test("multiple pause/resume cycles are safe", () => {
    for (let i = 0; i < 3; i++) {
      flush.pauseDashboardFlush();
      flush.resumeDashboardFlush();
    }
    flush.scheduleDashboardFlush();
    expect(timeouts.length).toBeGreaterThanOrEqual(1);
  });
});
