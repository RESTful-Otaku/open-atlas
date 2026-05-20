import { describe, expect, test } from "bun:test";
import { defaultMapDomainSet, allDomainIds } from "./map-domains-persist";

describe("map-domains-persist", () => {
  test("defaultMapDomainSet is empty (no domain filter — map shows all domains)", () => {
    expect(defaultMapDomainSet().size).toBe(0);
    expect(allDomainIds().length).toBeGreaterThan(0);
  });
});
