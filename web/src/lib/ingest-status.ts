/**
 * Parsed shape of `GET /status` from openatlas-ingest.
 */

export type IngestModeId = "sim" | "live" | "hybrid" | "static";

function parseIngestMode(raw: string): IngestModeId {
  if (raw === "live" || raw === "hybrid" || raw === "static") return raw;
  return "sim";
}

export interface IngestFeedStatus {
  name: string;
  enabled: boolean;
  success_count: number;
  failure_count: number;
  consecutive_failures: number;
  last_error: string | null;
}

export interface IngestServiceStatus {
  uptime_seconds: number;
  ingest_mode: IngestModeId;
  simulators_enabled: boolean;
  live_feeds_enabled: boolean;
  stdb_uri: string;
  stdb_database: string;
  stdb_reachable: boolean;
  stdb_event_count?: number | null;
  feeds: IngestFeedStatus[];
}

/** `GET /ready` — ingest can reach SpacetimeDB (stricter than `/status` alone). */
export async function fetchIngestReady(): Promise<boolean> {
  try {
    const r = await fetch("/ready", { method: "GET" });
    if (!r.ok) return false;
    const body = (await r.json()) as { ready?: boolean };
    return body.ready === true;
  } catch {
    return false;
  }
}

export async function fetchIngestStatus(): Promise<{
  ok: boolean;
  status: IngestServiceStatus | null;
  err: string | null;
}> {
  try {
    const r = await fetch("/status", { method: "GET" });
    if (!r.ok) {
      return { ok: false, status: null, err: `${r.status} ${r.statusText}` };
    }
    const body = (await r.json()) as Omit<IngestServiceStatus, "ingest_mode"> & {
      ingest_mode: string;
    };
    const status: IngestServiceStatus = {
      ...body,
      ingest_mode: parseIngestMode(body.ingest_mode),
    };
    return { ok: true, status, err: null };
  } catch (e) {
    return {
      ok: false,
      status: null,
      err: e instanceof Error ? e.message : String(e),
    };
  }
}

export function ingestModeLabel(mode: IngestModeId): string {
  switch (mode) {
    case "live":
      return "Live open-data feeds only";
    case "hybrid":
      return "Live feeds + simulators (all domains)";
    case "static":
      return "Static fixture burst (no ongoing simulators)";
    default:
      return "Simulated feeds only";
  }
}
