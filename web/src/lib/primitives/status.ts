

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


export function bucketSeverity(score: number): SeverityLevel {
  if (!Number.isFinite(score)) return "nominal";
  if (score >= 0.85) return "critical";
  if (score >= 0.7) return "severe";
  if (score >= 0.5) return "elevated";
  if (score >= 0.3) return "watch";
  return "nominal";
}


export function bucketRisk(score: number): StatusLevel {
  if (!Number.isFinite(score)) return "nominal";
  if (score >= 0.8) return "critical";
  if (score >= 0.6) return "elevated";
  if (score >= 0.4) return "warning";
  if (score >= 0.2) return "active";
  return "stable";
}
