/**
 * Shared LLM + ingest reachability checks (also shown in Settings).
 * SpacetimeDB status lives on `dashboard.connection` in `state.svelte.ts`.
 */
import { checkLlmBridgeCapable, checkLlmBridgeReady } from "./llm";
import {
  fetchIngestReady,
  fetchIngestStatus,
  type IngestServiceStatus,
} from "./ingest-status";

export const readiness = $state({
  llmReady: null as boolean | null,
  ingestReady: null as boolean | null,
  ingestStatus: null as IngestServiceStatus | null,
  readinessRefreshing: false,
  ingestCheckErr: null as string | null,
});

async function fetchIngestOk(): Promise<{
  ok: boolean;
  err: string | null;
  status: IngestServiceStatus | null;
}> {
  const [ready, result] = await Promise.all([fetchIngestReady(), fetchIngestStatus()]);
  if (!result.ok) {
    return { ok: false, err: result.err, status: null };
  }
  const stdbOk = result.status?.stdb_reachable === true;
  if (!ready) {
    return {
      ok: false,
      err: "ingest /ready failed (cannot reach SpacetimeDB)",
      status: result.status,
    };
  }
  if (!stdbOk) {
    return {
      ok: false,
      err: "ingest reports SpacetimeDB unreachable",
      status: result.status,
    };
  }
  return { ok: true, err: null, status: result.status };
}

/**
 * Refresh LLM readiness before analysis. When `deep` is true, also runs a tiny
 * Ollama completion (catches CUDA / model load failures that /v1/ready misses).
 */
export async function ensureLlmReady(deep = false): Promise<boolean> {
  await refreshRemoteReadiness();
  if (deep) {
    readiness.llmReady = await checkLlmBridgeCapable();
  }
  return readiness.llmReady === true;
}

/** GET /ready on the ingest service (proxied in Vite dev) + LLM /v1/ready + /status. */
export async function refreshRemoteReadiness(): Promise<void> {
  if (readiness.readinessRefreshing) return;
  readiness.readinessRefreshing = true;
  readiness.ingestCheckErr = null;
  try {
    const [llm, ing] = await Promise.all([
      checkLlmBridgeReady(),
      fetchIngestOk(),
    ]);
    readiness.llmReady = llm;
    readiness.ingestReady = ing.ok;
    readiness.ingestStatus = ing.status;
    readiness.ingestCheckErr = ing.err;
  } finally {
    readiness.readinessRefreshing = false;
  }
}
