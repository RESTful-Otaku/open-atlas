/**
 * Client-side row caps: subscription queries and merge buffers use these
 * (see `state.svelte.ts` and `connection.svelte.ts`). Keep in sync with
 * SpacetimeDB module expectations for subscription LIMIT clauses.
 */
/** Live STDB subscription + merge cap — keep aligned with `connection.svelte.ts` LIMITs. */
export const MAX_EVENTS = 520;
export const MAX_SIGNALS = 280;
export const MAX_CAUSAL_EDGES = 480;
/** Rolling severity buckets per domain (sparklines / small multiples). */
export const MAX_SEVERITY_HISTORY = 36;
/** Client cache cap for `event_narrative` rows (defense in depth vs server). */
export const MAX_EVENT_NARRATIVES = 320;
