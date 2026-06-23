

export const INGEST_METRIC_NAMES = [
  "openatlas_ingest_events_fetched_total",
  "openatlas_ingest_events_accepted_total",
  "openatlas_ingest_events_duplicate_total",
  "openatlas_ingest_events_rejected_total",
  "openatlas_ingest_events_transport_error_total",
  "openatlas_ingest_batch_calls_total",
  "openatlas_ingest_batch_fallback_calls_total",
] as const;

export type IngestMetricName = (typeof INGEST_METRIC_NAMES)[number];


export function ingestMetricsSnapshotToCounters(snapshot: {
  events_fetched: number;
  events_accepted: number;
  events_duplicate: number;
  events_rejected: number;
  events_transport_error: number;
  batch_calls: number;
  batch_fallback_calls: number;
}): Partial<Record<IngestMetricName, number>> {
  return {
    openatlas_ingest_events_fetched_total: snapshot.events_fetched,
    openatlas_ingest_events_accepted_total: snapshot.events_accepted,
    openatlas_ingest_events_duplicate_total: snapshot.events_duplicate,
    openatlas_ingest_events_rejected_total: snapshot.events_rejected,
    openatlas_ingest_events_transport_error_total: snapshot.events_transport_error,
    openatlas_ingest_batch_calls_total: snapshot.batch_calls,
    openatlas_ingest_batch_fallback_calls_total: snapshot.batch_fallback_calls,
  };
}


export function parsePrometheusCounters(text: string): Partial<Record<IngestMetricName, number>> {
  const out: Partial<Record<IngestMetricName, number>> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const space = trimmed.lastIndexOf(" ");
    if (space <= 0) continue;
    const name = trimmed.slice(0, space).trim();
    const value = Number(trimmed.slice(space + 1).trim());
    if (!Number.isFinite(value)) continue;
    if ((INGEST_METRIC_NAMES as readonly string[]).includes(name)) {
      out[name as IngestMetricName] = value;
    }
  }
  return out;
}
