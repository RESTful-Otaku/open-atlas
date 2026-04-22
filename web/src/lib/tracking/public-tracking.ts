/**
 * Public, read-only “live” tracking: NORAD TLEs (Celestrak) + OpenSky (ADS-B) +
 * bundled maritime sample positions. This is a visualization layer only; coverage
 * and license limits apply to each source.
 */
import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
  type SatRec,
} from "satellite.js";
import type { GlobeEventPoint } from "../map/three-globe-data";

export type PublicTrackClass =
  | "sat_leo"
  | "sat_geo"
  | "air"
  | "ship_civ"
  | "ship_com"
  | "ship_mil";

const COLORS: Record<PublicTrackClass, string> = {
  sat_leo: "rgba(56, 189, 248, 0.92)",
  sat_geo: "rgba(192, 132, 252, 0.92)",
  air: "rgba(163, 230, 53, 0.9)",
  ship_civ: "rgba(251, 191, 36, 0.9)",
  ship_com: "rgba(52, 211, 153, 0.9)",
  ship_mil: "rgba(249, 115, 22, 0.9)",
};

const EARTH_R_KM = 6371;
/** Exaggerate altitude above the globe surface for visibility. */
const ALT_SCALE = 4.0;

const MAX_SATS = 90;
const MAX_AIR = 200;

type ShipJson = { id: string; name: string; class: string; lat: number; lon: number };

export type PublicTrackRow = {
  id: string;
  name: string;
  class: PublicTrackClass;
  lat: number;
  lon: number;
  hKm: number;
};

type TleWork = {
  name: string;
  l1: string;
  l2: string;
  cls: PublicTrackClass;
  id: string;
};

let tleWorkList: TleWork[] | null = null;
let shipCache: PublicTrackRow[] | null = null;

function parseTleFile(text: string, max: number): { name: string; l1: string; l2: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const out: { name: string; l1: string; l2: string }[] = [];
  for (let i = 0; i < lines.length - 2; i += 1) {
    if (out.length >= max) break;
    const a = lines[i];
    const b = lines[i + 1];
    const c = lines[i + 2];
    if (b?.startsWith("1 ") && c?.startsWith("2 ")) {
      out.push({ name: a || "NORAD", l1: b, l2: c });
      i += 2;
    }
  }
  return out;
}

function geoHint(name: string, line2: string): "geo" | "leo" {
  const n = name.toUpperCase();
  if (n.includes("GEO") || n.includes("SYNC")) return "geo";
  const inc = parseFloat(line2.slice(8, 16).trim());
  if (Number.isFinite(inc) && inc < 2.0) return "geo";
  return "leo";
}

function propagateOne(
  name: string,
  l1: string,
  l2: string,
  when: Date,
  cls: PublicTrackClass,
  id: string,
):
  | { lat: number; lon: number; hKm: number; kind: PublicTrackClass; id: string; name: string }
  | null {
  let satrec: SatRec;
  try {
    satrec = twoline2satrec(l1, l2);
  } catch {
    return null;
  }
  const pi = propagate(satrec, when);
  if (typeof pi.position === "boolean" || !pi.position) return null;
  try {
    const g = gstime(when);
    const ge = eciToGeodetic(pi.position, g);
    const lat = degreesLat(ge.latitude);
    const lon = degreesLong(ge.longitude);
    const hKm = ge.height;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(hKm)) return null;
    if (hKm < -2 || hKm > 1e5) return null;
    return { lat, lon, hKm, kind: cls, id, name };
  } catch {
    return null;
  }
}

/** Build the NORAD TLE work list once (Celestrak-bundled assets under `/public/tracking/`). */
export async function ensureTleCache(): Promise<void> {
  if (tleWorkList) return;
  const b = import.meta.env.BASE_URL;
  const [stations, geo, leo] = await Promise.all([
    fetch(`${b}tracking/stations.txt`).then((r) => r.text()),
    fetch(`${b}tracking/geo-trim.tle`).then((r) => r.text()),
    fetch(`${b}tracking/active-leo-sample.tle`).then((r) => r.text()),
  ]);

  const stationsEls = parseTleFile(stations, 40);
  const geoEls = parseTleFile(geo, 25);
  const leoEls = parseTleFile(leo, 30);
  const work: TleWork[] = [];
  let idx = 0;
  for (const t of stationsEls) {
    if (work.length >= MAX_SATS) break;
    work.push({
      name: t.name,
      l1: t.l1,
      l2: t.l2,
      cls: geoHint(t.name, t.l2) === "geo" ? "sat_geo" : "sat_leo",
      id: `tle-st-${idx++}`,
    });
  }
  for (const t of geoEls) {
    if (work.length >= MAX_SATS) break;
    work.push({ name: t.name, l1: t.l1, l2: t.l2, cls: "sat_geo", id: `tle-g-${idx++}` });
  }
  for (const t of leoEls) {
    if (work.length >= MAX_SATS) break;
    work.push({ name: t.name, l1: t.l1, l2: t.l2, cls: "sat_leo", id: `tle-l-${idx++}` });
  }
  tleWorkList = work;
}

