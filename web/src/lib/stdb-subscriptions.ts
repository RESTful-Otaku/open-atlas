/**
 * SpacetimeDB subscription queries for the dashboard.
 *
 * STDB 2.1 subscription SQL: no `ORDER BY`; avoid `LIMIT` on `event_narrative`.
 * Ring sizes on the server are capped (~800 events) — still subscribe with
 * `SELECT *` and trim to [`data-limits.ts`] client-side.
 *
 * Narratives are large text blobs → separate lazy subscription
 * (`NARRATIVE_SUBSCRIPTION_QUERIES`) when a view needs them.
 */
export const CORE_SUBSCRIPTION_QUERIES: readonly string[] = [
  "SELECT * FROM event",
  "SELECT * FROM signal",
  "SELECT * FROM causal_edge",
  "SELECT * FROM world_state",
  "SELECT * FROM domain_insight",
];

export const NARRATIVE_SUBSCRIPTION_QUERIES: readonly string[] = [
  "SELECT * FROM event_narrative",
];

/** @deprecated Use {@link CORE_SUBSCRIPTION_QUERIES} */
export const DASHBOARD_SUBSCRIPTION_QUERIES: readonly string[] = [
  ...CORE_SUBSCRIPTION_QUERIES,
  ...NARRATIVE_SUBSCRIPTION_QUERIES,
];
