/**
 * Client-side health history buffer — tracks per-poll snapshots for
 * timeline bars, rate computation, and time-series charts.
 */

export interface ServiceSnapshot {
  /** ISO timestamp */
  at: string;
  connPillar: "live" | "degraded" | "offline";
  ingestPillar: "live" | "degraded" | "offline" | "unknown";
  llmPillar: "live" | "degraded" | "offline" | "unknown";
  prometheus: Record<string, number>;
}

export interface RatePoint {
  at: string;
  label: string;
  rate: number;
}

const MAX_HISTORY = 60;

const history: ServiceSnapshot[] = [];

export function pushSnapshot(snap: ServiceSnapshot): void {
  history.push(snap);
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

export function getHistory(): readonly ServiceSnapshot[] {
  return history;
}

export function clearHistory(): void {
  history.length = 0;
}

export const STATUS_COLORS: Record<string, string> = {
  live: "#22c55e",
  degraded: "#f59e0b",
  offline: "#ef4444",
  unknown: "#71717a",
};
