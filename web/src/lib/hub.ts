/**
 * Pure projections that compose Executive Summary Hub tiles and the
 * global threat index from the reactive dashboard state.
 *
 * All functions are deterministic: given the same input store they
 * produce the same output. No wall-clock reads; no RNG.
 */

import { DOMAIN_CATALOG, domainLabel } from "./colors";
import type { UiDomainInsight, UiSignal, UiWorldState } from "./types";
import { bucketRisk, type StatusLevel } from "./primitives/status";

export interface HubTile {
  readonly id: string;
  readonly title: string;
  readonly status: StatusLevel;
  /** Large count shown in the tile headline (compact + hover when ≥ 1k). */
  readonly headlineCount: number | null;
  readonly headlineUnit: string;
  readonly subMetric: string;
  readonly accent: string;
  readonly riskIndex: number;
}

/**
 * Compose one tile per domain in the catalog. Tiles are ordered by
 * `riskIndex` descending so the highest-pressure domains bubble to the
 * top of the grid — matches the "most critical first" reading order in
 * the reference design.
 */
export function buildHubTiles(
  domainState: Record<string, UiWorldState>,
  domainInsights: Record<string, UiDomainInsight>,
  recentSignals: readonly UiSignal[],
): readonly HubTile[] {
  const tiles: HubTile[] = [];
  for (const entry of DOMAIN_CATALOG) {
    const state = domainState[entry.id];
    const insight = domainInsights[entry.id];
    const signalForDomain = recentSignals.findLast
      ? recentSignals.findLast((s) => s.domain === entry.id)
      : [...recentSignals].reverse().find((s) => s.domain === entry.id);
    const risk = state?.risk_index ?? 0;
    tiles.push({
      id: entry.id,
      title: domainLabel(entry.id),
      status: bucketRisk(risk),
      ...headlineFor(entry.id, state),
      subMetric: subMetricFor(entry.id, insight, signalForDomain),
      accent: entry.color,
      riskIndex: risk,
    });
  }
  tiles.sort((a, b) => b.riskIndex - a.riskIndex);
  return tiles;
}

/**
 * Deterministic, domain-specific headline metric. Falls back to the
 * event count when we have no richer signal — this keeps tiles
 * populated even for cold domains, matching the "never render blank"
 * principle.
 */
function headlineFor(
  domain: string,
  state: UiWorldState | undefined,
): { headlineCount: number | null; headlineUnit: string } {
  if (!state) return { headlineCount: null, headlineUnit: "No data" };
  const count = state.event_count;
  switch (domain) {
    case "cyber":
      return { headlineCount: count, headlineUnit: "incidents" };
    case "space":
      return { headlineCount: count, headlineUnit: "objects" };
    case "demographics":
      return { headlineCount: count, headlineUnit: "events" };
    case "infrastructure":
      return { headlineCount: count, headlineUnit: "nodes" };
    case "transport":
      return { headlineCount: count, headlineUnit: "flows" };
    case "health":
      return { headlineCount: count, headlineUnit: "clusters" };
    default:
      return { headlineCount: count, headlineUnit: "events" };
  }
}

function subMetricFor(
  domain: string,
  insight: UiDomainInsight | undefined,
  signal: UiSignal | undefined,
): string {
  if (insight) {
    return `${insight.trend} · anomalies ${insight.anomaly_count_recent}`;
  }
  if (signal) {
    return signal.reason;
  }
  return `${domain} baseline`;
}

/**
 * Compute the global threat index on a `[0, 10]` scale. Defined as the
 * event-weighted mean of per-domain risk indices, scaled up by ten.
 *
 * Tradeoff: weighting by event count means busy domains dominate. That
 * matches operator intuition (a noisy cyber feed should move the
 * needle) but means a quiet-but-critical domain contributes less than
 * its individual severity might suggest. Alternative: unweighted mean —
 * cleaner but less reactive. We pick weighted-by-events.
 */
/**
 * Maps a domain id (tile / DOMAIN_CATALOG) to a {@link MATRIX_CATALOG}
 * matrix id. Required because matrix slugs (e.g. `threat`, `economic`)
 * are not 1:1 with domain ids (e.g. `geopolitics`, `finance`).
 */
export function matrixIdForDomain(domain: string): string {
  const map: Record<string, string> = {
    energy: "resource",
    finance: "economic",
    climate: "resource",
    seismic: "threat",
    transport: "transport",
    health: "health",
    geospatial: "resource",
    economy: "economic",
    geopolitics: "threat",
    cyber: "cyber",
    space: "compute",
    demographics: "demographics",
    infrastructure: "compute",
  };
  return map[domain] ?? "threat";
}

export function computeThreatIndex(
  domainState: Record<string, UiWorldState>,
): number {
  const rows = Object.values(domainState);
  if (rows.length === 0) return 0;
  let totalEvents = 0;
  let weighted = 0;
  for (const row of rows) {
    totalEvents += row.event_count;
    weighted += row.risk_index * row.event_count;
  }
  if (totalEvents === 0) return 0;
  const avg = weighted / totalEvents;
  return Math.min(Math.max(avg, 0), 1) * 10;
}
