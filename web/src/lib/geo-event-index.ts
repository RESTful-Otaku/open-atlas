/**
 * Cached geo indexes for map/globe layers — rebuilt once per dashboard revision.
 */
import { DOMAIN_CATALOG } from "./colors";
import { dashboardData } from "./dashboard-revision.svelte";
import { isGeoEvent } from "./map/map-causal-geojson";
import type { UiEvent } from "./types";

export type GeoEventIndex = {
  revision: number;
  events: readonly UiEvent[];
  geoEvents: readonly UiEvent[];
  eventById: ReadonlyMap<string, UiEvent>;
  byDomain: ReadonlyMap<string, readonly UiEvent[]>;
};

let cache: GeoEventIndex | null = null;

export function getGeoEventIndex(events: readonly UiEvent[]): GeoEventIndex {
  const rev = dashboardData.revision;
  if (cache && cache.revision === rev && cache.events === events) {
    return cache;
  }

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

  cache = {
    revision: rev,
    events,
    geoEvents,
    eventById,
    byDomain: frozenByDomain,
  };
  return cache;
}

export function invalidateGeoEventIndex(): void {
  cache = null;
}
