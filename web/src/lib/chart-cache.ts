/**
 * Memoize expensive ECharts option builders across dashboard revisions.
 */
import type { EChartsOption } from "echarts";
import { dashboardData } from "./dashboard-revision.svelte";
import type { UiEvent, UiWorldState } from "./types";

type CacheEntry = {
  revision: number;
  domainRev: number;
  option: EChartsOption;
};

let riskCache: CacheEntry | null = null;
let heatCache: CacheEntry | null = null;

export function memoHubRiskBars(
  _domainState: Record<string, UiWorldState>,
  build: () => EChartsOption,
): EChartsOption {
  const revision = dashboardData.revision;
  const domainRev = dashboardData.domainsRevision;
  if (
    riskCache &&
    riskCache.revision === revision &&
    riskCache.domainRev === domainRev
  ) {
    return riskCache.option;
  }
  const option = build();
  riskCache = { revision, domainRev, option };
  return option;
}

export function memoHubHeatmap(
  _events: readonly UiEvent[],
  build: () => EChartsOption,
): EChartsOption {
  const revision = dashboardData.revision;
  if (heatCache && heatCache.revision === revision) {
    return heatCache.option;
  }
  const option = build();
  heatCache = { revision, domainRev: dashboardData.domainsRevision, option };
  return option;
}
