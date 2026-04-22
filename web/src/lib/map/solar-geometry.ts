/**
 * Subsolar point + terminator (great circle) for map overlays.
 * Coarse but stable for day/night UI and timeline scrubbing.
 */

function sinDeg(d: number): number {
  return Math.sin((d * Math.PI) / 180);
}
function cosDeg(d: number): number {
  return Math.cos((d * Math.PI) / 180);
}
function asinDeg(s: number): number {
  return (Math.asin(s) * 180) / Math.PI;
}
function atan2Deg(y: number, x: number): number {
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function norm3(v: [number, number, number]): [number, number, number] {
  const L = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
}

function cross(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Unit ECEF from WGS84 lat / lon (deg). */
function toEcef(φ: number, λ: number): [number, number, number] {
  const cφ = cosDeg(φ);
  return [cφ * cosDeg(λ), cφ * sinDeg(λ), sinDeg(φ)];
}

/**
 * Subsolar lat (declination-ish) and lon for the given instant (UTC).
 * Lon in °E, range ~(-180,180].
 */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const doy = Math.floor(
    (Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    ) -
      Date.UTC(date.getUTCFullYear(), 0, 0)) /
      864e5,
  );
  const g = (2 * Math.PI * (doy - 80)) / 365.25;
  const subLat = 23.45 * Math.sin(g);
  const h =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  let subLon = 180 - 15 * h;
  if (subLon > 180) subLon -= 360;
  if (subLon < -180) subLon += 360;
  return { lat: subLat, lon: subLon };
}

/**
 * Sun at horizon: great circle perpendicular to subsolar direction n.
 */
export function buildTerminatorLine(
  sub: { lat: number; lon: number },
  samples = 256,
): GeoJSON.Feature<GeoJSON.LineString> {
  const n = norm3(toEcef(sub.lat, sub.lon));
  const k: [number, number, number] = [0, 0, 1];
  let a = cross(n, k);
  if (Math.hypot(a[0], a[1], a[2]) < 1e-6) {
    a = cross(n, [0, 1, 0]);
  }
  a = norm3(a);
  const b = norm3(cross(n, a));
  const coords: [number, number][] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = (2 * Math.PI * i) / samples;
    const p: [number, number, number] = [
      a[0] * Math.cos(t) + b[0] * Math.sin(t),
      a[1] * Math.cos(t) + b[1] * Math.sin(t),
      a[2] * Math.cos(t) + b[2] * Math.sin(t),
    ];
    const r = Math.hypot(p[0], p[1], p[2]) || 1;
    const z = p[2] / r;
    const x = p[0] / r;
    const y = p[1] / r;
    coords.push([atan2Deg(y, x), asinDeg(z)]);
  }
  return {
    type: "Feature",
    properties: { kind: "terminator" },
    geometry: { type: "LineString", coordinates: coords },
  };
}

export function buildSunPointFeature(sub: {
  lat: number;
  lon: number;
}): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: "Feature",
    properties: { kind: "subsun" },
    geometry: { type: "Point", coordinates: [sub.lon, sub.lat] },
  };
}
