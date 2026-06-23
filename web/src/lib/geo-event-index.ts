
import { dashboardData } from "./dashboard-revision.svelte";
import { buildGeoEventIndex, type GeoEventIndex } from "./geo-event-index-build";
import type { UiEvent } from "./types";

export type { GeoEventIndex } from "./geo-event-index-build";
export { buildGeoEventIndex } from "./geo-event-index-build";

let cache: GeoEventIndex | null = null;

export function getGeoEventIndex(events: readonly UiEvent[]): GeoEventIndex {
  const rev = dashboardData.revision;
  if (cache && cache.revision === rev && cache.events === events) {
    return cache;
  }
  const built = buildGeoEventIndex(events, rev);
  cache = built;
  return built;
}

export function invalidateGeoEventIndex(): void {
  cache = null;
}
