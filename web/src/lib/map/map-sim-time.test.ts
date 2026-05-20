import { describe, expect, test } from "bun:test";
import {
  eventsForMapDisplay,
  eventsInSimWindow,
  mapUses7dFallback,
} from "./map-sim-time";
import type { UiEvent } from "../types";

function ev(id: string, ts: string): UiEvent {
  return {
    id,
    ordinal: 1,
    timestamp: ts,
    domain: "climate",
    severity_score: 0.5,
    location: { lat: 51, lon: 0 },
    temperature_2m: 12,
    wind_speed_10m: 5,
  };
}

describe("map-sim-time", () => {
  test("eventsInSimWindow keeps events in 24h ending at sim instant", () => {
    const sim = Date.parse("2026-04-21T18:00:00Z");
    const inside = ev("a", "2026-04-21T17:00:00Z");
    const outside = ev("b", "2026-04-20T17:00:00Z");
    const future = ev("c", "2026-04-21T19:00:00Z");
    const got = eventsInSimWindow([inside, outside, future], sim);
    expect(got.map((e) => e.id)).toEqual(["a"]);
  });

  test("eventsForMapDisplay anchors 24h on latest cached event before 7d", () => {
    const sim = Date.parse("2026-04-21T18:00:00Z");
    const latest = ev("l", "2026-04-21T10:00:00Z");
    const inAnchor = ev("a", "2026-04-21T09:30:00Z");
    const old = ev("o", "2026-01-01T12:00:00Z");
    const got = eventsForMapDisplay([latest, inAnchor, old], sim);
    expect(got.map((e) => e.id).sort()).toEqual(["a", "l"]);
  });

  test("eventsForMapDisplay falls back to 7d window when 24h and anchor are empty", () => {
    const sim = Date.parse("2026-04-21T18:00:00Z");
    const recent = ev("r", "2026-04-20T12:00:00Z");
    const old = ev("o", "2026-01-01T12:00:00Z");
    const got = eventsForMapDisplay([recent, old], sim);
    expect(got.map((e) => e.id)).toEqual(["r"]);
  });

  test("mapUses7dFallback is false when anchor 24h window has events", () => {
    const sim = Date.parse("2026-04-21T18:00:00Z");
    const latest = ev("l", "2026-04-21T10:00:00Z");
    const inAnchor = ev("a", "2026-04-21T09:00:00Z");
    expect(mapUses7dFallback([latest, inAnchor], sim)).toBe(false);
  });

  test("mapUses7dFallback is true only when 24h and anchor windows are empty", () => {
    const sim = Date.parse("2026-04-08T12:00:00Z");
    const afterSim = ev("s", "2026-04-10T12:00:00Z");
    const in24h = ev("a", "2026-04-08T11:00:00Z");
    expect(mapUses7dFallback([afterSim], sim)).toBe(true);
    expect(mapUses7dFallback([in24h], sim)).toBe(false);
  });
});
