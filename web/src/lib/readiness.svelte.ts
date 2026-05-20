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

const CAPABLE_CACHE_MS = 5 * 60_000;
let capableCached: boolean | null = null;
let capableCachedAt = 0;

/**
 * Refresh LLM readiness before analysis.
 * - Default (`deep=false`): fast ping via `/v1/ready` only.
 * - `deep=true`: also runs `/v1/capable` (slow on cold CPU) — use Settings test
 *   or when ping fails; result is cached for five minutes.
 */
export async function ensureLlmReady(deep = false): Promise<boolean> {
  await refreshRemoteReadiness();
  if (readiness.llmReady === true && !deep) {
    return true;
  }
  const cacheFresh =
    capableCached !== null && Date.now() - capableCachedAt < CAPABLE_CACHE_MS;
  if (!deep && cacheFresh) {
    readiness.llmReady = capableCached;
    return capableCached === true;
  }
  if (deep || readiness.llmReady === false) {
    capableCached = await checkLlmBridgeCapable();
    capableCachedAt = Date.now();
    readiness.llmReady = capableCached;
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
