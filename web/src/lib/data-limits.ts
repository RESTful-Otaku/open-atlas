/**
 * Client-side row caps after sort/trim (see `sync-dashboard-cache.ts`).
 * Kept below server ring sizes so WS sync and in-memory projection stay lean.
 *
 * Lower caps directly cut CPU (sort/trim, globe heatmaps, ECharts) and RAM
 * (row objects + GeoJSON buffers). Raise only if profiling shows headroom.
 */
export const MAX_EVENTS = 280;
export const MAX_SIGNALS = 100;
export const MAX_CAUSAL_EDGES = 120;
/** Rolling severity buckets per domain (sparklines / small multiples). */
export const MAX_SEVERITY_HISTORY = 24;
/** Event narratives (severity ≥ 0.5 in module); subscribed after core tables apply. */
export const MAX_EVENT_NARRATIVES = 48;
