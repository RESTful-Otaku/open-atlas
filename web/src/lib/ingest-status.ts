import { readResponseJson } from "./http-json";
import { ingestUrl, shouldProbeIngest } from "./native-config";
import { probeFetch } from "./probe-fetch";

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


export async function fetchIngestHealth(): Promise<boolean> {
  if (!shouldProbeIngest()) return false;
  try {
    const r = await probeFetch(ingestUrl("/health"), { method: "GET" }, 8_000);
    return r.ok;
  } catch {
    return false;
  }
}


export async function fetchIngestReady(): Promise<boolean> {
  if (!shouldProbeIngest()) return false;
  try {
    const r = await probeFetch(ingestUrl("/ready"), { method: "GET" }, 8_000);
    if (!r.ok) return false;
    const parsed = await readResponseJson<{ ready?: boolean }>(r);
    if (!parsed.ok) return false;
    return parsed.data.ready === true;
  } catch {
    return false;
  }
}

export async function fetchIngestStatus(): Promise<{
  ok: boolean;
  status: IngestServiceStatus | null;
  err: string | null;
}> {
  if (!shouldProbeIngest()) {
    return { ok: false, status: null, err: "Ingest URL not configured (set VITE_INGEST_BASE)" };
  }
  try {
    const r = await probeFetch(ingestUrl("/status"), { method: "GET" }, 8_000);
    if (!r.ok) {
      return { ok: false, status: null, err: `${r.status} ${r.statusText}` };
    }
    const parsed = await readResponseJson<
      Omit<IngestServiceStatus, "ingest_mode"> & { ingest_mode: string }
    >(r);
    if (!parsed.ok) {
      return { ok: false, status: null, err: parsed.err };
    }
    const body = parsed.data;
    const status: IngestServiceStatus = {
      ...body,
      ingest_mode: parseIngestMode(body.ingest_mode),
    };
    return { ok: true, status, err: null };
  } catch (e) {
    const base = ingestUrl("");
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: null,
      err: base ? `${msg} (tried ${ingestUrl("/status")})` : msg,
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
