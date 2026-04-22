export type NotifyLevel = "info" | "success" | "warning" | "error";

export type PushNotifyInput = {
  level: NotifyLevel;
  code: string;
  title: string;
  message: string;
  detail?: string;
  /** One-line next step, e.g. “Check the SpacetimeDB process.” */
  action?: string;
  /** @default 5000, set 0 to require manual dismiss only */
  timeoutMs?: number;
  /**
   * If the same key was shown recently, the toast is skipped (log still
   * recorded) to avoid flapping connection spam.
   */
  dedupeKey?: string;
  /** @default true */
  toast?: boolean;
  /** Override inferred source in the log */
  source?: "app" | "spacetimedb" | "ingest" | "llm";
};
