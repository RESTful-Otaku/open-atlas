/**
 * UI-facing DTOs. These are the projections that every component
 * reads; they intentionally have no direct relation to the SDK row
 * shape so refactors of the SpacetimeDB schema don't cascade into
 * every panel.
 *
 * The projection functions live in `state.svelte.ts`. Domain ids are
 * strings matching `DOMAIN_CATALOG` in `colors.ts`.
 */

export interface UiLocation {
  lat: number;
  lon: number;
}

export interface UiEvent {
  /** Stringified u64 so it's safe to use as an object key / React key. */
  id: string;
  /** Monotonic server-assigned ordinal for stable ordering. */
  ordinal: number;
  /** ISO-8601 timestamp with microsecond precision preserved. */
  timestamp: string;
  /** Domain id (matches `DOMAIN_CATALOG`). */
  domain: string;
  severity_score: number;
  location: UiLocation | null;
}

export interface UiSignal {
  /** Stringified signal id (distinct from event_id). */
  id: string;
  event_id: string;
  domain: string;
  score: number;
  reason: string;
}

export interface UiWorldState {
  domain: string;
  event_count: number;
  avg_severity: number;
  risk_index: number;
}

export interface UiCausalEdge {
  id: string;
  source_event_id: string;
  target_event_id: string;
  influence_score: number;
  decay_rate: number;
}

export interface UiDomainInsight {
  domain: string;
  trend: string;
  anomaly_count_recent: number;
  dominant_source: string | null;
  source_link: string | null;
  narrative: string;
  updated_at: string;
}

export interface UiPredictedDisruption {
  readonly entity: string;
  readonly severity: string;
  readonly note: string;
}

export interface UiEventNarrative {
  readonly event_id: string;
  readonly headline: string;
  readonly summary: string;
  readonly inference: string;
  readonly predicted_disruption: readonly UiPredictedDisruption[];
  readonly updated_at: string;
}

export type ConnectionState = "connecting" | "live" | "offline";
