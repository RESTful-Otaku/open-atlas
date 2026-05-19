/**
 * Revision-keyed memo helpers (no Svelte) — used by chart-cache and tests.
 */
import type { EChartsOption } from "echarts";

export type RevisionCacheEntry = {
  revision: number;
  domainRev: number;
  option: EChartsOption;
};

export function memoByRevisions(
  cache: RevisionCacheEntry | null,
  revision: number,
  domainRev: number,
  build: () => EChartsOption,
): { entry: RevisionCacheEntry; option: EChartsOption } {
  if (
    cache &&
    cache.revision === revision &&
    cache.domainRev === domainRev
  ) {
    return { entry: cache, option: cache.option };
  }
  const option = build();
  const entry = { revision, domainRev, option };
  return { entry, option };
}
