/**
 * Public facade for Settings live diagnostics (ops console).
 * Implementation lives under `lib/observability/`.
 */

export type { LogLevel, LogLine } from "../observability/log-stream";
export {
  appendOpsLog,
  clearOpsLog,
  getOpsLogLines,
  opsLogRevision,
  subscribeOpsLog,
  trimOpsLog,
  OPS_LOG_MAX_LINES,
} from "../observability/log-stream";

export type {
  IngestMetricsSnapshot,
  ObservabilitySnapshot,
  StatusExtras,
} from "../observability/ingest-status";
export {
  fetchIngestMetricsText,
  fetchObservabilitySnapshot,
  INGEST_METRIC_NAMES,
  parsePrometheusCounters,
} from "../observability/ingest-status";

export type { IngestMetricName } from "../observability/prometheus";

export {
  acquireOpsPolling,
  OPS_POLL_MS,
  opsObservability,
  refreshOpsObservability,
} from "../observability/observability.svelte";

import { checkLlmBridgePing } from "../llm";

const llmBase =
  (import.meta.env.VITE_LLM_BASE as string | undefined)?.replace(/\/$/, "") ||
  "/api/llm";

/** `GET /health` — ingest process liveness (body `ok`). */
export async function fetchIngestHealth(): Promise<{
  ok: boolean;
  err: string | null;
}> {
  try {
    const r = await fetch("/health", { method: "GET" });
    if (!r.ok) {
      return { ok: false, err: `${r.status} ${r.statusText}` };
    }
    const text = (await r.text()).trim();
    if (text === "ok") return { ok: true, err: null };
    return { ok: false, err: `unexpected body: ${text.slice(0, 80)}` };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : String(e) };
  }
}

/** LLM bridge reachability (`GET …/v1/ready`). */
export async function fetchLlmHealth(): Promise<{
  ready: boolean;
  configured: boolean;
  base: string;
  err: string | null;
}> {
  const configured = Boolean(
    (import.meta.env.VITE_LLM_BASE as string | undefined)?.trim() ||
      import.meta.env.DEV,
  );
  try {
    const ready = await checkLlmBridgePing();
    return {
      ready,
      configured,
      base: llmBase,
      err: ready ? null : "bridge /v1/ready failed",
    };
  } catch (e) {
    return {
      ready: false,
      configured,
      base: llmBase,
      err: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Human labels for Prometheus counter names. */
export const METRIC_LABELS: Record<string, string> = {
  openatlas_ingest_events_fetched_total: "Events fetched",
  openatlas_ingest_events_accepted_total: "Events accepted",
  openatlas_ingest_events_duplicate_total: "Duplicates",
  openatlas_ingest_events_rejected_total: "Rejected",
  openatlas_ingest_events_transport_error_total: "Transport errors",
  openatlas_ingest_batch_calls_total: "Batch pushes",
  openatlas_ingest_batch_fallback_calls_total: "Batch fallbacks",
};
