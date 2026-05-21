<!--
  Maps connection + readiness into user-visible toasts. Logic lives in a
  headless Svelte file so it can use `$effect` on reactive dashboard state.
-->
<script lang="ts">
  import { dashboard } from "../state.svelte";
  import { readiness } from "../readiness.svelte";
  import { isCompactLayout } from "../mobile-layout";
  import { notifyError, notifyInfo, notifySuccess, notifyWarning } from "./notify";
  import { NOTIFY_CODES } from "./notify-codes";
  import { shouldProbeIngest, shouldProbeLlm } from "../native-config";

  let previousConn = $state<typeof dashboard.connection | null>(null);
  let everLive = $state(false);

  $effect(() => {
    if (dashboard.dataMode === "demo") return;

    const c = dashboard.connection;
    const err = dashboard.connectionLastError;

    if (previousConn === null) {
      previousConn = c;
      if (c === "live") everLive = true;
      return;
    }
    if (c === previousConn) return;
    const from = previousConn;
    previousConn = c;

    if (c === "live") {
      if (!everLive) {
        everLive = true;
      } else if (from === "offline" || from === "connecting") {
        notifySuccess({
          code: NOTIFY_CODES.STDB_LIVE,
          title: "SpacetimeDB reconnected",
          message:
            "The live data stream is active again. Dashboard tiles will refresh as new rows arrive.",
          action: "If this keeps flapping, inspect network stability and SpacetimeDB logs on the host.",
        });
      }
      return;
    }

    if (c === "offline" && (from === "live" || from === "connecting")) {
      const detail = err ? err : undefined;
      notifyError({
        code: NOTIFY_CODES.STDB_OFFLINE,
        title: "Lost connection to SpacetimeDB",
        message:
          "The app will try to reconnect in the background. You may be viewing cached data until the link is restored.",
        detail,
        action: "Check that SpacetimeDB is running, the database name in Vite env matches, and the module is published. Use the status bar to reconnect now.",
        dedupeKey: "STDB_OFFLINE",
      });
    }

    if (c === "connecting" && from === "offline" && !isCompactLayout()) {
      notifyInfo({
        code: NOTIFY_CODES.STDB_RECONNECTING,
        title: "Reconnecting to SpacetimeDB…",
        message: "The client is opening a new WebSocket and resubscribing to dashboard queries with exponential backoff.",
        dedupeKey: "STDB_RECONNECT",
      });
    }
  });

  let prevIngest: boolean | null = null;
  let prevLlm: boolean | null = null;
  let readinessPrimed = false;

  $effect(() => {
    if (dashboard.dataMode === "demo") return;
    if (readiness.readinessRefreshing) return;
    if (readiness.ingestReady === null && readiness.llmReady === null) return;

    const ing = readiness.ingestReady;
    const llm = readiness.llmReady;
    if (!readinessPrimed) {
      readinessPrimed = true;
      prevIngest = ing;
      prevLlm = llm;
      return;
    }

    const compact = isCompactLayout();
    const probeIngest = shouldProbeIngest();
    const probeLlm = shouldProbeLlm();

    if (prevIngest === true && ing === false && (!compact || probeIngest)) {
      const extra = readiness.ingestCheckErr
        ? ` (${readiness.ingestCheckErr})`
        : "";
      notifyWarning({
        code: NOTIFY_CODES.INGEST_UNREACHABLE,
        title: "Ingest service is not ready",
        message: `The /ready check did not return success${extra}. Pipelines and enrichers may be unavailable; map or intelligence features could lag.`,
        action: "For local dev, run the full stack in ./dev.sh and confirm the Vite proxy for /ready. See Settings for the latest probe result.",
        source: "ingest",
        dedupeKey: "INGEST_DOWN",
      });
    }

    if (prevLlm === true && llm === false && (!compact || probeLlm)) {
      notifyWarning({
        code: NOTIFY_CODES.LLM_UNREACHABLE,
        title: "LLM bridge is not available",
        message:
          "Narrative and summarisation features that use the /v1/ready check will be unavailable or degraded until the model endpoint responds.",
        action: "In Settings, copy the model bridge URL and verify the service is up and CORS/keys are set.",
        source: "llm",
        dedupeKey: "LLM_DOWN",
      });
    }

    prevIngest = ing;
    prevLlm = llm;
  });
</script>
