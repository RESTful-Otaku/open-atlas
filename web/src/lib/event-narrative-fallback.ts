

import { domainLabel } from "./colors";
import type {
  UiDomainInsight,
  UiEvent,
  UiEventNarrative,
  UiPredictedDisruption,
} from "./types";


export const CLIENT_NARRATIVE_SEVERITY_THRESHOLD = 0.5;

function severityPosture(score: number): string {
  if (!Number.isFinite(score) || score < 0) return "nominal";
  if (score >= 0.95) return "critical";
  if (score >= 0.85) return "severe";
  if (score >= 0.7) return "elevated";
  if (score >= 0.5) return "watch";
  return "nominal";
}

function capitaliseFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildInference(domain: string, severity: number, trend: string): string {
  const risk =
    severity >= 0.95
      ? "immediate"
      : severity >= 0.85
        ? "acute"
        : severity >= 0.7
          ? "heightened"
          : "moderate";
  const trendNote =
    trend === "up"
      ? "severity trending upward"
      : trend === "down"
        ? "severity easing"
        : trend === "flat"
          ? "severity stable"
          : "trend not yet established";
  const domainPhrase: Record<string, string> = {
    geopolitics: "regional escalation",
    cyber: "infrastructure exposure",
    climate: "environmental disruption",
    health: "epidemiological pressure",
    transport: "corridor throughput impact",
    economy: "market liquidity impact",
    finance: "market liquidity impact",
    space: "orbital coordination pressure",
    demographics: "population-movement pressure",
    infrastructure: "service-availability pressure",
    seismic: "geotechnical disturbance",
    energy: "grid stress",
    geospatial: "localized disturbance",
  };
  const phrase = domainPhrase[domain] ?? "operational impact";
  return `${risk} ${phrase}; ${trendNote}. Operator attention recommended.`;
}

function buildDisruptions(
  domain: string,
  severity: number,
): UiPredictedDisruption[] {
  const base = severityPosture(severity);
  const templates: Record<string, [string, string, string][]> = {
    geopolitics: [
      ["neighbouring regions", "elevated", "secondary escalation risk"],
      ["supply chains", base, "disrupted transit corridors"],
    ],
    cyber: [
      ["connected services", "elevated", "lateral movement risk"],
      ["dependent clients", base, "availability impact"],
    ],
    climate: [
      ["downstream watersheds", base, "flood/drought risk"],
      ["air travel", "elevated", "route disruption"],
    ],
    transport: [
      ["connected hubs", base, "throughput degradation"],
      ["just-in-time supply", "elevated", "inventory stress"],
    ],
    energy: [
      ["interconnected grids", base, "load shedding risk"],
      ["price-sensitive markets", "elevated", "spot-price volatility"],
    ],
  };
  const rows =
    templates[domain] ?? [["local area", base, "localized impact"]];
  return rows.map(([entity, sev, note]) => ({
    entity,
    severity: sev,
    note,
  }));
}


export function synthesizeEventNarrative(
  event: UiEvent,
  insight: UiDomainInsight | null | undefined,
): UiEventNarrative {
  const trend = insight?.trend ?? "flat";
  const anomalies = insight?.anomaly_count_recent ?? 0;
  const source = event.feedSource ?? insight?.dominant_source ?? "unknown source";
  const severityPct = Math.round(event.severity_score * 100);
  const posture = severityPosture(event.severity_score);
  const loc = event.location;
  const locationFragment = loc
    ? ` near (${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)})`
    : "";

  return {
    event_id: event.id,
    headline: `${capitaliseFirst(domainLabel(event.domain))}${locationFragment} — ${posture} posture`,
    summary: `Event #${event.ordinal} in the ${domainLabel(event.domain)} domain registered severity ${severityPct}% with trend ${trend}. Source: ${source}. ${anomalies} anomaly signals observed in the recent window.`,
    inference: buildInference(event.domain, event.severity_score, trend),
    predicted_disruption: buildDisruptions(event.domain, event.severity_score),
    updated_at: event.timestamp,
  };
}


export function resolveEventNarrative(
  event: UiEvent | null,
  stored: Readonly<Record<string, UiEventNarrative>>,
  insight: UiDomainInsight | null | undefined,
): UiEventNarrative | null {
  if (!event) return null;
  const row = stored[event.id];
  if (row) return row;
  if (event.severity_score < CLIENT_NARRATIVE_SEVERITY_THRESHOLD) return null;
  return synthesizeEventNarrative(event, insight);
}
