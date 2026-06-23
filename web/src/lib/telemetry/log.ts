export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  if (typeof window === "undefined") return "warn";
  try {
    const raw = localStorage.getItem("openatlas-log-level");
    if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
      return raw;
    }
  } catch {
    /* private mode */
  }
  return import.meta.env.DEV ? "info" : "warn";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[configuredLevel()];
}

export type LogRecord = {
  t: string;
  scope: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
};

export function log(
  scope: string,
  level: LogLevel,
  msg: string,
  data?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return;
  const record: LogRecord = {
    t: new Date().toISOString(),
    scope,
    level,
    msg,
    ...data,
  };
  const line = JSON.stringify(record);
  switch (level) {
    case "debug":
      console.debug(line);
      break;
    case "info":
      console.info(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
  }
}

export function logDebug(
  scope: string,
  msg: string,
  data?: Record<string, unknown>,
): void {
  log(scope, "debug", msg, data);
}

export function logInfo(
  scope: string,
  msg: string,
  data?: Record<string, unknown>,
): void {
  log(scope, "info", msg, data);
}
