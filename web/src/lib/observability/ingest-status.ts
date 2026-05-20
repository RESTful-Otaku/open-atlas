/**
 * Observability fetches: ingest `/status`, `/feeds`, `/metrics`.
 */

import { fetchFeedCatalog, type FeedCatalog } from "../feed-config";
import { fetchIngestReady, type IngestServiceStatus } from "../ingest-status";
import {
  ingestMetricsSnapshotToCounters,
  INGEST_METRIC_NAMES,
  parsePrometheusCounters,
  type IngestMetricName,
} from "./prometheus";

export interface IngestMetricsSnapshot {
  events_fetched: number;
  events_accepted: number;
  events_duplicate: number;
  events_rejected: number;
  events_transport_error: number;
  batch_calls: number;
  batch_fallback_calls: number;
}

export interface ObservabilitySnapshot {
  at: string;
  ingestReachable: boolean;
  ingestReady: boolean;
  ingestErr: string | null;
  status: IngestServiceStatus | null;
  statusExtras: StatusExtras | null;
  feeds: FeedCatalog | null;
  feedsErr: string | null;
  prometheus: Partial<Record<IngestMetricName, number>>;
  metricsErr: string | null;
}

export interface StatusExtras {
  ingest_metrics?: IngestMetricsSnapshot;
  stdb_audit_row_count?: number | null;
  data_plane?: Record<string, unknown>;
}

function parseStatusExtras(body: Record<string, unknown>): StatusExtras {
  const extras: StatusExtras = {};
  if (body.ingest_metrics && typeof body.ingest_metrics === "object") {
    extras.ingest_metrics = body.ingest_metrics as IngestMetricsSnapshot;
  }
  if ("stdb_audit_row_count" in body) {
    extras.stdb_audit_row_count = body.stdb_audit_row_count as number | null;
  }
  if (body.data_plane && typeof body.data_plane === "object") {
    extras.data_plane = body.data_plane as Record<string, unknown>;
  }
  return extras;
}

function formatMetricsFetchErr(status: number, statusText: string): string {
  if (status === 404) {
    return (
      "GET /metrics returned 404 — rebuild and restart ingest " +
      "(`cargo build -p openatlas-ingest` or `./dev.sh up`). " +
      "Until then, counters are taken from /status ingest_metrics when available."
    );
  }
  return `GET /metrics failed: ${status} ${statusText}`;
}

function hasPrometheusCounters(counters: Partial<Record<IngestMetricName, number>>): boolean {
  return INGEST_METRIC_NAMES.some((name) => counters[name] != null);
}

async function fetchStatusWithExtras(): Promise<{
  status: IngestServiceStatus | null;
  extras: StatusExtras | null;
  err: string | null;
}> {
  try {
    const r = await fetch("/status", { method: "GET" });
    if (!r.ok) {
      return { status: null, extras: null, err: `${r.status} ${r.statusText}` };
    }
    const body = (await r.json()) as Record<string, unknown> & {
      ingest_mode: string;
    };
    const { ingest_mode: rawMode, feeds } = body;
    const mode =
      rawMode === "live" || rawMode === "hybrid" || rawMode === "static"
        ? rawMode
        : "sim";
    const status = {
      uptime_seconds: Number(body.uptime_seconds ?? 0),
      ingest_mode: mode,
      simulators_enabled: Boolean(body.simulators_enabled),
      live_feeds_enabled: Boolean(body.live_feeds_enabled),
      stdb_uri: String(body.stdb_uri ?? ""),
      stdb_database: String(body.stdb_database ?? ""),
      stdb_reachable: Boolean(body.stdb_reachable),
      stdb_event_count:
        body.stdb_event_count == null ? null : Number(body.stdb_event_count),
      feeds: Array.isArray(feeds) ? (feeds as IngestServiceStatus["feeds"]) : [],
    } satisfies IngestServiceStatus;
    return {
      status,
      extras: parseStatusExtras(body),
      err: null,
    };
  } catch (e) {
    return {
      status: null,
      extras: null,
      err: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function fetchIngestMetricsText(): Promise<{
  text: string | null;
  counters: Partial<Record<IngestMetricName, number>>;
  err: string | null;
}> {
  try {
    const r = await fetch("/metrics", { method: "GET" });
    if (!r.ok) {
      return {
        text: null,
        counters: {},
        err: formatMetricsFetchErr(r.status, r.statusText),
      };
    }
    const text = await r.text();
    const counters = parsePrometheusCounters(text);
    if (!hasPrometheusCounters(counters)) {
      return {
        text,
        counters,
        err: text.trim()
          ? "GET /metrics returned no openatlas_ingest_* counters"
          : "GET /metrics returned an empty body",
      };
    }
    return { text, counters, err: null };
  } catch (e) {
    return {
      text: null,
      counters: {},
      err: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function fetchObservabilitySnapshot(): Promise<ObservabilitySnapshot> {
  const at = new Date().toISOString();
  const [ready, statusResult, feedsResult, metricsResult] = await Promise.all([
    fetchIngestReady(),
    fetchStatusWithExtras(),
    fetchFeedCatalog().then(
      (catalog) => ({ catalog, err: null as string | null }),
      (e) => ({
        catalog: null,
        err: e instanceof Error ? e.message : String(e),
      }),
    ),
    fetchIngestMetricsText(),
  ]);

  const ingestReachable = statusResult.status !== null;
  const ingestErr = statusResult.err;
  const ingestReady = ready && statusResult.status?.stdb_reachable === true;

  let prometheus = metricsResult.counters;
  let metricsErr = metricsResult.err;
  const fromMetrics = hasPrometheusCounters(prometheus);
  const statusMetrics = statusResult.extras?.ingest_metrics;

  if (!fromMetrics && statusMetrics) {
    prometheus = ingestMetricsSnapshotToCounters(statusMetrics);
    metricsErr = null;
  }

  return {
    at,
    ingestReachable,
    ingestReady,
    ingestErr,
    status: statusResult.status,
    statusExtras: statusResult.extras,
    feeds: feedsResult.catalog,
    feedsErr: feedsResult.err,
    prometheus,
    metricsErr,
  };
}

/** Re-export for metrics tab labels. */
export {
  INGEST_METRIC_NAMES,
  ingestMetricsSnapshotToCounters,
  parsePrometheusCounters,
};
