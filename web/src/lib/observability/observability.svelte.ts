/**
 * Reactive observability polling for Settings ops console.
 */

import { appendOpsLog } from "./log-stream";
import { fetchObservabilitySnapshot, type ObservabilitySnapshot } from "./ingest-status";

export const OPS_POLL_MS = 8_000;

export const opsObservability = $state({
  snapshot: null as ObservabilitySnapshot | null,
  loading: false,
  lastPollErr: null as string | null,
  pollCount: 0,
});

let pollTimer: ReturnType<typeof setInterval> | undefined;
let pollConsumers = 0;

export async function refreshOpsObservability(logPoll = true): Promise<void> {
  if (opsObservability.loading) return;
  opsObservability.loading = true;
  try {
    const snap = await fetchObservabilitySnapshot();
    opsObservability.snapshot = snap;
    opsObservability.lastPollErr = snap.ingestErr ?? snap.feedsErr ?? snap.metricsErr;
    opsObservability.pollCount += 1;
    if (logPoll) {
      const mode = snap.status?.ingest_mode ?? "?";
      const stdb = snap.ingestReady ? "ready" : snap.ingestReachable ? "degraded" : "offline";
      appendOpsLog(
        snap.ingestReady ? "ok" : snap.ingestReachable ? "warn" : "error",
        "ingest",
        `Poll #${opsObservability.pollCount}: mode=${mode}, stdb=${stdb}`,
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    opsObservability.lastPollErr = msg;
    appendOpsLog("error", "ingest", `Poll failed: ${msg}`);
  } finally {
    opsObservability.loading = false;
  }
}

/** Start interval polling while Settings console is open/expanded. */
export function acquireOpsPolling(): () => void {
  pollConsumers += 1;
  if (pollConsumers === 1) {
    void refreshOpsObservability(false);
    pollTimer = setInterval(() => {
      void refreshOpsObservability(true);
    }, OPS_POLL_MS);
  }
  return () => {
    pollConsumers = Math.max(0, pollConsumers - 1);
    if (pollConsumers === 0 && pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  };
}
