import type { EChartsOption } from "echarts";
import { dashboardData } from "./dashboard-revision.svelte";
import { memoByRevisions } from "./chart-cache-memo";
import type { UiEvent, UiWorldState } from "./types";

let riskCache: import("./chart-cache-memo").RevisionCacheEntry | null = null;
let heatCache: import("./chart-cache-memo").RevisionCacheEntry | null = null;
let hubPieCache: import("./chart-cache-memo").RevisionCacheEntry | null = null;
let hubLineCache: import("./chart-cache-memo").RevisionCacheEntry | null = null;
const matrixCaches = new Map<string, import("./chart-cache-memo").RevisionCacheEntry>();

type PackCacheEntry<T> = {
  revision: number;
  domainRev: number;
  value: T;
};

const domainDeskPackCaches = new Map<string, PackCacheEntry<unknown>>();

export function memoHubRiskBars(
  _domainState: Record<string, UiWorldState>,
  build: () => EChartsOption,
): EChartsOption {
  const revision = dashboardData.revision;
  const domainRev = dashboardData.domainsRevision;
  const { entry, option } = memoByRevisions(
    riskCache,
    revision,
    domainRev,
    build,
  );
  riskCache = entry;
  return option;
}

export function memoHubHeatmap(
  _events: readonly UiEvent[],
  build: () => EChartsOption,
): EChartsOption {
  const revision = dashboardData.revision;
  const domainRev = dashboardData.domainsRevision;
  const { entry, option } = memoByRevisions(
    heatCache,
    revision,
    domainRev,
    build,
  );
  heatCache = entry;
  return option;
}

export function memoHubShare(
  _events: readonly UiEvent[],
  build: () => EChartsOption,
): EChartsOption {
  const revision = dashboardData.revision;
  const domainRev = dashboardData.domainsRevision;
  const { entry, option } = memoByRevisions(
    hubPieCache,
    revision,
    domainRev,
    build,
  );
  hubPieCache = entry;
  return option;
}

export function memoHubTimeline(
  _events: readonly UiEvent[],
  build: () => EChartsOption,
): EChartsOption {
  const revision = dashboardData.revision;
  const domainRev = dashboardData.domainsRevision;
  const { entry, option } = memoByRevisions(
    hubLineCache,
    revision,
    domainRev,
    build,
  );
  hubLineCache = entry;
  return option;
}

const MAX_CACHE_ENTRIES = 48;

function trimCache<K>(cache: Map<K, unknown>, max: number): void {
  while (cache.size > max) {
    const key = cache.keys().next();
    if (key.done) break;
    cache.delete(key.value);
  }
}


export function memoMatrixChart(
  cacheKey: string,
  build: () => EChartsOption,
): EChartsOption {
  const revision = dashboardData.revision;
  const domainRev = dashboardData.domainsRevision;
  const prev = matrixCaches.get(cacheKey) ?? null;
  const { entry, option } = memoByRevisions(prev, revision, domainRev, build);
  matrixCaches.set(cacheKey, entry);
  trimCache(matrixCaches, MAX_CACHE_ENTRIES);
  return option;
}


export function memoDomainDeskPack<T>(cacheKey: string, build: () => T): T {
  const revision = dashboardData.revision;
  const domainRev = dashboardData.domainsRevision;
  const prev = domainDeskPackCaches.get(cacheKey) as PackCacheEntry<T> | undefined;
  if (prev && prev.revision === revision && prev.domainRev === domainRev) {
    return prev.value;
  }
  const value = build();
  domainDeskPackCaches.set(cacheKey, { revision, domainRev, value });
  trimCache(domainDeskPackCaches, MAX_CACHE_ENTRIES);
  return value;
}
