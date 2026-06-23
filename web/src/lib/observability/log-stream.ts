

export type LogLevel = "info" | "ok" | "warn" | "error";

export interface LogLine {
  ts: string;
  level: LogLevel;
  source: string;
  message: string;
}

export const OPS_LOG_MAX_LINES = 500;

const buffer: LogLine[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    fn();
  }
}

export function subscribeOpsLog(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}


export function trimOpsLog(lines: LogLine[], max = OPS_LOG_MAX_LINES): LogLine[] {
  if (lines.length <= max) return lines;
  return lines.slice(lines.length - max);
}

export function appendOpsLog(
  level: LogLevel,
  source: string,
  message: string,
  at?: Date,
): void {
  const line: LogLine = {
    ts: (at ?? new Date()).toISOString(),
    level,
    source,
    message,
  };
  buffer.push(line);
  seq += 1;
  if (buffer.length > OPS_LOG_MAX_LINES) {
    buffer.splice(0, buffer.length - OPS_LOG_MAX_LINES);
  }
  notify();
}


export function getOpsLogLines(): readonly LogLine[] {
  return buffer;
}


export function clearOpsLog(): void {
  const had = buffer.length;
  buffer.length = 0;
  seq = 0;
  notify();
  if (had > 0) {
    const line: LogLine = {
      ts: new Date().toISOString(),
      level: "info",
      source: "ops",
      message: `Cleared ${had} log line(s)`,
    };
    buffer.push(line);
    seq += 1;
    notify();
  }
}


export function clearOpsLogForTests(): void {
  clearOpsLog();
}

export function opsLogRevision(): number {
  return seq;
}
