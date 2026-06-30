
export const CORE_SUBSCRIPTION_QUERIES: readonly string[] = [
  "SELECT * FROM event",
  "SELECT * FROM signal",
  "SELECT * FROM causal_edge",
  "SELECT * FROM world_state",
  "SELECT * FROM domain_insight",
  "SELECT * FROM event_hour_bucket",
];

export const NARRATIVE_SUBSCRIPTION_QUERIES: readonly string[] = [
  "SELECT * FROM event_narrative",
];


