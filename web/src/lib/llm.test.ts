import { describe, expect, test, mock, afterAll } from "bun:test";

import { checkLlmBridgePing, checkLlmBridgeCapable } from "./llm";

const originalFetch = globalThis.fetch;

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("checkLlmBridgePing", () => {
  test("returns false when fetch throws (no bridge running)", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("fetch failed")));
    const ok = await checkLlmBridgePing();
    expect(ok).toBe(false);
  });
});

describe("checkLlmBridgeCapable", () => {
  test("returns false when fetch throws (no bridge running)", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("fetch failed")));
    const ok = await checkLlmBridgeCapable();
    expect(ok).toBe(false);
  });
});
