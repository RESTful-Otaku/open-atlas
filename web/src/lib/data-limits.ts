
export const CLIENT_RETENTION_MS = 86_400_000;

/** Event recent ring from the STDB module — browser subscribes to this instead of the full event table. */
export const MAX_EVENT_RECENT = 300;
/** Target cap after 24h trim — applies to event_recent ring. */
export const MAX_EVENTS = 300;
/** Safety ceiling when many rows share the same second (memory guard). */
export const MAX_EVENTS_HARD_CEILING = 600;

export const MAX_SIGNALS = 5_000;
export const MAX_CAUSAL_EDGES = 10_000;
/** Rolling severity buckets per domain (sparklines / small multiples). */
export const MAX_SEVERITY_HISTORY = 48;
/** Event narratives (severity ≥ 0.5 in module); subscribed after core tables apply. */
export const MAX_EVENT_NARRATIVES = 96;
