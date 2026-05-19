/**
 * Memoize expensive ECharts option builders across dashboard revisions.
 */
import type { EChartsOption } from "echarts";
import { dashboardData } from "./dashboard-revision.svelte";
import { memoByRevisions } from "./chart-cache-memo";
import type { UiEvent, UiWorldState } from "./types";

let riskCache: import("./chart-cache-memo").RevisionCacheEntry | null = null;
let heatCache: import("./chart-cache-memo").RevisionCacheEntry | null = null;

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
