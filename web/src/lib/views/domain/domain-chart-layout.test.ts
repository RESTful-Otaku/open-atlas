import { describe, expect, test } from "bun:test";

import {
  cycleSpan,
  defaultLayout,
  parseLayoutJson,
  reconcileLayout,
  reorderOrder,
  spanForIndex,
  LAYOUT_STORAGE_VERSION,
} from "./domain-chart-layout";

describe("domain-chart-layout", () => {
  test("reorderOrder moves items by display index", () => {
    expect(reorderOrder([0, 1, 2, 3], 0, 2)).toEqual([1, 2, 0, 3]);
    expect(reorderOrder([2, 0, 1], 1, 0)).toEqual([0, 2, 1]);
  });

  test("cycleSpan rotates 1 → 2 → 3 → 1", () => {
    expect(cycleSpan(1)).toBe(2);
    expect(cycleSpan(2)).toBe(3);
    expect(cycleSpan(3)).toBe(1);
  });

  test("reconcileLayout appends missing panel indices", () => {
    const stored = {
      version: LAYOUT_STORAGE_VERSION,
      order: Object.freeze([1, 0]),
      spanByIndex: Object.freeze({ 0: 2 as const }),
    };
    const r = reconcileLayout(stored, 4);
    expect(r.order).toEqual([1, 0, 2, 3]);
    expect(spanForIndex(r, 0)).toBe(2);
    expect(spanForIndex(r, 1)).toBe(1);
  });

  test("defaultLayout is identity order with empty spans", () => {
    const d = defaultLayout(3);
    expect([...d.order]).toEqual([0, 1, 2]);
    expect(spanForIndex(d, 0)).toBe(1);
  });

  test("parseLayoutJson rejects bad payloads", () => {
    expect(parseLayoutJson(null)).toBeNull();
    expect(parseLayoutJson("{")).toBeNull();
    expect(parseLayoutJson(JSON.stringify({ version: 99, order: [0] }))).toBeNull();
  });
});
