import type { NotifyLevel } from "./notify-types";
import { NOTIFY_CODES, type NotifyCode } from "./notify-codes";

const MAX_LOG = 256;

export type NotifyLogEntry = {
  id: string;
  at: number;
  level: NotifyLevel;
  code: NotifyCode | string;
  title: string;
  message: string;
  /** Technical detail, stack line, or raw error text */
  detail?: string;
  /** What the user can try */
  action?: string;
  source: "app" | "spacetimedb" | "ingest" | "llm";
};

export const notifyLog = $state({
  /** Newest at index 0 */
  entries: [] as NotifyLogEntry[],
});

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function inferSource(
  code: string,
  source: NotifyLogEntry["source"] | undefined,
): NotifyLogEntry["source"] {
  if (source) return source;
  if (
    code === NOTIFY_CODES.STDB_SUBSCRIPTION ||
    code === NOTIFY_CODES.STDB_CONNECT_FAIL ||
    code === NOTIFY_CODES.STDB_BUILD ||
    code === NOTIFY_CODES.STDB_LIVE ||
    code === NOTIFY_CODES.STDB_OFFLINE ||
    code === NOTIFY_CODES.STDB_RECONNECTING
  ) {
    return "spacetimedb";
  }
  if (code === NOTIFY_CODES.INGEST_UNREACHABLE) return "ingest";
  if (code === NOTIFY_CODES.LLM_UNREACHABLE) return "llm";
  return "app";
}

/**
 * Ring buffer: append a row for every notification (toasts, silent logs).
 * Used for debugging and a future “Activity / diagnostics” view.
 */
export function appendNotifyLog(
  e: Omit<NotifyLogEntry, "id" | "at" | "source"> & { source?: NotifyLogEntry["source"] },
): NotifyLogEntry {
  const row: NotifyLogEntry = {
    id: makeId(),
    at: Date.now(),
    level: e.level,
    code: e.code,
    title: e.title,
    message: e.message,
    detail: e.detail,
    action: e.action,
    source: inferSource(e.code, e.source),
  };
  const next = [row, ...notifyLog.entries];
  if (next.length > MAX_LOG) {
    next.length = MAX_LOG;
  }
  notifyLog.entries = next;
  return row;
}
