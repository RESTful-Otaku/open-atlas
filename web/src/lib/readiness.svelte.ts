/**
 * Shared LLM + ingest reachability checks (also shown in Settings).
 * SpacetimeDB status lives on `dashboard.connection` in `state.svelte.ts`.
 */
import { checkLlmBridgeReady } from "./llm";

export const readiness = $state({
  llmReady: null as boolean | null,
  ingestReady: null as boolean | null,
  readinessRefreshing: false,
  ingestCheckErr: null as string | null,
});

async function fetchIngestOk(): Promise<{ ok: boolean; err: string | null }> {
  try {
    const r = await fetch("/ready", { method: "GET" });
    if (r.ok) return { ok: true, err: null };
    return { ok: false, err: `${r.status} ${r.statusText}` };
  } catch (e) {
    return {
      ok: false,
      err: e instanceof Error ? e.message : String(e),
    };
  }
}

/** GET /ready on the ingest service (proxied in Vite dev) + LLM /v1/ready. */
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
    readiness.ingestCheckErr = ing.err;
  } finally {
    readiness.readinessRefreshing = false;
  }
}
