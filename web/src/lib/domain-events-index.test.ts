import { describe, expect, test } from "bun:test";
import { buildEventsByDomain } from "./domain-events-index";
import type { UiEvent } from "./types";

describe("buildEventsByDomain", () => {
  test("groups events by domain id", () => {
    const events: UiEvent[] = [
      {
        id: "a",
        ordinal: 1,
        domain: "energy",
        severity_score: 0.5,
        timestamp: "2020-01-01T00:00:00Z",
        location: null,
      },
      {
        id: "b",
        ordinal: 2,
        domain: "transport",
        severity_score: 0.6,
        timestamp: "2020-01-01T01:00:00Z",
        location: null,
      },
      {
        id: "c",
        ordinal: 3,
        domain: "energy",
        severity_score: 0.7,
        timestamp: "2020-01-01T02:00:00Z",
        location: null,
      },
    ];
    const map = buildEventsByDomain(events);
    expect(map.get("energy")).toHaveLength(2);
    expect(map.get("transport")).toHaveLength(1);
    expect(map.get("cyber")).toBeUndefined();
  });
});
