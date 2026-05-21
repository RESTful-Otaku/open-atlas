/**
 * Drives globe.gl (Three.js) layers from the same event/causal/solar
 * selection rules as the MapLibre map.
 */
import { DOMAIN_CATALOG, domainColor } from "../colors";
import type { GeoEventIndex } from "../geo-event-index-build";
import type { UiCausalEdge, UiEvent } from "../types";
import { matchesSelectedDomain } from "../state.svelte";
import { isGeoEvent } from "./map-causal-geojson";
import { buildSunPointFeature, buildTerminatorLine, subsolarPoint } from "./solar-geometry";
import { arcAltitudeForGlobe } from "./tracking-paths";
import { approximateMoonPoint } from "./globe-day-night";

/**
 * t ∈ [0, 1] is normalized density from the globe.gl heatmap shader.
 * The mesh covers the whole sphere; we must allow **alpha → 0** at low t, otherwise
 * the min-opacity floor tints the entire globe (there is no “no mesh” per vertex).
 */
function heatColorForDomain(baseHex: string, t: number): string {
  if (!Number.isFinite(t) || t <= 0) {
    return "rgba(0,0,0,0)";
  }
  // Aligned with three-globe’s default heatmap: opacity scales ~∛t, not a floor near 0.2
  const a = Math.min(0.9, Math.cbrt(t) * 0.88);
  if (a < 0.02) {
    return "rgba(0,0,0,0)";
  }
  if (baseHex.length === 7 && baseHex[0] === "#") {
    const r = parseInt(baseHex.slice(1, 3), 16);
    const g = parseInt(baseHex.slice(3, 5), 16);
    const b = parseInt(baseHex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return `rgba(148, 163, 184,${a})`;
}

export type GlobeHeatmapDatum = {
  domain: string;
  color: string;
  points: [number, number, number][];
};

export function buildPerDomainHeatmaps(
  index: GeoEventIndex,
  mapDomains: ReadonlySet<string>,
): GlobeHeatmapDatum[] {
  const out: GlobeHeatmapDatum[] = [];
  for (const d of DOMAIN_CATALOG) {
    if (!mapDomains.has(d.id)) continue;
    const pts: [number, number, number][] = [];
    for (const e of index.byDomain.get(d.id) ?? []) {
      if (!matchesSelectedDomain(e.domain)) continue;
      const w = Number.isFinite(e.severity_score)
        ? 0.25 + Math.max(0, Math.min(1, e.severity_score)) * 0.85
        : 0.45;
      pts.push([e.location!.lat, e.location!.lon, w]);
    }
    if (pts.length) {
      out.push({ domain: d.id, color: d.color, points: pts });
    }
  }
  return out;
}

export type GlobeEventPoint = {
  lat: number;
  lng: number;
  color: string;
  r: number;
  id: string;
  domain: string;
  /** "sun" | "moon" for solar markers. */
  kind?: "event" | "sun" | "moon" | "tracking";
  /** Public tracking layers (NORAD / ADS-B / sample AIS). */
  trackLabel?: string;
  trackClass?: string;
  /** Exaggerated altitude in globe units (see globe.gl `pointAltitude`). */
  altitude?: number;
};

export function buildGlobePoints(
  geoEvents: readonly UiEvent[],
  mapDomains: ReadonlySet<string>,
): GlobeEventPoint[] {
  const pts: GlobeEventPoint[] = [];
  for (const e of geoEvents) {
    if (!matchesSelectedDomain(e.domain)) continue;
    if (!mapDomains.has(e.domain)) continue;
    if (!isGeoEvent(e)) continue;
    const sev = e.severity_score;
    const w = Number.isFinite(sev) ? Math.max(0.12, sev) : 0.28;
    const r = 0.35 + w * 0.9;
    pts.push({
      kind: "event",
      lat: e.location.lat,
      lng: e.location.lon,
      color: domainColor(e.domain),
      r,
      id: e.id,
      domain: e.domain,
    });
  }
  return pts;
}

export type GlobeArc = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  w: number;
  id: string;
  /** Peak altitude in globe-radius units (above surface). */
  altitude: number;
};

export function buildGlobeArcs(
  events: readonly UiEvent[],
  edges: readonly UiCausalEdge[],
  mapDomains: ReadonlySet<string> | null,
): GlobeArc[] {
  const eventById = new Map<string, UiEvent>();
  for (const event of events) {
    eventById.set(event.id, event);
  }
  const visible = edges.filter((edge) => {
    const src = eventById.get(edge.source_event_id);
    const dst = eventById.get(edge.target_event_id);
    return (
      (src !== undefined && matchesSelectedDomain(src.domain)) ||
      (dst !== undefined && matchesSelectedDomain(dst.domain))
    );
  });
  const arcs: GlobeArc[] = [];
  for (const edge of visible) {
    const a = eventById.get(edge.source_event_id);
    const b = eventById.get(edge.target_event_id);
    if (!a || !b || !isGeoEvent(a) || !isGeoEvent(b)) continue;
    if (mapDomains !== null) {
      if (!mapDomains.has(a.domain) || !mapDomains.has(b.domain)) continue;
    }
    const inf = Math.max(0, Math.min(1, edge.influence_score));
    const c1 = domainColor(a.domain);
    const c2 = domainColor(b.domain);
    arcs.push({
      startLat: a.location.lat,
      startLng: a.location.lon,
      endLat: b.location.lat,
      endLng: b.location.lon,
      color: c1,
      w: 0.45 + inf * 2.4,
      id: edge.id,
      altitude: arcAltitudeForGlobe(
        a.location.lat,
        a.location.lon,
        b.location.lat,
        b.location.lon,
      ),
    });
    // reserve c2 for future gradient; arcColor can use [c1, c2]
    void c2;
  }
  return arcs;
}

/**
 * Great-circle terminator as path lines for globe.gl
 * (arrays of [lat, lng, alt] with alt 0).
 */
export function buildTerminatorPath(simUtcMs: number): [number, number, number][] {
  const when = new Date(simUtcMs);
  const sub = subsolarPoint(when);
  const f = buildTerminatorLine(sub, 200);
  const coords = f.geometry.coordinates;
  return coords.map(([lon, lat]) => [lat, lon, 0] as [number, number, number]);
}

export function buildSunPoint(simUtcMs: number): {
  lat: number;
  lng: number;
} | null {
  const f = buildSunPointFeature(subsolarPoint(new Date(simUtcMs)));
  const c = f.geometry.coordinates;
  return { lat: c[1], lng: c[0] };
}

export function buildSunMarkerPoint(simUtcMs: number): GlobeEventPoint | null {
  const s = buildSunPoint(simUtcMs);
  if (!s) return null;
  return {
    kind: "sun",
    lat: s.lat,
    lng: s.lng,
    color: "rgba(253, 224, 71, 0.98)",
    r: 1.25,
    id: "subsun",
    domain: "solar",
    altitude: 0.018,
  };
}

export function buildMoonMarkerPoint(simUtcMs: number): GlobeEventPoint | null {
  const m = approximateMoonPoint(simUtcMs);
  return {
    kind: "moon",
    lat: m.lat,
    lng: m.lng,
    color: "rgba(226, 232, 240, 0.92)",
    r: 0.72,
    id: "moon",
    domain: "lunar",
    altitude: 0.016,
  };
}

export { heatColorForDomain };
