

import { appendOpsLog } from "./log-stream";
import { fetchObservabilitySnapshot, type ObservabilitySnapshot } from "./ingest-status";
import { formatIngestPollLines } from "./ops-log-format";
import type { IngestMetricName } from "./prometheus";

export const OPS_POLL_MS = 8_000;

export const opsObservability = $state({
  snapshot: null as ObservabilitySnapshot | null,
  loading: false,
  lastPollErr: null as string | null,
  pollCount: 0,
});

let pollTimer: ReturnType<typeof setInterval> | undefined;
let pollConsumers = 0;
let lastMetricCounters: Partial<Record<IngestMetricName, number>> | null = null;
let pollingStarted = false;

function logPollSnapshot(snap: ObservabilitySnapshot, pollNum: number, durationMs: number): void {
  const lines = formatIngestPollLines(snap, pollNum, durationMs, lastMetricCounters);
  for (const line of lines) {
    appendOpsLog(line.level, "ingest", line.message);
  }
  if (Object.keys(snap.prometheus).length > 0) {
    lastMetricCounters = { ...snap.prometheus };
  }
}

export async function refreshOpsObservability(logPoll = true): Promise<void> {
  if (opsObservability.loading) return;
  opsObservability.loading = true;
  const t0 = performance.now();
  try {
    const snap = await fetchObservabilitySnapshot();
    const durationMs = Math.round(performance.now() - t0);
    opsObservability.snapshot = snap;
    opsObservability.lastPollErr = snap.ingestErr ?? snap.feedsErr ?? snap.metricsErr ?? null;
    opsObservability.pollCount += 1;
    if (logPoll) {
      logPollSnapshot(snap, opsObservability.pollCount, durationMs);
    }
  } catch (e) {
    const durationMs = Math.round(performance.now() - t0);
    const msg = e instanceof Error ? e.message : String(e);
    opsObservability.lastPollErr = msg;
    appendOpsLog(
      "error",
      "ingest",
      `Poll #${opsObservability.pollCount + 1} failed after ${durationMs}ms: ${msg}`,
    );
  } finally {
    opsObservability.loading = false;
  }
}

export type OpsPollingOptions = {

  verboseLogs?: boolean;
};


export function acquireOpsPolling(options: OpsPollingOptions = {}): () => void {
  const verboseLogs = options.verboseLogs ?? true;
  pollConsumers += 1;
  if (pollConsumers === 1) {
    if (!pollingStarted && verboseLogs) {
      pollingStarted = true;
      appendOpsLog("info", "ops", `Diagnostics polling started (interval ${OPS_POLL_MS / 1000}s)`);
    }
    void refreshOpsObservability(verboseLogs);
    pollTimer = setInterval(() => {
      void refreshOpsObservability(verboseLogs);
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
