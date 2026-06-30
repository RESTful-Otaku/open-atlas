
export const CLIENT_RETENTION_MS = 86_400_000;

/** Target cap after 24h trim — increased to match larger server ring (200K). */
export const MAX_EVENTS = 10_000;
/** Safety ceiling when many rows share the same second (memory guard). */
export const MAX_EVENTS_HARD_CEILING = 20_000;

export const MAX_SIGNALS = 5_000;
export const MAX_CAUSAL_EDGES = 10_000;
/** Rolling severity buckets per domain (sparklines / small multiples). */
export const MAX_SEVERITY_HISTORY = 48;
/** Event narratives (severity ≥ 0.5 in module); subscribed after core tables apply. */
export const MAX_EVENT_NARRATIVES = 96;
