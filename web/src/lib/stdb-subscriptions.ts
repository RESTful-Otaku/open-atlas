
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

export const DASHBOARD_SUBSCRIPTION_QUERIES: readonly string[] = [
  ...CORE_SUBSCRIPTION_QUERIES,
  ...NARRATIVE_SUBSCRIPTION_QUERIES,
];