/** Recompute SGP4 positions for cached TLEs (cheap; use with simulated clock). */
export function satelliteRowsAtTime(when: Date): PublicTrackRow[] {
  if (!tleWorkList) return [];
  const out: PublicTrackRow[] = [];
  for (const t of tleWorkList) {
    const p = propagateOne(t.name, t.l1, t.l2, when, t.cls, t.id);
    if (p) {
      out.push({
        id: p.id,
        name: t.name,
        class: p.kind,
        lat: p.lat,
        lon: p.lon,
        hKm: p.hKm,
      });
    }
  }
  return out;
}

type OpenSkyRow = (number | string | boolean | null)[] | null;

/**
 * @see https://opensky-network.org/apidoc/rest.html — anonymous API; rate-limited.
 */
export async function loadOpenSkyAircraft(): Promise<PublicTrackRow[]> {
  let data: { states?: OpenSkyRow[] } | null = null;
  try {
    const res = await fetch("https://opensky-network.org/api/states/all", {
      cache: "no-store",
    });
    if (res.ok) {
      data = (await res.json()) as { states?: OpenSkyRow[] };
    }
  } catch {
    return [];
  }
  const states = data?.states;
  if (!states?.length) return [];

  const out: PublicTrackRow[] = [];
  for (const row of states) {
    if (!row || out.length >= MAX_AIR) break;
    const icao = row[0] != null ? String(row[0]) : null;
    const lon = row[5] as number | null;
    const lat = row[6] as number | null;
    const baro = row[7] as number | null;
    const onGround = row[8] === true;
    if (!icao || onGround) continue;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const altM = typeof baro === "number" ? baro : row[13] as number;
    if (typeof altM !== "number" || !Number.isFinite(altM)) continue;
    const call = (row[1] != null && String(row[1]).trim()) || icao;
    out.push({
      id: `adsb-${icao}`,
      name: call.slice(0, 18),
      class: "air",
      lat,
      lon,
      hKm: altM / 1000,
    });
  }
  return out;
}

export async function loadMaritimeSample(): Promise<PublicTrackRow[]> {
  if (shipCache) return shipCache;
  const res = await fetch(`${import.meta.env.BASE_URL}tracking/maritime-samples.json`);
  const j = (await res.json()) as { vessels: ShipJson[] };
  shipCache = j.vessels.map((v) => {
    const sev: PublicTrackClass =
      v.class === "mil" ? "ship_mil" : v.class === "com" ? "ship_com" : "ship_civ";
    return {
      id: v.id,
      name: v.name,
      class: sev,
      lat: v.lat,
      lon: v.lon,
      hKm: 0.02,
    };
  });
  return shipCache;
}

export function toTrackingGeoJson(rows: PublicTrackRow[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [r.lon, r.lat] },
      properties: {
        id: r.id,
        name: r.name,
        track_class: r.class,
        color: COLORS[r.class],
        h_km: r.hKm,
      },
    })),
  };
}

export function toTrackingGlobePoints(rows: PublicTrackRow[]): GlobeEventPoint[] {
  return rows.map((r) => {
    const baseAlt = Math.min(0.14, 0.002 + (r.hKm / EARTH_R_KM) * ALT_SCALE);
    return {
      kind: "tracking" as const,
      lat: r.lat,
      lng: r.lon,
      color: COLORS[r.class],
      r: r.class.startsWith("sat") ? 0.55 : r.class === "air" ? 0.42 : 0.38,
      id: r.id,
      domain: "tracking",
      trackLabel: r.name,
      trackClass: r.class,
      altitude: baseAlt,
    };
  });
}

export { COLORS as PUBLIC_TRACK_COLORS };
