import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";

// @ts-ignore
globalThis.$state = (init: unknown) => init;

let storage: Record<string, string>;
let htmlDataset: Record<string, string>;
let metaContent: string;
let lastDispatched: string | null;

beforeEach(() => {
  storage = {};
  htmlDataset = {};
  metaContent = "";
  lastDispatched = null;

  const mockStorage = {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
  };

  // @ts-ignore
  globalThis.localStorage = mockStorage;
  // @ts-ignore
  globalThis.window = {
    localStorage: mockStorage,
    dispatchEvent: (ev: Event) => {
      lastDispatched = (ev as CustomEvent).detail ?? null;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  // @ts-ignore
  globalThis.document = {
    documentElement: {
      dataset: htmlDataset,
      style: {},
    },
    querySelector: () => ({
      setAttribute: (attr: string, val: string) => {
        if (attr === "content") metaContent = val;
      },
    }),
  } as unknown as Document;
});

afterEach(() => {
  // @ts-ignore
  delete globalThis.localStorage;
  // @ts-ignore
  delete globalThis.window;
  // @ts-ignore
  delete globalThis.document;
  storage = {};
  htmlDataset = {};
  metaContent = "";
  lastDispatched = null;
});

describe("theme", () => {
  test("readStoredTheme returns stored theme when valid", async () => {
    storage["openatlas-theme"] = "light";
    const { readStoredTheme } = await import("./theme.svelte");
    expect(readStoredTheme()).toBe("light");
  });

  test("readStoredTheme returns dark for invalid stored value", async () => {
    storage["openatlas-theme"] = "invalid";
    const { readStoredTheme } = await import("./theme.svelte");
    expect(readStoredTheme()).toBe("dark");
  });

  test("readStoredTheme returns dark when no theme stored", async () => {
    const { readStoredTheme } = await import("./theme.svelte");
    expect(readStoredTheme()).toBe("dark");
  });

  test("readStoredTheme guards against missing window", async () => {
    // @ts-ignore
    delete globalThis.window;
    const { readStoredTheme } = await import("./theme.svelte");
    expect(readStoredTheme()).toBe("dark");
  });

  test("applyTheme sets dataset and color-scheme", async () => {
    const { applyTheme } = await import("./theme.svelte");
    applyTheme("light");
    expect(htmlDataset["theme"]).toBe("light");

    applyTheme("dark");
    expect(htmlDataset["theme"]).toBe("dark");

    applyTheme("dim");
    expect(htmlDataset["theme"]).toBe("dim");
  });

  test("applyTheme sets theme-color meta", async () => {
    const { applyTheme } = await import("./theme.svelte");
    applyTheme("light");
    expect(metaContent).toBe("#f4f4f5");

    applyTheme("dim");
    expect(metaContent).toBe("#141418");

    applyTheme("dark");
    expect(metaContent).toBe("#0a0c10");
  });

  test("applyTheme dispatches a custom event", async () => {
    const { applyTheme } = await import("./theme.svelte");
    applyTheme("light");
    expect(lastDispatched).toBe("light");
  });

  test("setTheme persists to localStorage and applies", async () => {
    const { setTheme } = await import("./theme.svelte");
    setTheme("dim");
    expect(storage["openatlas-theme"]).toBe("dim");
    expect(htmlDataset["theme"]).toBe("dim");
  });

  test("setTheme does not throw when localStorage is unavailable", async () => {
    // @ts-ignore
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => { throw new Error("quota"); },
    };
    // @ts-ignore
    globalThis.window.localStorage = globalThis.localStorage;
    const { setTheme } = await import("./theme.svelte");
    expect(() => setTheme("light")).not.toThrow();
  });

  test("initTheme reads stored, applies, and returns the theme", async () => {
    storage["openatlas-theme"] = "light";
    const { initTheme } = await import("./theme.svelte");
    const result = initTheme();
    expect(result).toBe("light");
    expect(htmlDataset["theme"]).toBe("light");
  });

  test("initTheme defaults to dark when nothing stored", async () => {
    const { initTheme } = await import("./theme.svelte");
    expect(initTheme()).toBe("dark");
  });

  test("THEME_OPTIONS has expected shape", async () => {
    const { THEME_OPTIONS } = await import("./theme.svelte");
    expect(THEME_OPTIONS).toHaveLength(3);
    expect(THEME_OPTIONS[0].id).toBe("dark");
    expect(THEME_OPTIONS[1].id).toBe("dim");
    expect(THEME_OPTIONS[2].id).toBe("light");
    for (const opt of THEME_OPTIONS) {
      expect(opt).toHaveProperty("id");
      expect(opt).toHaveProperty("label");
      expect(opt).toHaveProperty("description");
    }
  });
});
