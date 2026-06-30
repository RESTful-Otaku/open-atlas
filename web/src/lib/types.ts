export interface UiLocation {
  lat: number;
  lon: number;
}

export interface UiEvent {
  id: string;
  ordinal: number;
  timestamp: string;
  domain: string;
  severity_score: number;
  location: UiLocation | null;
  feedSource?: string;
  icao24?: string;
  callsign?: string;
  velocity_mps?: number;
  true_track_deg?: number;
  baro_altitude_m?: number;
  on_ground?: boolean;
  temperature_2m?: number;
  wind_speed_10m?: number;
}

export interface UiSignal {

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

export interface UiEventHourBucket {
  bucket_key: string;
  domain: string;
  utc_hour_bin: number;
  event_count: number;
  total_severity: number;
  updated_at: string;
}

export type ConnectionState = "connecting" | "live" | "offline";
