import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";

describe("probe-fetch", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("probeFetch calls fetch with AbortSignal.timeout", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("ok", { status: 200 });
    });

    const { probeFetch } = await import("./probe-fetch");
    const resp = await probeFetch("http://example.com/test");
    expect(resp.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  test("probeFetch passes through init options", async () => {
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "X-Test": "1" });
      return new Response("ok", { status: 200 });
    });

    const { probeFetch } = await import("./probe-fetch");
    await probeFetch("http://example.com/test", {
      method: "POST",
      headers: { "X-Test": "1" },
    });
  });

  test("probeFetch uses custom timeout", async () => {
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("ok", { status: 200 });
    });

    const { probeFetch } = await import("./probe-fetch");
    await probeFetch("http://example.com/test", {}, 5_000);
  });

  test("probeFetch passes URL object as input", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe("http://example.com/path");
      return new Response("ok", { status: 200 });
    });

    const { probeFetch } = await import("./probe-fetch");
    await probeFetch(new URL("http://example.com/path"));
  });
});
