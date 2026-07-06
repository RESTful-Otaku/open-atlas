

import type {
  UiCausalEdge,
  UiDomainInsight,
  UiEvent,
  UiEventNarrative,
  UiSignal,
  UiWorldState,
} from "./types";

export const LLM_MAX_EVENTS = 48;
export const LLM_MAX_SIGNALS = 32;
export const LLM_MAX_CAUSAL = 40;
export const LLM_MAX_NARRATIVES = 24;

export interface LlmSnapshotInput {
  readonly events: readonly UiEvent[];
  readonly recentSignals: readonly UiSignal[];
  readonly domainState: Record<string, UiWorldState>;
  readonly domainInsights: Record<string, UiDomainInsight>;
  readonly recentCausalEdges: readonly UiCausalEdge[];
  readonly eventNarratives?: Readonly<Record<string, UiEventNarrative>>;
  readonly capturedAt: string;
  readonly scopeDomain?: string;
}

export interface LlmDeskChartStats {
  readonly event_count: number;
  readonly geolocated_count: number;
  readonly peak_hour_utc: number | null;
  readonly causal_inbound: number;
  readonly causal_outbound: number;
}

/** Human-readable counts for the hub LLM panel. */
export function llmSnapshotCounts(input: LlmSnapshotInput): {
  events: number;
  domains: number;
  signals: number;
  insights: number;
  causalEdges: number;
  narratives: number;
} {
  return {
    events: input.events.length,
    domains: Object.keys(input.domainState).length,
    signals: input.recentSignals.length,
    insights: Object.keys(input.domainInsights).length,
    causalEdges: input.recentCausalEdges.length,
    narratives: input.eventNarratives
      ? Object.keys(input.eventNarratives).length
      : 0,
  };
}

export function buildDeskChartStats(
  domainId: string,
  events: readonly UiEvent[],
  edges: readonly UiCausalEdge[],
): LlmDeskChartStats {
  const scoped = events.filter((e) => e.domain === domainId);
  const ids = new Set(scoped.map((e) => e.id));
  const hours = new Array(24).fill(0) as number[];
  for (const e of scoped) {
    const t = Date.parse(e.timestamp);
    if (!Number.isFinite(t)) continue;
    hours[new Date(t).getUTCHours()] += 1;
  }
  let peakHour: number | null = null;
  let peak = 0;
  for (let h = 0; h < 24; h++) {
    const hourCount = hours[h] ?? 0;
    if (hourCount > peak) {
      peak = hourCount;
      peakHour = h;
    }
  }
  let inbound = 0;
  let outbound = 0;
  for (const e of edges) {
    const inDom = ids.has(e.target_event_id);
    const outDom = ids.has(e.source_event_id);
    if (inDom && !outDom) inbound += 1;
    if (outDom && !inDom) outbound += 1;
    if (inDom && outDom) {
      inbound += 1;
      outbound += 1;
    }
  }
  return {
    event_count: scoped.length,
    geolocated_count: scoped.filter((e) => e.location !== null).length,
    peak_hour_utc: peak > 0 ? peakHour : null,
    causal_inbound: inbound,
    causal_outbound: outbound,
  };
}

export function buildLlmSnapshot(input: LlmSnapshotInput): Record<string, unknown> {
  const scope = input.scopeDomain;
  const allEvents = scope
    ? input.events.filter((e) => e.domain === scope)
    : input.events;
  const allSignals = scope
    ? input.recentSignals.filter((s) => s.domain === scope)
    : input.recentSignals;
  const eventIds = new Set(allEvents.map((e) => e.id));
  const allEdges = scope
    ? input.recentCausalEdges.filter(
        (e) =>
          eventIds.has(e.source_event_id) || eventIds.has(e.target_event_id),
      )
    : input.recentCausalEdges;

  const events = [...allEvents]
    .sort((a, b) => b.ordinal - a.ordinal)
    .slice(0, LLM_MAX_EVENTS);
  const signals = [...allSignals]
    .sort((a, b) => b.score - a.score)
    .slice(0, LLM_MAX_SIGNALS);
  const edges = allEdges
    .slice(0, LLM_MAX_CAUSAL)
    .map((e) => ({
      id: e.id,
      source_event_id: e.source_event_id,
      target_event_id: e.target_event_id,
      influence_score: e.influence_score,
    }));
  const worldRows = scope
    ? (() => {
        const row = input.domainState[scope];
        return row ? [row] : [];
      })()
    : Object.values(input.domainState);
  const world = worldRows.map((r) => ({
    domain: r.domain,
    event_count: r.event_count,
    avg_severity: r.avg_severity,
    risk_index: r.risk_index,
  }));
  const insightRows = scope
    ? (() => {
        const row = input.domainInsights[scope];
        return row ? [row] : [];
      })()
    : Object.values(input.domainInsights);
  const insights = insightRows.map((d) => ({
    domain: d.domain,
    trend: d.trend,
    anomaly_count_recent: d.anomaly_count_recent,
    narrative: d.narrative,
    dominant_source: d.dominant_source,
  }));
  const narratives: {
    event_id: string;
    headline: string;
    summary: string;
  }[] = [];
  if (input.eventNarratives) {
    for (const e of events) {
      const n = input.eventNarratives[e.id];
      if (n) {
        narratives.push({
          event_id: n.event_id,
          headline: n.headline,
          summary: n.summary,
        });
        if (narratives.length >= LLM_MAX_NARRATIVES) break;
      }
    }
  }
  const desk_stats =
    scope !== undefined
      ? buildDeskChartStats(scope, input.events, input.recentCausalEdges)
      : undefined;

  return {
    schema: "openatlas.llm_snapshot/v1",
    captured_at: input.capturedAt,
    scope_domain: scope ?? null,
    desk_chart_stats: desk_stats ?? null,
    world_state: world,
    domain_insights: insights,
    recent_events: events.map((e) => ({
      id: e.id,
      ordinal: e.ordinal,
      domain: e.domain,
      timestamp: e.timestamp,
      severity_score: e.severity_score,
      has_location: e.location !== null,
      location: e.location,
    })),
    recent_signals: signals.map((s) => ({
      id: s.id,
      event_id: s.event_id,
      domain: s.domain,
      score: s.score,
      reason: s.reason,
    })),
    causal_edges_sample: edges,
    event_narrative_headlines: narratives,
  };
}
