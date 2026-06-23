import { DOMAIN_CATALOG, domainLabel } from "./colors";
import type { UiDomainInsight, UiSignal, UiWorldState } from "./types";
import { bucketRisk, type StatusLevel } from "./primitives/status";

export interface HubTile {
  readonly id: string;
  readonly title: string;
  readonly status: StatusLevel;

  readonly headlineCount: number | null;
  readonly headlineUnit: string;
  readonly subMetric: string;
  readonly accent: string;
  readonly riskIndex: number;
}


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
