import { describe, expect, test } from "bun:test";

import { buildGeoEventIndex } from "./geo-event-index-build";
import type { UiEvent } from "./types";

function event(
  id: string,
  domain: string,
  lat?: number,
  lon?: number,
): UiEvent {
  return {
    id,
    ordinal: 1,
    timestamp: "2026-01-01T00:00:00Z",
    domain,
    severity_score: 0.5,
    location:
      lat !== undefined && lon !== undefined ? { lat, lon } : null,
  };
}

describe("buildGeoEventIndex", () => {
  test("indexes geo events and skips rows without coordinates", () => {
    const events = [
      event("a", "finance", 1, 2),
      event("b", "finance"),
      event("c", "cyber", 3, 4),
    ];
    const idx = buildGeoEventIndex(events, 1);
    expect(idx.geoEvents.length).toBe(2);
    expect(idx.eventById.get("a")?.id).toBe("a");
    expect(idx.byDomain.get("finance")?.length).toBe(1);
    expect(idx.byDomain.get("cyber")?.length).toBe(1);
  });
});
