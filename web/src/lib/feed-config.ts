/**
 * Ingest feed catalog + API key management (`GET/PUT /feeds`, test/reconnect).
 */

import { readResponseJson } from "./http-json";
import { ingestUrl, shouldProbeIngest } from "./native-config";
import { probeFetch } from "./probe-fetch";

export type FeedConnectionStatus =
  | "ok"
  | "degraded"
  | "error"
  | "test_failed"
  | "needs_key"
  | "mode_off"
  | "disabled"
  | "idle"
  | "starting"
  | "circuit_open";

export interface FeedRow {
  name: string;
  label: string;
  source_url: string;
  poll_interval_secs: number;
  default_poll_interval_secs: number;
  last_events_accepted: number;
  last_events_duplicate: number;
  last_poll_at: string | null;
  next_poll_at: string | null;
  circuit_open: boolean;
  requires_env: string | null;
  api_key_configured: boolean;
  api_key_preview: string | null;
  enabled: boolean;
  worker_running: boolean;
  connection: FeedConnectionStatus;
  success_count: number;
  failure_count: number;
  consecutive_failures: number;
  last_success: string | null;
  last_error: string | null;
  next_retry_ms: number | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_message: string | null;
  last_test_event_count: number | null;
}

export interface SecretFieldRow {
  env_key: string;
  description: string;
  configured: boolean;
  preview: string | null;
  feeds: string[];
}

export interface FeedCatalog {
  secrets_path: string;
  poll_config_path: string;
  retention_hours: number;
  poll_interval_options_secs: number[];
  ingest_mode: string;
  live_feeds_enabled: boolean;
  feeds: FeedRow[];
  secret_fields: SecretFieldRow[];
}

export interface FeedTestResult {
  feed: string;
  ok: boolean;
  event_count: number;
  message: string;
  duration_ms: number;
}

async function parseError(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* */
  }
  return `${r.status} ${r.statusText}`;
}

export async function fetchFeedCatalog(): Promise<FeedCatalog> {
  if (!shouldProbeIngest()) {
    throw new Error("Ingest URL not configured (set VITE_INGEST_BASE)");
  }
  const r = await probeFetch(ingestUrl("/feeds"), { method: "GET" }, 12_000);
  if (!r.ok) throw new Error(await parseError(r));
  const parsed = await readResponseJson<FeedCatalog>(r);
  if (!parsed.ok) throw new Error(parsed.err);
  return parsed.data;
}

export async function updateFeedPollIntervals(
  intervals: Record<string, number>,
): Promise<FeedCatalog> {
  const r = await fetch(ingestUrl("/feeds/poll-intervals"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intervals }),
  });
  if (!r.ok) throw new Error(await parseError(r));
  return (await r.json()) as FeedCatalog;
}

export async function updateFeedSecrets(
  secrets: Record<string, string>,
): Promise<FeedCatalog> {
  const r = await fetch(ingestUrl("/feeds"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secrets }),
  });
  if (!r.ok) throw new Error(await parseError(r));
  return (await r.json()) as FeedCatalog;
}

export async function testFeed(name: string): Promise<FeedTestResult> {
  const r = await fetch(ingestUrl(`/feeds/${encodeURIComponent(name)}/test`), {
    method: "POST",
  });
  if (!r.ok) throw new Error(await parseError(r));
  return (await r.json()) as FeedTestResult;
}

export async function reconnectFeed(name: string): Promise<FeedTestResult> {
  const r = await fetch(ingestUrl(`/feeds/${encodeURIComponent(name)}/reconnect`), {
    method: "POST",
  });
  if (!r.ok) throw new Error(await parseError(r));
  return (await r.json()) as FeedTestResult;
}

/** Human label for a poll interval option (seconds). */
export function pollIntervalLabel(secs: number): string {
  switch (secs) {
    case 30:
      return "30 seconds";
    case 60:
      return "1 minute";
    case 300:
      return "5 minutes";
    case 1800:
      return "30 minutes";
    case 3600:
      return "1 hour";
    case 14_400:
      return "4 hours";
    default:
      return `${secs}s`;
  }
}

/** Minimum poll interval the server allows for a feed (protects upstream APIs). */
export function minPollIntervalSecs(feedName: string): number {
  switch (feedName) {
    case "gdelt":
    case "world-bank":
    case "opensky":
    case "eia":
    case "fred":
      return 300;
    case "nasa-eonet":
      return 180;
    case "coingecko":
      return 60;
    default:
      return 30;
  }
}

/** Relative countdown until the next scheduled poll. */
export function formatNextPoll(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "due";
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `in ${sec}s`;
  if (sec < 3600) return `in ${Math.ceil(sec / 60)}m`;
  return `in ${Math.ceil(sec / 3600)}h`;
}

export function formatLastPoll(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

export function connectionLabel(status: FeedConnectionStatus): string {
  switch (status) {
    case "ok":
      return "Connected";
    case "degraded":
      return "Degraded";
    case "error":
      return "Error";
    case "test_failed":
      return "Test failed";
    case "needs_key":
      return "Needs API key";
    case "mode_off":
      return "Live feeds off";
    case "disabled":
      return "Disabled";
    case "starting":
      return "Starting…";
    case "circuit_open":
      return "Circuit open";
    default:
      return "Idle";
  }
}
