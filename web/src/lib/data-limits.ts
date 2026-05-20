/**
 * Client-side row caps after sort/trim (see `sync-dashboard-cache.ts`).
 * Kept at or below server ring sizes so WS sync and in-memory projection stay lean.
 *
 * Events use a **24h UTC retention window** (see `event-retention-trim.ts`) with a
 * hard count ceiling for Tiger Style bounds. Signals/causal edges still use count
 * caps aligned to STDB rings (400 / 600).
 */
export const CLIENT_RETENTION_MS = 86_400_000;

/** Target cap after 24h trim — matches STDB `EVENT_RING_SIZE`. */
export const MAX_EVENTS = 800;
/** Safety ceiling when many rows share the same second (memory guard). */
export const MAX_EVENTS_HARD_CEILING = 2000;

export const MAX_SIGNALS = 400;
export const MAX_CAUSAL_EDGES = 600;
/** Rolling severity buckets per domain (sparklines / small multiples). */
export const MAX_SEVERITY_HISTORY = 24;
/** Event narratives (severity ≥ 0.5 in module); subscribed after core tables apply. */
export const MAX_EVENT_NARRATIVES = 96;
