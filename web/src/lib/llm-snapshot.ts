/**
 * Build a size-bounded JSON snapshot of live dashboard state for the
 * local LLM bridge. The server applies its own cap; this keeps payloads
 * predictable and avoids browser stalls on very large event rings.
 */

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
  /** Sparse narrative rows; omit empty object if none. */
  readonly eventNarratives?: Readonly<Record<string, UiEventNarrative>>;
  /** When the UI captured this view (ISO), for operator context only. */
  readonly capturedAt: string;
}

/**
 * Produces a plain object suitable for `POST /v1/insight` on the
 * OpenAtlas LLM bridge. Pure — safe to call from any reactive read.
 */
export function buildLlmSnapshot(input: LlmSnapshotInput): Record<string, unknown> {
  const events = [...input.events]
    .sort((a, b) => b.ordinal - a.ordinal)
    .slice(0, LLM_MAX_EVENTS);
  const signals = input.recentSignals.slice(0, LLM_MAX_SIGNALS);
  const edges = input.recentCausalEdges
    .slice(0, LLM_MAX_CAUSAL)
    .map((e) => ({
      id: e.id,
      source_event_id: e.source_event_id,
      target_event_id: e.target_event_id,
      influence_score: e.influence_score,
    }));
  const world = Object.values(input.domainState).map((r) => ({
    domain: r.domain,
    event_count: r.event_count,
    avg_severity: r.avg_severity,
    risk_index: r.risk_index,
  }));
  const insights = Object.values(input.domainInsights).map((d) => ({
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
  return {
    schema: "openatlas.llm_snapshot/v1",
    captured_at: input.capturedAt,
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
