/**
 * Bridge SpacetimeDB connection events into the ops log buffer.
 */

import { appendOpsLog } from "./log-stream";

export function logStdbConnected(): void {
  appendOpsLog("ok", "stdb", "SpacetimeDB connected — subscriptions active");
}

export function logStdbConnecting(): void {
  appendOpsLog("info", "stdb", "Connecting to SpacetimeDB…");
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
  appendOpsLog("info", "stdb", `Auto-reconnect attempt ${attempt}`);
}
