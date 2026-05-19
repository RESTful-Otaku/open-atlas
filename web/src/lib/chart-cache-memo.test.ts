import { describe, expect, test } from "bun:test";

import { memoByRevisions } from "./chart-cache-memo";

describe("memoByRevisions", () => {
  test("reuses cache when revision keys match", () => {
    let builds = 0;
    const first = memoByRevisions(null, 1, 0, () => {
      builds += 1;
      return { series: [] };
    });
    const second = memoByRevisions(first.entry, 1, 0, () => {
      builds += 1;
      return { series: [{ type: "bar" }] };
    });
    expect(second.option).toBe(first.option);
    expect(builds).toBe(1);
  });

  test("rebuilds when revision changes", () => {
    let builds = 0;
    const first = memoByRevisions(null, 1, 0, () => {
      builds += 1;
      return { series: [] };
    });
    memoByRevisions(first.entry, 2, 0, () => {
      builds += 1;
      return { series: [] };
    });
    expect(builds).toBe(2);
  });
});
