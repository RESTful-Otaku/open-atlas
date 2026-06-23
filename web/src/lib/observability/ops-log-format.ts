

import { ingestUrl, shouldProbeIngest } from "../native-config";
import { summarizeFeeds } from "../feed-health-summary";
import type { FeedCatalog } from "../feed-config";
import { INGEST_METRIC_NAMES } from "./prometheus";
import type { ObservabilitySnapshot } from "./ingest-status";

export function ingestProbeBaseLabel(): string {
  if (!shouldProbeIngest()) return "ingest (not configured — STDB-only)";
  return ingestUrl("").replace(/\/$/, "") || "(same-origin)";
}

export function formatFeedCatalogSummary(catalog: FeedCatalog | null): string {
  if (!catalog) return "feeds: no catalog";
  if (!catalog.live_feeds_enabled) {
    return `feeds: live_feeds disabled (ingest_mode=${catalog.ingest_mode})`;
  }
  const s = summarizeFeeds(catalog);
  if (!s) return `feeds: ${catalog.feeds.length} rows`;
  const parts = [`${s.ok} ok`, `${s.degraded} degraded`, `${s.error} error`, `${s.idle} idle`];
  const troubled = catalog.feeds
    .filter((f) => f.connection === "error" || f.circuit_open)
    .map((f) => f.name)
    .slice(0, 5);
  let line = `feeds: ${s.total} total — ${parts.join(", ")}`;
  if (troubled.length) {
    line += ` · issues: ${troubled.join(", ")}${troubled.length < catalog.feeds.filter((f) => f.connection === "error").length ? "…" : ""}`;
  }
  return line;
}

export function formatMetricsSummary(
  snap: ObservabilitySnapshot,
  prev: Partial<Record<string, number>> | null,
): string[] {
  const lines: string[] = [];
  const c = snap.prometheus;
  if (snap.metricsErr) {
    lines.push(`metrics: ${snap.metricsErr}`);
    return lines;
  }
  const parts: string[] = [];
  for (const name of INGEST_METRIC_NAMES) {
    const v = c[name];
    if (v == null) continue;
    const short = name.replace("openatlas_ingest_", "").replace(/_total$/, "");
    const prevV = prev?.[name];
    if (prevV != null && prevV !== v) {
      parts.push(`${short}=${v} (+${v - prevV})`);
    } else {
      parts.push(`${short}=${v}`);
    }
  }
  if (parts.length) {
    lines.push(`metrics: ${parts.join(" · ")}`);
  } else if (snap.statusExtras?.ingest_metrics) {
    const m = snap.statusExtras.ingest_metrics;
    lines.push(
      `metrics (/status): accepted=${m.events_accepted} fetched=${m.events_fetched} rejected=${m.events_rejected} transport_err=${m.events_transport_error}`,
    );
  } else {
    lines.push("metrics: no counters yet");
  }
  return lines;
}

export function formatIngestPollLines(
  snap: ObservabilitySnapshot,
  pollNum: number,
  durationMs: number,
  prevMetrics: Partial<Record<string, number>> | null,
  options?: { ingestProbes?: boolean },
): Array<{ level: "info" | "ok" | "warn" | "error"; message: string }> {
  const lines: Array<{ level: "info" | "ok" | "warn" | "error"; message: string }> = [];
  const probeIngest = options?.ingestProbes ?? shouldProbeIngest();

  if (!probeIngest) {
    lines.push({
      level: "info",
      message: `Poll #${pollNum} (${durationMs}ms): ingest HTTP not configured — monitoring SpacetimeDB connection only`,
    });
    return lines;
  }

  const level: "ok" | "warn" | "error" = snap.ingestReady
    ? "ok"
    : snap.ingestReachable
      ? "warn"
      : "error";

  const st = snap.status;
  const head = st
    ? `Poll #${pollNum} (${durationMs}ms): ingest ${snap.ingestReady ? "ready" : snap.ingestReachable ? "reachable" : "down"} · mode=${st.ingest_mode} sim=${st.simulators_enabled} live_feeds=${st.live_feeds_enabled}`
    : `Poll #${pollNum} (${durationMs}ms): ingest unreachable`;
  lines.push({ level, message: head });

  if (snap.ingestErr) {
    lines.push({ level: "error", message: `GET /status: ${snap.ingestErr}` });
  }
  if (snap.feedsErr) {
    lines.push({ level: "error", message: `GET /feeds: ${snap.feedsErr}` });
  }

  if (st) {
    lines.push({
      level: st.stdb_reachable ? "ok" : "warn",
      message: `ingest→STDB: ${st.stdb_reachable ? "reachable" : "unreachable"} @ ${st.stdb_uri}/${st.stdb_database}${st.stdb_event_count != null ? ` · ${st.stdb_event_count} events in DB` : ""} · uptime ${st.uptime_seconds}s`,
    });
    if (st.feeds.length) {
      const failing = st.feeds.filter((f) => f.consecutive_failures > 0 || f.last_error);
      if (failing.length) {
        for (const f of failing.slice(0, 4)) {
          const err = f.last_error ? ` — ${f.last_error.slice(0, 120)}` : "";
          lines.push({
            level: "warn",
            message: `feed ${f.name}: ok=${f.success_count} fail=${f.failure_count} consec=${f.consecutive_failures}${err}`,
          });
        }
        if (failing.length > 4) {
          lines.push({
            level: "warn",
            message: `… and ${failing.length - 4} more feeds with failures (see Feeds tab)`,
          });
        }
      }
    }
    if (snap.statusExtras?.stdb_audit_row_count != null) {
      lines.push({
        level: "info",
        message: `ingest audit rows: ${snap.statusExtras.stdb_audit_row_count}`,
      });
    }
  }

  if (snap.feeds) {
    lines.push({
      level: snap.feedsErr ? "warn" : "info",
      message: formatFeedCatalogSummary(snap.feeds),
    });
  }

  for (const m of formatMetricsSummary(snap, prevMetrics)) {
    lines.push({ level: snap.metricsErr ? "warn" : "info", message: m });
  }

  lines.push({
    level: "info",
    message: `probe base: ${ingestProbeBaseLabel()}`,
  });

  return lines;
}

export function formatLlmProbeLog(result: {
  ready: boolean;
  configured: boolean;
  base: string;
  err: string | null;
}): string {
  if (!result.configured) {
    return "LLM bridge not configured (use Gemini in Settings or set VITE_LLM_BASE)";
  }
  if (result.ready) {
    return `LLM bridge ready @ ${result.base}`;
  }
  return `LLM bridge down @ ${result.base}${result.err ? ` — ${result.err}` : ""}`;
}

export function formatReadinessLog(ingest: {
  ok: boolean | null;
  err: string | null;
  mode?: string;
}): string {
  if (ingest.ok === null) return "readiness: ingest check skipped";
  if (ingest.ok) {
    return `readiness: ingest OK${ingest.mode ? ` (mode=${ingest.mode})` : ""}`;
  }
  return `readiness: ingest down${ingest.err ? ` — ${ingest.err}` : ""}`;
}
