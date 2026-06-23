import { checkLlmBridgeCapable } from "./llm";
import { checkLlmProviderReady, usesClientSideLlm } from "./llm/llm-providers";
import {
  fetchIngestHealth,
  fetchIngestReady,
  fetchIngestStatus,
  type IngestServiceStatus,
} from "./ingest-status";
import { ingestUrl, shouldProbeIngest, shouldProbeLlm } from "./native-config";
import { appendOpsLog } from "./observability/log-stream";
import { formatLlmProbeLog, formatReadinessLog } from "./observability/ops-log-format";
import { fetchLlmHealth } from "./ops/ops-console";
import { dashboard } from "./state.svelte";

export const readiness = $state({
  llmReady: null as boolean | null,
  ingestReady: null as boolean | null,
  ingestStatus: null as IngestServiceStatus | null,
  readinessRefreshing: false,
  ingestCheckErr: null as string | null,
});

let lastReadinessLogKey = "";

async function fetchIngestOk(): Promise<{
  ok: boolean | null;
  err: string | null;
  status: IngestServiceStatus | null;
}> {
  if (!shouldProbeIngest()) {
    return { ok: null, err: null, status: null };
  }
  const [healthy, ready, result] = await Promise.all([
    fetchIngestHealth(),
    fetchIngestReady(),
    fetchIngestStatus(),
  ]);
  if (!healthy && !result.ok) {
    const probe = ingestUrl("/health");
    return {
      ok: false,
      err:
        result.err ??
        (probe
          ? `ingest unreachable at ${probe} — run OPENATLAS_INGEST_LAN_BIND=1 ./dev.sh start:cloud:live on your PC (emulator: use 10.0.2.2)`
          : "ingest unreachable (configure ingest URL in Settings → Deployment)"),
      status: null,
    };
  }
  if (!result.ok) {
    return { ok: false, err: result.err, status: null };
  }
  const stdbOk = result.status?.stdb_reachable === true;
  const browserStdbLive =
    dashboard.dataMode !== "demo" && dashboard.connection === "live";
  if (!healthy && !ready) {
    return {
      ok: false,
      err: "ingest not responding on /health or /ready",
      status: result.status,
    };
  }
  if (!ready && !stdbOk && !browserStdbLive) {
    return {
      ok: false,
      err: "ingest /ready failed (cannot reach SpacetimeDB)",
      status: result.status,
    };
  }
  if (!stdbOk && !browserStdbLive) {
    return {
      ok: false,
      err: "ingest reports SpacetimeDB unreachable",
      status: result.status,
    };
  }
  if (!stdbOk && browserStdbLive) {
    return {
      ok: true,
      err: "ingest up; STDB reachable in browser (ingest ping lagging)",
      status: result.status,
    };
  }
  return { ok: true, err: null, status: result.status };
}

const CAPABLE_CACHE_MS = 5 * 60_000;
let capableCached: boolean | null = null;
let capableCachedAt = 0;


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
  if (usesClientSideLlm()) {
    readiness.llmReady = await checkLlmProviderReady();
    return readiness.llmReady === true;
  }
  if (deep || readiness.llmReady === false) {
    capableCached = await checkLlmBridgeCapable();
    capableCachedAt = Date.now();
    readiness.llmReady = capableCached;
  }
  return readiness.llmReady === true;
}


export async function refreshRemoteReadiness(): Promise<void> {
  if (readiness.readinessRefreshing) return;
  readiness.readinessRefreshing = true;
  readiness.ingestCheckErr = null;
  try {
    const [llm, ing] = await Promise.all([
      usesClientSideLlm() || shouldProbeLlm()
        ? checkLlmProviderReady()
        : Promise.resolve(null),
      fetchIngestOk(),
    ]);
    readiness.llmReady = llm;
    readiness.ingestReady = ing.ok;
    readiness.ingestStatus = ing.status;
    readiness.ingestCheckErr = ing.err;

    const logKey = [
      ing.ok,
      ing.err,
      ing.status?.ingest_mode,
      llm,
      dashboard.dataMode,
      dashboard.connection,
      dashboard.connectionLastError,
    ].join("|");
    if (logKey !== lastReadinessLogKey) {
      lastReadinessLogKey = logKey;
      appendOpsLog(
        ing.ok === true ? "ok" : ing.ok === false ? "error" : "info",
        "readiness",
        formatReadinessLog({
          ok: ing.ok,
          err: ing.err,
          mode: ing.status?.ingest_mode,
        }),
      );
      if (llm !== null && shouldProbeLlm()) {
        fetchLlmHealth().then((llmDetail) => {
          appendOpsLog(
            llmDetail.ready ? "ok" : llmDetail.configured ? "warn" : "info",
            "llm",
            formatLlmProbeLog(llmDetail),
          );
        });
      } else if (usesClientSideLlm()) {
        appendOpsLog(
          readiness.llmReady ? "ok" : "warn",
          "llm",
          readiness.llmReady
            ? "Cloud LLM provider configured (Settings)"
            : "Cloud LLM not ready — add API key in Settings",
        );
      }
      appendOpsLog(
        dashboard.connection === "live" ? "ok" : dashboard.connection === "connecting" ? "info" : "warn",
        "app",
        `UI state: dataMode=${dashboard.dataMode} connection=${dashboard.connection}${dashboard.connectionLastError ? ` · ${dashboard.connectionLastError}` : ""}`,
      );
    }
  } finally {
    readiness.readinessRefreshing = false;
  }
}
