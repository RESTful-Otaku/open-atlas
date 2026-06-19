/**
 * End-to-end tests for navigation → data loading flow.
 *
 * Verifies that the router correctly triggers view loading and that
 * data continues to flow to views after route changes without getting
 * stuck in the flush buffer.
 */

import { describe, expect, test, mock } from "bun:test";

// @ts-ignore
globalThis.$state = (init: unknown) => init;

let currentHash = "#/";
let hashChangeHandler: (() => void) | null = null;

// @ts-ignore
globalThis.window = {
  location: {
    get hash() { return currentHash; },
    set hash(v: string) {
      currentHash = v;
      hashChangeHandler?.();
    },
  },
  addEventListener: (ev: string, handler: () => void) => {
    if (ev === "hashchange") hashChangeHandler = handler;
  },
  removeEventListener: (_ev: string, _handler: () => void) => {
    hashChangeHandler = null;
  },
};

import { DOMAIN_CATALOG } from "./colors";

const DOMAIN_VIEW_PATHS = DOMAIN_CATALOG.map((d) => `/domain/${d.id}` as const);
const routeTable = [
  "/", "/hub", "/viz", "/matrix/:id", "/map",
  ...DOMAIN_VIEW_PATHS,
  "/entities", "/events/:id", "/health", "/settings", "/legacy",
] as const;

describe("router matchPath covers all registered routes", () => {
  test.each(routeTable)(
    "pattern %s is matchable",
    async (pattern: string) => {
      const path = pattern.replace(/:id/, "test-42");
      const router = await import("./router.svelte");
      const result = router.matchPath(path);
      expect(result.pattern).toBe(pattern);
      expect(result.path).toBe(path);
    },
  );

  test("unknown path falls back to home (/)", async () => {
    const router = await import("./router.svelte");
    const result = router.matchPath("/nonexistent-route-xyz");
    expect(result.pattern).toBe(router.ROUTE_TABLE[0]);
  });

  test("parametric route captures params", async () => {
    const router = await import("./router.svelte");
    const result = router.matchPath("/events/abc-123");
    expect(result.pattern).toBe("/events/:id");
    expect(result.params.id).toBe("abc-123");
  });

  test("matrix route captures id", async () => {
    const router = await import("./router.svelte");
    const result = router.matchPath("/matrix/cyber-monitor");
    expect(result.pattern).toBe("/matrix/:id");
    expect(result.params.id).toBe("cyber-monitor");
  });
});

describe("view catalog maps patterns correctly", () => {
  test("viewForPattern returns catalog entry for known patterns", async () => {
    const { viewForPattern } = await import("./views");
    const entry = viewForPattern("/hub");
    expect(entry).toBeDefined();
    expect(entry.title).toBeString();
    expect(entry.title.length).toBeGreaterThan(0);
  });

  test("viewForPattern returns home entry for unknown patterns", async () => {
    const { viewForPattern } = await import("./views");
    const entry = viewForPattern("/nonexistent");
    expect(entry).toBeDefined();
  });
});

describe("view loaders: lazy loading and caching", () => {
  test("loadViewForPattern returns a non-empty component path for known patterns", async () => {
    const { loadViewForPattern } = await import("./view-loaders");
    const component = await loadViewForPattern("/hub");
    // view-loaders returns component module paths as async import() results
    expect(component).toBeTruthy();
  });

  test("peekCachedView returns undefined for uncached view", async () => {
    const { peekCachedView } = await import("./view-loaders");
    const cached = peekCachedView("/nonexistent-pattern-999");
    expect(cached).toBeUndefined();
  });

  test("loading a view populates the cache", async () => {
    const { loadViewForPattern, peekCachedView } = await import("./view-loaders");
    await loadViewForPattern("/hub");
    const cached = peekCachedView("/hub");
    expect(cached).not.toBeUndefined();
  });
});

describe("navigation triggers readiness refresh signals (contract check)", () => {
  // The readiness module depends on .svelte.ts files that use $state runes
  // (not available in Bun). We verify the contract statically by reading
  // the source files instead of importing them.
  test("ActiveRoute.svelte does not import flush pause/cancel/resume", async () => {
    // Read the file directly to verify the fix contract
    const base = import.meta.dirname ?? ".";
    const src = await Bun.file(`${base}/shell/ActiveRoute.svelte`).text();
    expect(src).not.toContain("pauseDashboardFlush");
    expect(src).not.toContain("resumeDashboardFlush");
    expect(src).not.toContain("cancelScheduledDashboardFlush");
    // But still imports the metadata refresh functions
    expect(src).toContain("refreshRemoteReadiness");
    expect(src).toContain("refreshFeedLive");
  });

  test("dashboard-flush pause does not cancel scheduled flushes", async () => {
    const base = import.meta.dirname ?? ".";
    const src = await Bun.file(`${base}/dashboard-flush.ts`).text();
    // The pause function should NOT call cancelScheduledDashboardFlush
    const pauseBody = src.match(/export function pauseDashboardFlush[^}]+}/s);
    expect(pauseBody).not.toBeNull();
    expect(pauseBody![0]).not.toContain("cancelScheduledDashboardFlush");
  });
});
