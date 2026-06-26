

import { appendOpsLog } from "./log-stream";
import { fetchObservabilitySnapshot, type ObservabilitySnapshot } from "./ingest-status";
import { formatIngestPollLines } from "./ops-log-format";
import { createBackoffPoll } from "../poll-with-backoff";
import { notifySuccess, notifyWarning } from "../notify/notify";
import { NOTIFY_CODES } from "../notify/notify-codes";
import type { IngestMetricName } from "./prometheus";

export const OPS_POLL_MS = 8_000;

export const opsObservability = $state({
  snapshot: null as ObservabilitySnapshot | null,
  loading: false,
  lastPollErr: null as string | null,
  pollCount: 0,
});

let backoffPoll: ReturnType<typeof createBackoffPoll> | undefined;
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

/**
 * Returns `true` when the poll was successful (no error), `false` on failure.
 */
export async function refreshOpsObservability(logPoll = true): Promise<boolean> {
  if (opsObservability.loading) return true;
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
    return opsObservability.lastPollErr === null;
  } catch (e) {
    const durationMs = Math.round(performance.now() - t0);
    const msg = e instanceof Error ? e.message : String(e);
    opsObservability.lastPollErr = msg;
    appendOpsLog(
      "error",
      "ingest",
      `Poll #${opsObservability.pollCount + 1} failed after ${durationMs}ms: ${msg}`,
    );
    return false;
  } finally {
    opsObservability.loading = false;
  }
}

export type OpsPollingOptions = {

  verboseLogs?: boolean;
};

/** Start backoff-polling while Settings console is open/expanded. */
export function acquireOpsPolling(options: OpsPollingOptions = {}): () => void {
  const verboseLogs = options.verboseLogs ?? true;
  pollConsumers += 1;
  if (pollConsumers === 1) {
    if (!pollingStarted && verboseLogs) {
      pollingStarted = true;
      appendOpsLog("info", "ops", `Diagnostics polling started (interval ${OPS_POLL_MS / 1000}s)`);
    }
    backoffPoll = createBackoffPoll(
      () => refreshOpsObservability(verboseLogs),
      {
        name: "ops-observability",
        intervalMs: OPS_POLL_MS,
        baseBackoffMs: 2_000,
        maxBackoffMs: 60_000,
        notifyAfterFailures: 3,
        onBackoffChange(backingOff, failures, nextPollMs) {
          if (backingOff) {
            notifyWarning({
              code: NOTIFY_CODES.OPS_POLL_FAIL,
              title: "Ops console polling backed off",
              message: `${failures} consecutive failures — next poll in ${Math.round(nextPollMs / 1000)}s`,
              detail: "The observability endpoint is not responding.",
              action: "Check that openatlas-ingest is running.",
              timeoutMs: 10_000,
              dedupeKey: "ops-backoff",
              source: "ingest",
            });
          } else {
            notifySuccess({
              code: NOTIFY_CODES.OPS_POLL_FAIL,
              title: "Ops console polling recovered",
              message: "Observability endpoint reachable again — resuming normal interval.",
              timeoutMs: 5_000,
              dedupeKey: "ops-recover",
              source: "ingest",
            });
          }
        },
      },
    );
    backoffPoll.start();
  }
  return () => {
    pollConsumers = Math.max(0, pollConsumers - 1);
    if (pollConsumers === 0 && backoffPoll !== undefined) {
      backoffPoll.stop();
      backoffPoll = undefined;
    }
  };
}
