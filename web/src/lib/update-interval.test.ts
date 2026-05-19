import { describe, expect, test } from "bun:test";
import { UPDATE_INTERVAL_OPTIONS } from "./update-interval-presets";

describe("UPDATE_INTERVAL_OPTIONS", () => {
  test("includes requested cadences", () => {
    const ids = UPDATE_INTERVAL_OPTIONS.map((o) => o.id);
    expect(ids).toContain("1s");
    expect(ids).toContain("5s");
    expect(ids).toContain("30s");
    expect(ids).toContain("1m");
    expect(ids).toContain("5m");
    expect(ids).toContain("10m");
    expect(ids).toContain("30m");
    expect(ids).toContain("1h");
  });

  test("ms values are ordered", () => {
    const ms = UPDATE_INTERVAL_OPTIONS.map((o) => o.ms);
    for (let i = 1; i < ms.length; i++) {
      expect(ms[i]!).toBeGreaterThan(ms[i - 1]!);
    }
  });
});
