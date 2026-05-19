import { describe, expect, it } from "vitest";

import {
  CLIENT_NARRATIVE_SEVERITY_THRESHOLD,
  resolveEventNarrative,
  synthesizeEventNarrative,
} from "./event-narrative-fallback";
import type { UiEvent } from "./types";

const sampleEvent: UiEvent = {
  id: "42",
  ordinal: 7,
  timestamp: "2026-05-19T12:00:00.000Z",
  domain: "energy",
  severity_score: 0.72,
  location: { lat: 40.1, lon: -74.2, region_tags: [] },
  feedSource: "eia",
};

describe("event-narrative-fallback", () => {
  it("synthesizes inference and disruptions for moderate+ events", () => {
    const n = synthesizeEventNarrative(sampleEvent, {
      domain: "energy",
      trend: "up",
      anomaly_count_recent: 2,
      dominant_source: "eia",
      source_link: null,
      narrative: "",
      updated_at: sampleEvent.timestamp,
    });
    expect(n.headline).toContain("Energy");
    expect(n.inference.length).toBeGreaterThan(10);
    expect(n.predicted_disruption.length).toBeGreaterThan(0);
  });

  it("resolve prefers stored row over synthesis", () => {
    const stored = {
      "42": {
        event_id: "42",
        headline: "Stored",
        summary: "S",
        inference: "I",
        predicted_disruption: [],
        updated_at: sampleEvent.timestamp,
      },
    };
    const n = resolveEventNarrative(sampleEvent, stored, null);
    expect(n?.headline).toBe("Stored");
  });

  it("resolve returns null below severity threshold", () => {
    const low: UiEvent = { ...sampleEvent, severity_score: 0.2 };
    expect(
      resolveEventNarrative(low, {}, null),
    ).toBeNull();
    expect(CLIENT_NARRATIVE_SEVERITY_THRESHOLD).toBe(0.5);
  });
});
