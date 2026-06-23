import type { GlobePathDatum } from "./map-weather-globe";
import type { PublicTrackClass, PublicTrackRow } from "../tracking/public-tracking";
import { getTleWorkList, propagateTleAt } from "../tracking/public-tracking";

const EARTH_R_KM = 6371;
const ALT_SCALE = 4.0;

function altKmToGlobe(hKm: number): number {
  return 0.002 + Math.max(0, (hKm / EARTH_R_KM) * ALT_SCALE);
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

function toDeg(r: number): number {
  return (r * 180) / Math.PI;
}

function greatCircleRad(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const a =
    Math.sin((φ2 - φ1) / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function arcAltitudeForGlobe(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): number {
  const deg = (greatCircleRad(startLat, startLng, endLat, endLng) * 180) / Math.PI;
  const peak = 0.1 + deg * 0.014;
  return Math.max(0.08, Math.min(0.29, peak * 0.5));
}

function interpolateGreatCircle(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  steps: number,
  alt: number,
): [number, number, number][] {
  const φ1 = toRad(lat1);
  const λ1 = toRad(lng1);
  const φ2 = toRad(lat2);
  const λ2 = toRad(lng2);
  const Δσ = greatCircleRad(lat1, lng1, lat2, lng2);
  if (Δσ < 1e-8) {
    return [[lat1, lng1, alt]];
  }
  const out: [number, number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    const A = Math.sin((1 - f) * Δσ) / Math.sin(Δσ);
    const B = Math.sin(f * Δσ) / Math.sin(Δσ);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    out.push([toDeg(Math.atan2(z, Math.hypot(x, y))), toDeg(Math.atan2(y, x)), alt]);
  }
  return out;
}

const PATH_COLORS: Record<PublicTrackClass, string> = {
  sat_leo: "rgba(56, 189, 248, 0.55)",
  sat_geo: "rgba(192, 132, 252, 0.5)",
  air: "rgba(163, 230, 53, 0.62)",
  ship_civ: "rgba(251, 191, 36, 0.55)",
  ship_com: "rgba(52, 211, 153, 0.55)",
  ship_mil: "rgba(249, 115, 22, 0.6)",
};

function pathColor(cls: PublicTrackClass): string {
  return PATH_COLORS[cls];
}

export function buildSatelliteOrbitPaths(when: Date): GlobePathDatum[] {
  const work = getTleWorkList();
  if (!work.length) return [];
  const out: GlobePathDatum[] = [];

  for (const t of work) {
    const isGeo = t.cls === "sat_geo";
    const spanMin = isGeo ? 360 : 96;
    const steps = isGeo ? 64 : 52;
    const stepMs = (spanMin * 60_000) / steps;
    const path: [number, number, number][] = [];

    for (let i = 0; i <= steps; i += 1) {
      const at = new Date(when.getTime() + i * stepMs);
      const p = propagateTleAt(t.name, t.l1, t.l2, at, t.cls, t.id);
      if (!p) continue;
      path.push([p.lat, p.lon, altKmToGlobe(p.hKm)]);
    }
    if (path.length < 4) continue;

    const isStation =
      /ISS|CSS|TIANGONG|HUBBLE|STATION/i.test(t.name) || t.id.startsWith("tle-st-");
    out.push({
      path,
      color: isStation ? "rgba(253, 224, 71, 0.72)" : pathColor(t.cls),
      stroke: isStation ? 0.55 : isGeo ? 0.32 : 0.42,
      dashLength: isGeo ? 0.14 : 0.08,
      dashGap: isGeo ? 0.06 : 0.05,
    });
  }
  return out;
}

export function buildFlightTrailPaths(rows: readonly PublicTrackRow[]): GlobePathDatum[] {
  const out: GlobePathDatum[] = [];
  for (const r of rows) {
    if (r.class !== "air") continue;
    const trackDeg = r.trueTrackDeg;
    const vel = r.velocityMs;
    if (trackDeg == null || !Number.isFinite(trackDeg)) continue;
    const speed = Number.isFinite(vel) && vel! > 20 ? vel! : 220;
    const minutes = 14;
    const distKm = (speed * 60 * minutes) / 1000;
    const distDeg = Math.min(9, distKm / 111);
    const brg = toRad(trackDeg);
    const lat1 = toRad(r.lat);
    const lng1 = toRad(r.lon);
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(distDeg * Math.PI / 180) +
        Math.cos(lat1) * Math.sin(distDeg * Math.PI / 180) * Math.cos(brg),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(brg) * Math.sin(distDeg * Math.PI / 180) * Math.cos(lat1),
        Math.cos(distDeg * Math.PI / 180) - Math.sin(lat1) * Math.sin(lat2),
      );
    const path = interpolateGreatCircle(
      r.lat,
      r.lon,
      toDeg(lat2),
      toDeg(lng2),
      24,
      altKmToGlobe(r.hKm),
    );
    out.push({
      path,
      color: pathColor("air"),
      stroke: 0.38,
      dashLength: 0.12,
      dashGap: 0.08,
    });
  }
  return out;
}

export function buildShipRoutePaths(rows: readonly PublicTrackRow[]): GlobePathDatum[] {
  const out: GlobePathDatum[] = [];
  for (const r of rows) {
    if (!r.class.startsWith("ship")) continue;
    const h = hashStr(r.id);
    const dLat = ((h % 17) - 8) * 0.55;
    const dLon = (((h >> 4) % 23) - 11) * 0.65;
    const destLat = Math.max(-60, Math.min(60, r.lat + dLat));
    const destLon = r.lon + dLon;
    const path = interpolateGreatCircle(r.lat, r.lon, destLat, destLon, 28, 0.0038);
    out.push({
      path,
      color: pathColor(r.class),
      stroke: 0.34,
      dashLength: 0.1,
      dashGap: 0.07,
    });
  }
  return out;
}

export function buildAllTrackingPaths(
  when: Date,
  rows: readonly PublicTrackRow[],
): GlobePathDatum[] {
  return [
    ...buildSatelliteOrbitPaths(when),
    ...buildFlightTrailPaths(rows),
    ...buildShipRoutePaths(rows),
  ];
}

export function trackingPathsToFeatureCollection(
  paths: readonly GlobePathDatum[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: "FeatureCollection",
    features: paths.map((p, i) => ({
      type: "Feature" as const,
      properties: {
        id: `track-path-${i}`,
        color: p.color,
        width: p.stroke,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: p.path.map(([lat, lng]) => [lng, lat] as [number, number]),
      },
    })),
  };
}

export { greatCircleRad };
