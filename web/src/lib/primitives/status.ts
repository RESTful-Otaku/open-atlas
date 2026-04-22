/**
 * Shared status/severity vocabulary used by the primitives.
 *
 * Keeping these as closed string-union types means components accept
 * exactly the statuses the design system knows about — typos and
 * drift fail at compile time rather than silently rendering a generic
 * fallback.
 */

export type StatusLevel =
  | "nominal"
  | "optimal"
  | "stable"
  | "active"
  | "warning"
  | "elevated"
  | "degraded"
  | "critical"
  | "active-conflict"
  | "offline";

export type SeverityLevel =
  | "nominal"
  | "watch"
  | "elevated"
  | "severe"
  | "critical"
  | "ongoing";

/**
 * Bucket a numeric severity score (`[0, 1]` per the core contract) to a
 * coarse [`SeverityLevel`]. Deterministic and pure so renderers can call
 * it freely.
 */
export function bucketSeverity(score: number): SeverityLevel {
  if (!Number.isFinite(score)) return "nominal";
  if (score >= 0.85) return "critical";
  if (score >= 0.7) return "severe";
  if (score >= 0.5) return "elevated";
  if (score >= 0.3) return "watch";
  return "nominal";
}

/**
 * Same idea as {@link bucketSeverity} but for aggregate risk (e.g. a
 * `world_state.risk_index`). Ranges are gentler because aggregates
 * average out peaks.
 */
export function bucketRisk(score: number): StatusLevel {
  if (!Number.isFinite(score)) return "nominal";
  if (score >= 0.8) return "critical";
  if (score >= 0.6) return "elevated";
  if (score >= 0.4) return "warning";
  if (score >= 0.2) return "active";
  return "stable";
}
