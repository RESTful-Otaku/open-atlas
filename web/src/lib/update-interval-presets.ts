/** Chart refresh cadence presets (plain TS — safe for tests). */
export const UPDATE_INTERVAL_OPTIONS = [
  { id: "1s", label: "Every second", ms: 1_000 },
  { id: "5s", label: "Every 5 seconds", ms: 5_000 },
  { id: "30s", label: "Every 30 seconds", ms: 30_000 },
  { id: "1m", label: "Every minute", ms: 60_000 },
  { id: "5m", label: "Every 5 minutes", ms: 300_000 },
  { id: "10m", label: "Every 10 minutes", ms: 600_000 },
  { id: "30m", label: "Every 30 minutes", ms: 1_800_000 },
  { id: "1h", label: "Every hour", ms: 3_600_000 },
] as const;

export type UpdateIntervalId = (typeof UPDATE_INTERVAL_OPTIONS)[number]["id"];

export const DEFAULT_UPDATE_INTERVAL_ID: UpdateIntervalId = "5s";
