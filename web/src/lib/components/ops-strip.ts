import type { DataMode } from "../data-source-copy";
import type { ConnectionState } from "../types";
import type { FeedHealthSummary } from "../feed-live.svelte";
import { solarPhaseForMin, type SimMinOfDay } from "../map/solar-time-scrub";

export function connectionOpsLabel(
  dataMode: DataMode,
  connection: ConnectionState,
  autoReconnectAttempt = 0,
  autoReconnectExhausted = false,
): string {
  if (dataMode === "demo") return "Preview";
  if (connection === "live") return "Live";
  if (connection === "connecting") return "Connecting";
  if (autoReconnectExhausted) return "Offline (retry stopped)";
  if (autoReconnectAttempt > 0) return `Offline (retry ${autoReconnectAttempt})`;
  return "Offline";
}

export function connectionOpsTier(
  dataMode: DataMode,
  connection: ConnectionState,
): "live" | "degraded" | "offline" {
  if (dataMode === "demo") return "degraded";
  if (connection === "live") return "live";
  if (connection === "connecting") return "degraded";
  return "offline";
}

export function feedOpsHint(
  summary: FeedHealthSummary | null,
  loading: boolean,
  error: string | null,
): string {
  if (error) return `Feeds unreachable — ${error}`;
  if (loading && !summary) return "Loading feed status…";
  if (!summary) return "Feeds idle or disabled";
  if (summary.error > 0) {
    return `${summary.error} feed${summary.error === 1 ? "" : "s"} in error · ${summary.ok}/${summary.total} OK`;
  }
  if (summary.ok === summary.total) {
    return `${summary.ok}/${summary.total} feeds OK`;
  }
  return `${summary.ok}/${summary.total} OK · ${summary.degraded} degraded`;
}

export function feedOpsTier(
  summary: FeedHealthSummary | null,
  loading: boolean,
  error: string | null,
): "live" | "degraded" | "offline" | "unknown" {
  if (error) return "offline";
  if (loading && !summary) return "unknown";
  if (!summary) return "unknown";
  if (summary.error > 0) return "degraded";
  if (summary.ok > 0) return "live";
  if (summary.degraded > 0) return "degraded";
  return "offline";
}

/** Short sim-time line for the ops strip (UTC date + phase). */
export function simOpsLine(
  simUtcLabel: string,
  minOfDay: SimMinOfDay,
): { clock: string; phase: string } {
  const phase = solarPhaseForMin(minOfDay);
  const clock = simUtcLabel.includes(" ")
    ? simUtcLabel.split(" ").slice(1).join(" ") || simUtcLabel
    : simUtcLabel;
  return { clock, phase: phase.label };
}
