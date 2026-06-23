
import { DOMAIN_CATALOG } from "./colors";
import type { UiEvent } from "./types";

function isGeoEvent(
  e: UiEvent,
): e is UiEvent & { location: { lat: number; lon: number } } {
  if (!e.location) return false;
  const { lat, lon } = e.location;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export type GeoEventIndex = {
  revision: number;
  events: readonly UiEvent[];
  geoEvents: readonly UiEvent[];
  eventById: ReadonlyMap<string, UiEvent>;
  byDomain: ReadonlyMap<string, readonly UiEvent[]>;
};

export function buildGeoEventIndex(
  events: readonly UiEvent[],
  revision: number,
): GeoEventIndex {
  const geoEvents: UiEvent[] = [];
  const eventById = new Map<string, UiEvent>();
  const byDomain = new Map<string, UiEvent[]>();
  for (const d of DOMAIN_CATALOG) {
    byDomain.set(d.id, []);
  }

  for (const e of events) {
    eventById.set(e.id, e);
    if (!isGeoEvent(e)) continue;
    geoEvents.push(e);
    const list = byDomain.get(e.domain);
    if (list) list.push(e);
  }

  const frozenByDomain = new Map<string, readonly UiEvent[]>();
  for (const [id, list] of byDomain) {
    frozenByDomain.set(id, list);
  }

  return {
    revision,
    events,
    geoEvents,
    eventById,
    byDomain: frozenByDomain,
  };
}
