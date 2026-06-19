import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";

// @ts-ignore
globalThis.$state = (init: unknown) => init;

let currentHash = "#/";
let hashChangeHandler: (() => void) | null = null;

beforeEach(() => {
  currentHash = "#/";
  hashChangeHandler = null;
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
});

afterEach(() => {
  // @ts-ignore
  delete globalThis.window;
  currentHash = "#/";
  hashChangeHandler = null;
});

describe("router", () => {
  test('matchPath matches "/"', async () => {
    const { matchPath } = await import("./router.svelte");
    const m = matchPath("/");
    expect(m.pattern).toBe("/");
    expect(m.params).toEqual({});
    expect(m.path).toBe("/");
  });

  test("matchPath matches hub", async () => {
    const { matchPath } = await import("./router.svelte");
    const m = matchPath("/hub");
    expect(m.pattern).toBe("/hub");
    expect(m.params).toEqual({});
  });

  test("matchPath captures params from /events/:id", async () => {
    const { matchPath } = await import("./router.svelte");
    const m = matchPath("/events/42");
    expect(m.pattern).toBe("/events/:id");
    expect(m.params).toEqual({ id: "42" });
    expect(m.path).toBe("/events/42");
  });

  test("matchPath captures params from /matrix/:id", async () => {
    const { matchPath } = await import("./router.svelte");
    const m = matchPath("/matrix/energy");
    expect(m.pattern).toBe("/matrix/:id");
    expect(m.params).toEqual({ id: "energy" });
  });

  test("matchPath returns home route for unknown path", async () => {
    const { matchPath } = await import("./router.svelte");
    const m = matchPath("/nonexistent/route");
    expect(m.pattern).toBe("/");
  });

  test("matchPath matches domain desks", async () => {
    const { matchPath } = await import("./router.svelte");
    const m = matchPath("/domain/energy");
    expect(m.pattern).toBe("/domain/energy");
  });

  test("matchPath does not match /domain/invalid (not in DOMAIN_CATALOG)", async () => {
    const { matchPath } = await import("./router.svelte");
    const m = matchPath("/domain/nonexistent");
    expect(m.pattern).toBe("/");
  });

  test("matchPath matches health", async () => {
    const { matchPath } = await import("./router.svelte");
    expect(matchPath("/health").pattern).toBe("/health");
  });

  test("matchPath matches settings", async () => {
    const { matchPath } = await import("./router.svelte");
    expect(matchPath("/settings").pattern).toBe("/settings");
  });

  test("matchPath returns home for empty string", async () => {
    const { matchPath } = await import("./router.svelte");
    const m = matchPath("");
    expect(m.pattern).toBe("/");
  });

  test("applyRoute updates router.match", async () => {
    const { applyRoute, router } = await import("./router.svelte");
    const result = applyRoute("/settings");
    expect(result.pattern).toBe("/settings");
    expect(router.match.pattern).toBe("/settings");
  });

  test("applyRoute normalizes path", async () => {
    const { applyRoute, router } = await import("./router.svelte");
    applyRoute("settings");
    expect(router.match.pattern).toBe("/settings");
  });

  test("navigate updates location hash", async () => {
    const { navigate } = await import("./router.svelte");
    navigate("/settings");
    expect(currentHash).toBe("#/settings");
  });

  test("navigate sets empty hash to root", async () => {
    const { navigate } = await import("./router.svelte");
    navigate("/");
    expect(currentHash).toBe("#/");
  });

  test("navigate does not throw for home route", async () => {
    const { navigate } = await import("./router.svelte");
    expect(() => navigate("/")).not.toThrow();
  });

  test("ROUTE_TABLE includes expected routes", async () => {
    const { ROUTE_TABLE } = await import("./router.svelte");
    expect(ROUTE_TABLE.includes("/")).toBe(true);
    expect(ROUTE_TABLE.includes("/hub")).toBe(true);
    expect(ROUTE_TABLE.includes("/viz")).toBe(true);
    expect(ROUTE_TABLE.includes("/map")).toBe(true);
    expect(ROUTE_TABLE.includes("/health")).toBe(true);
    expect(ROUTE_TABLE.includes("/settings")).toBe(true);
    expect(ROUTE_TABLE.includes("/entities")).toBe(true);
    expect(ROUTE_TABLE.includes("/legacy")).toBe(true);
    expect(ROUTE_TABLE.includes("/events/:id")).toBe(true);
    expect(ROUTE_TABLE.includes("/matrix/:id")).toBe(true);
    expect(ROUTE_TABLE.includes("/domain/energy")).toBe(true);
  });

  test("installRouter returns a teardown function", async () => {
    const { installRouter } = await import("./router.svelte");
    const teardown = installRouter();
    expect(typeof teardown).toBe("function");
    teardown();
  });
});
