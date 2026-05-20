import { describe, expect, test } from "bun:test";

import {
  formatCompactNumber,
  formatFullNumber,
  shouldCompact,
} from "./format-compact-number";

describe("formatCompactNumber", () => {
  test("examples from spec", () => {
    expect(formatCompactNumber(999)).toEqual({ display: "999", raw: "999" });
    expect(formatCompactNumber(1100)).toEqual({ display: "1.1k", raw: "1,100" });
    expect(formatCompactNumber(11100)).toEqual({ display: "11.1k", raw: "11,100" });
    expect(formatCompactNumber(111100)).toEqual({
      display: "111.1k",
      raw: "111,100",
    });
    expect(formatCompactNumber(1110000)).toEqual({
      display: "1.11m",
      raw: "1,110,000",
    });
    expect(formatCompactNumber(1110000000)).toEqual({
      display: "1.11b",
      raw: "1,110,000,000",
    });
  });

  test("threshold boundary", () => {
    expect(formatCompactNumber(1000)).toEqual({ display: "1.0k", raw: "1,000" });
    expect(shouldCompact(999)).toBe(false);
    expect(shouldCompact(1000)).toBe(true);
  });

  test("negatives mirror positives", () => {
    expect(formatCompactNumber(-1100)).toEqual({
      display: "-1.1k",
      raw: "-1,100",
    });
    expect(formatCompactNumber(-1110000)).toEqual({
      display: "-1.11m",
      raw: "-1,110,000",
    });
  });

  test("non-finite values", () => {
    expect(formatCompactNumber(Number.NaN)).toEqual({ display: "—", raw: "—" });
    expect(formatCompactNumber(Number.POSITIVE_INFINITY)).toEqual({
      display: "—",
      raw: "—",
    });
    expect(formatCompactNumber(Number.NEGATIVE_INFINITY)).toEqual({
      display: "—",
      raw: "—",
    });
    expect(shouldCompact(Number.NaN)).toBe(false);
  });

  test("raw string for hover tooltip", () => {
    expect(formatCompactNumber(111100).raw).toBe("111,100");
    expect(formatCompactNumber(1110000000).raw).toBe("1,110,000,000");
  });
});

describe("formatFullNumber", () => {
  test("locale grouping", () => {
    expect(formatFullNumber(111100)).toBe("111,100");
    expect(formatFullNumber(1110000000)).toBe("1,110,000,000");
  });

  test("non-finite", () => {
    expect(formatFullNumber(Number.NaN)).toBe("—");
  });
});
