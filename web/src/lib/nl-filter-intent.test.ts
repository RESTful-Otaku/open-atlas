import { describe, expect, test } from "bun:test";

import { parseNlFilterIntent } from "./nl-filter-parse";

describe("parseNlFilterIntent", () => {
  test("parses domain and hours", () => {
    const i = parseNlFilterIntent("finance last 6h");
    expect(i?.domain).toBe("finance");
    expect(i?.hours).toBe(6);
    expect(i?.label).toContain("finance");
  });

  test("parses domain only", () => {
    expect(parseNlFilterIntent("energy")?.domain).toBe("energy");
  });

  test("clear filter", () => {
    const i = parseNlFilterIntent("clear filter");
    expect(i?.domain).toBeNull();
    expect(i?.label).toContain("Clear");
  });

  test("rejects unknown phrase", () => {
    expect(parseNlFilterIntent("show me everything weird")).toBeNull();
  });
});
