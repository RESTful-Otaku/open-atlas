export type NotifyLevel = "info" | "success" | "warning" | "error";

export type PushNotifyInput = {
  level: NotifyLevel;
  code: string;
  title: string;
  message: string;
  detail?: string;
  action?: string;

  timeoutMs?: number;

  dedupeKey?: string;

  toast?: boolean;

  source?: "app" | "spacetimedb" | "ingest" | "llm";
};
