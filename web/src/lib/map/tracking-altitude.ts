/**
 * globe.gl `pointAltitude` in globe-radius units — modest lift above surface
 * (no pillar spikes). Altitude in km informs class separation.
 */
import type { PublicTrackClass } from "../tracking/public-tracking";

const EARTH_R_KM = 6371;
const SURF = 0.006;

export function trackingAltitudeGlobeUnits(
  hKm: number,
  cls: PublicTrackClass,
): number {
  const h = Math.max(0, hKm);
  if (cls === "air") {
    const lift = Math.min(12, h) / EARTH_R_KM;
    return SURF + lift * 0.55 + 0.004;
  }
  if (cls === "sat_geo") {
    return SURF + 0.032;
  }
  if (cls.startsWith("sat")) {
    const lift = Math.min(2000, h) / EARTH_R_KM;
    return SURF + 0.006 + lift * 0.35;
  }
  return SURF + 0.003;
}
