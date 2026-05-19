/**
 * Memoize expensive ECharts option builders across dashboard revisions.
 */
import type { EChartsOption } from "echarts";
import { dashboardData } from "./dashboard-revision.svelte";
import { memoByRevisions } from "./chart-cache-memo";
import type { MatrixChartKind } from "./matrices/matrix-charts";
import type { UiEvent, UiWorldState } from "./types";

let riskCache: import("./chart-cache-memo").RevisionCacheEntry | null = null;
let heatCache: import("./chart-cache-memo").RevisionCacheEntry | null = null;
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

export function memoMatrixChart(
  kind: MatrixChartKind,
  build: () => EChartsOption,
): EChartsOption {
  const revision = dashboardData.revision;
  const domainRev = dashboardData.domainsRevision;
  const prev = matrixCaches.get(kind) ?? null;
  const { entry, option } = memoByRevisions(prev, revision, domainRev, build);
  matrixCaches.set(kind, entry);
  return option;
}

/** Domain desk chart pack (primary + optional secondary/tertiary). */
export function memoDomainDeskPack<T>(cacheKey: string, build: () => T): T {
  const revision = dashboardData.revision;
  const domainRev = dashboardData.domainsRevision;
  const prev = domainDeskPackCaches.get(cacheKey) as PackCacheEntry<T> | undefined;
  if (prev && prev.revision === revision && prev.domainRev === domainRev) {
    return prev.value;
  }
  const value = build();
  domainDeskPackCaches.set(cacheKey, { revision, domainRev, value });
  return value;
}
