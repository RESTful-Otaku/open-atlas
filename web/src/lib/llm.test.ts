import { describe, expect, test } from "bun:test";

import { checkLlmBridgePing, checkLlmBridgeCapable } from "./llm";

describe("checkLlmBridgePing", () => {
  test("returns false when fetch throws (no bridge running)", async () => {
    const ok = await checkLlmBridgePing();
    expect(ok).toBe(false);
  });
});

describe("checkLlmBridgeCapable", () => {
  test("returns false when fetch throws (no bridge running)", async () => {
    const ok = await checkLlmBridgeCapable();
    expect(ok).toBe(false);
  });
});
