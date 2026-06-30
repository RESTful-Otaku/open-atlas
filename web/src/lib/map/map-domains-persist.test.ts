import { describe, expect, test } from "bun:test";
import {
  allDomainIds,
  defaultMapDomainSet,
  isMapDomainEnabled,
  mapDomainsActiveLabel,
} from "./map-domains-persist";

describe("map-domains-persist", () => {
  test("defaultMapDomainSet has all domains enabled", () => {
    expect(defaultMapDomainSet().size).toBe(allDomainIds().length);
    expect(allDomainIds().length).toBeGreaterThan(0);
  });

  test("empty set means no domain enabled", () => {
    const none = new Set<string>();
    expect(isMapDomainEnabled(none, allDomainIds()[0]!)).toBe(false);
    expect(mapDomainsActiveLabel(none)).toBe("None");
  });

  test("full set means all enabled", () => {
    const all = new Set(allDomainIds());
    expect(isMapDomainEnabled(all, allDomainIds()[0]!)).toBe(true);
    expect(mapDomainsActiveLabel(all)).toBe("All");
  });
});
