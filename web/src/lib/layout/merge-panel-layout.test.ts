import { describe, expect, test } from "bun:test";
import { mergePanelLayout, reorderBetween } from "./merge-panel-layout";

describe("reorderBetween", () => {
  test("matches move-to-target slot semantics", () => {
    expect(reorderBetween(["a", "b", "c", "d"], "b", "d")).toEqual(["a", "c", "d", "b"]);
    expect(reorderBetween(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });

  test("no-ops when from equals to", () => {
    const o = ["x", "y"] as const;
    expect(reorderBetween(o, "x", "x")).toEqual(["x", "y"]);
  });
});

describe("mergePanelLayout", () => {
  test("fills missing ids from defaults", () => {
    const out = mergePanelLayout({ order: ["b"], spans: {} }, ["a", "b", "c"], {
      a: 1,
      b: 2,
      c: 1,
    });
    expect(out.order).toEqual(["b", "a", "c"]);
  });
});
