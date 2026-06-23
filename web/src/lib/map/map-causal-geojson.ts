import type { UiCausalEdge, UiEvent } from "../types";
import { domainColor } from "../colors";
import { matchesSelectedDomain } from "../state.svelte";

function isValidLoc(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export function isGeoEvent(
  e: UiEvent,
): e is UiEvent & { location: { lat: number; lon: number } } {
  if (!e.location) return false;
  return isValidLoc(e.location.lat, e.location.lon);
}

export type CausalMapOptions = {
  mapDomains: ReadonlySet<string> | null;
};

export function buildCausalLineCollection(
  events: readonly UiEvent[],
  edges: readonly UiCausalEdge[],
  options?: CausalMapOptions,
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const mapDomains: ReadonlySet<string> | null = options?.mapDomains ?? null;
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
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const edge of visible) {
    const a = eventById.get(edge.source_event_id);
    const b = eventById.get(edge.target_event_id);
    if (!a || !b || !isGeoEvent(a) || !isGeoEvent(b)) continue;
    if (mapDomains !== null) {
      if (!mapDomains.has(a.domain) || !mapDomains.has(b.domain)) continue;
    }
    const inf = Math.max(0, Math.min(1, edge.influence_score));
    features.push({
      type: "Feature",
      properties: {
        id: edge.id,
        influence: inf,
        sourceColor: domainColor(a.domain),
        targetColor: domainColor(b.domain),
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [a.location.lon, a.location.lat],
          [b.location.lon, b.location.lat],
        ],
      },
    });
  }
  return { type: "FeatureCollection", features };
}
