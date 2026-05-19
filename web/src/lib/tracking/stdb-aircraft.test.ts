import { describe, expect, it } from "vitest";
import type { UiEvent } from "../types";
import { aircraftRowsFromTransportEvents } from "./stdb-aircraft";

describe("aircraftRowsFromTransportEvents", () => {
  it("maps opensky transport events with location", () => {
    const events: UiEvent[] = [
      {
        id: "1",
        ordinal: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        domain: "transport",
        severity_score: 0.5,
        location: { lat: 37.7, lon: -122.4 },
        feedSource: "opensky",
        icao24: "abc123",
        callsign: "UAL1",
        baro_altitude_m: 10_000,
        velocity_mps: 220,
        true_track_deg: 90,
        on_ground: false,
      },
    ];
    const rows = aircraftRowsFromTransportEvents(events);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("adsb-abc123");
    expect(rows[0]?.hKm).toBeCloseTo(10);
  });

  it("skips non-opensky and on-ground rows", () => {
    const events: UiEvent[] = [
      {
        id: "1",
        ordinal: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        domain: "transport",
        severity_score: 0.5,
        location: { lat: 0, lon: 0 },
        feedSource: "opensky",
        icao24: "x",
        on_ground: true,
      },
      {
        id: "2",
        ordinal: 2,
        timestamp: "2026-01-01T00:00:00.000Z",
        domain: "seismic",
        severity_score: 0.5,
        location: { lat: 0, lon: 0 },
        feedSource: "usgs",
      },
    ];
    expect(aircraftRowsFromTransportEvents(events)).toHaveLength(0);
  });
});
