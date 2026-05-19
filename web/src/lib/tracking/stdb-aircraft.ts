/**
 * ADS-B map glyphs from SpacetimeDB transport events (opensky feed).
 * The browser must not poll OpenSky when live — ingest owns that cadence.
 */
import type { UiEvent } from "../types";
import type { PublicTrackRow } from "./public-tracking";

const MAX_AIR = 200;

export function aircraftRowsFromTransportEvents(
  events: readonly UiEvent[],
): PublicTrackRow[] {
  const out: PublicTrackRow[] = [];
  for (const e of events) {
    if (e.feedSource !== "opensky") continue;
    if (e.domain !== "transport") continue;
    if (!e.location || e.on_ground) continue;
    if (!e.icao24) continue;
    const altM = e.baro_altitude_m ?? 0;
    if (!Number.isFinite(altM) || altM < 0) continue;
    out.push({
      id: `adsb-${e.icao24}`,
      name: (e.callsign || e.icao24).slice(0, 18),
      class: "air",
      lat: e.location.lat,
      lon: e.location.lon,
      hKm: altM / 1000,
      velocityMs:
        typeof e.velocity_mps === "number" && Number.isFinite(e.velocity_mps)
          ? e.velocity_mps
          : undefined,
      trueTrackDeg:
        typeof e.true_track_deg === "number" &&
        Number.isFinite(e.true_track_deg)
          ? e.true_track_deg
          : undefined,
    });
    if (out.length >= MAX_AIR) break;
  }
  return out;
}
