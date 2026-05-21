/**
 * Bridge SpacetimeDB connection events into the ops log buffer.
 */

import { appendOpsLog } from "./log-stream";
import { stdbDatabaseName } from "../native-config";
import { resolveStdbWebSocketUri } from "../stdb-endpoint";
import { dashboard } from "../state.svelte";

export function logStdbConnected(): void {
  const uri = resolveStdbWebSocketUri();
  const db = stdbDatabaseName();
  appendOpsLog(
    "ok",
    "stdb",
    `Connected — db=${db} · ${uri} · dashboard: ${dashboard.events.length} events, ${dashboard.recentSignals.length} signals, ${dashboard.recentCausalEdges.length} causal edges`,
  );
}

export function logStdbConnecting(): void {
  const uri = resolveStdbWebSocketUri();
  const db = stdbDatabaseName();
  appendOpsLog("info", "stdb", `Connecting… db=${db} · ${uri} · dataMode=${dashboard.dataMode}`);
}

export function logStdbDisconnected(reason?: string): void {
  appendOpsLog(
    "warn",
    "stdb",
    reason ? `Disconnected — ${reason}` : "Disconnected",
  );
}

export function logStdbError(message: string): void {
  appendOpsLog("error", "stdb", message);
}

export function logStdbReconnectAttempt(attempt: number): void {
  appendOpsLog(
    "info",
    "stdb",
    `Auto-reconnect attempt ${attempt} of 8 (exponential backoff) · last error: ${dashboard.connectionLastError ?? "none"}`,
  );
}
