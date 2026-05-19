/**
 * Client-side row caps after sort/trim (see `sync-dashboard-cache.ts`).
 * Keep ~½ of `openatlas-stdb-module` ring sizes so WS sync stays lean.
 */
export const MAX_EVENTS = 400;
export const MAX_SIGNALS = 200;
export const MAX_CAUSAL_EDGES = 350;
/** Rolling severity buckets per domain (sparklines / small multiples). */
export const MAX_SEVERITY_HISTORY = 24;
/** High-severity narratives only; subscribed lazily (see `connection.svelte.ts`). */
export const MAX_EVENT_NARRATIVES = 64;
