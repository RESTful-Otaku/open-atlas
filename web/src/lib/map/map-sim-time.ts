/**
 * Map/globe projections keyed to the simulated UTC scrubber (24h window).
 */
import type { UiEvent } from "../types";

const MS_24H = 86_400_000;
const MS_7D = 7 * MS_24H;

export function parseEventMs(timestamp: string): number | null {
  const t = Date.parse(timestamp);
  return Number.isFinite(t) ? t : null;
}

/** Events with timestamp in (simUtc − 24h, simUtc] — historical replay window. */
export function eventsInSimWindow(
  events: readonly UiEvent[],
  simUtcMs: number,
  windowMs = MS_24H,
): UiEvent[] {
  const end = simUtcMs;
  const start = end - windowMs;
  const out: UiEvent[] = [];
  for (const e of events) {
    const t = parseEventMs(e.timestamp);
    if (t === null) continue;
    if (t > start && t <= end) out.push(e);
  }
  return out;
}

/** Latest parseable event timestamp in the buffer, or null. */
export function latestEventMs(events: readonly UiEvent[]): number | null {
  let latest = -Infinity;
  for (const e of events) {
    const t = parseEventMs(e.timestamp);
    if (t !== null && t > latest) latest = t;
  }
  return latest > -Infinity ? latest : null;
}

/**
 * Events for map/globe layers: 24h replay window ending at the scrub instant.
 * When empty at “now”, anchors a 24h window on the newest cached event (demo /
 * lagging feeds) before widening to 7d.
 */
export function eventsForMapDisplay(
  events: readonly UiEvent[],
  simUtcMs: number,
): UiEvent[] {
  const windowed = eventsInSimWindow(events, simUtcMs);
  if (windowed.length > 0) return windowed;

  const latest = latestEventMs(events);
  if (latest !== null && simUtcMs >= latest - MS_24H) {
    const anchored = eventsInSimWindow(events, latest);
    if (anchored.length > 0) return anchored;
  }

  const end = simUtcMs;
  const start = end - MS_7D;
  const wider: UiEvent[] = [];
  for (const e of events) {
    const t = parseEventMs(e.timestamp);
    if (t === null) continue;
    if (t > start && t <= end) wider.push(e);
  }
  return wider;
}

/** True when the 7-day sparse-data fallback is active (no 24h window at scrub or anchor). */
export function mapUses7dFallback(
  events: readonly UiEvent[],
  simUtcMs: number,
): boolean {
  if (eventsInSimWindow(events, simUtcMs).length > 0) return false;
  const latest = latestEventMs(events);
  if (
    latest !== null &&
    simUtcMs >= latest - MS_24H &&
    eventsInSimWindow(events, latest).length > 0
  ) {
    return false;
  }
  return true;
}

/** 0 at window start → 1 at sim instant (for optional fade). */
export function eventAge01(timestamp: string, simUtcMs: number, windowMs = MS_24H): number {
  const t = parseEventMs(timestamp);
  if (t === null) return 0;
  const start = simUtcMs - windowMs;
  if (t <= start) return 0;
  if (t >= simUtcMs) return 1;
  return (t - start) / (simUtcMs - start);
}

export type ClimateWeatherPoint = {
  lat: number;
  lon: number;
  tempC: number;
  windMs: number;
};

/** Open-Meteo climate events in the sim window for weather heat / wind styling. */
export function climateWeatherPoints(
  events: readonly UiEvent[],
  simUtcMs: number,
): ClimateWeatherPoint[] {
  const windowed = eventsForMapDisplay(events, simUtcMs);
  const out: ClimateWeatherPoint[] = [];
  for (const e of windowed) {
    if (e.domain !== "climate" || !e.location) continue;
    const temp =
      typeof e.temperature_2m === "number" && Number.isFinite(e.temperature_2m)
        ? e.temperature_2m
        : null;
    const wind =
      typeof e.wind_speed_10m === "number" && Number.isFinite(e.wind_speed_10m)
        ? e.wind_speed_10m
        : 0;
    if (temp === null) continue;
    out.push({
      lat: e.location.lat,
      lon: e.location.lon,
      tempC: temp,
      windMs: wind,
    });
  }
  return out;
}

export function climateWeatherFeatureCollection(
  points: readonly ClimateWeatherPoint[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: points.map((p, i) => ({
      type: "Feature",
      id: i,
      properties: { temp: p.tempC, wind: p.windMs },
      geometry: {
        type: "Point",
        coordinates: [p.lon, p.lat],
      },
    })),
  };
}
