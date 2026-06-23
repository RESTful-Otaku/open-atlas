
import { dashboardData } from "./dashboard-revision.svelte";
import { buildEventsByDomain } from "./domain-events-index";
import { dashboard } from "./state.svelte";
import type { UiEvent } from "./types";

type Cache = {
  revision: number;
  byDomain: ReadonlyMap<string, readonly UiEvent[]>;
};

let cache: Cache | null = null;

export function getEventsForDomain(domainId: string): readonly UiEvent[] {
  const rev = dashboardData.revision;
  if (!cache || cache.revision !== rev) {
    cache = { revision: rev, byDomain: buildEventsByDomain(dashboard.events) };
  }
  return cache.byDomain.get(domainId) ?? [];
}

export function invalidateDomainEventsCache(): void {
  cache = null;
}
