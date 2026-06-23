

import type { CardListItem, RegionBar, StatusTableRow, KpiCell } from "./panels/types";

import { bucketRisk, bucketSeverity } from "../primitives/status";
import { domainColor, domainLabel } from "../colors";
import type {
  UiDomainInsight,
  UiEvent,
  UiSignal,
  UiWorldState,
} from "../types";


export const MATRIX_LIST_LIMIT = 8;

export function eventsInDomains(
  events: readonly UiEvent[],
  domains: readonly string[],
): readonly UiEvent[] {
  if (domains.length === 0) return events;
  const set = new Set(domains);
  return events.filter((e) => set.has(e.domain));
}


export function flashpointCards(
  events: readonly UiEvent[],
  domains: readonly string[],
  limit: number = MATRIX_LIST_LIMIT,
): readonly CardListItem[] {
  const scoped = eventsInDomains(events, domains);
  return scoped.slice(0, limit).map((e) => ({
    id: e.id,
    title: `Event #${e.ordinal}`,
    subtitle: domainLabel(e.domain),
    severity: bucketSeverity(e.severity_score),
    leftPair: {
      label: "Severity",
      value: (e.severity_score * 100).toFixed(0) + "%",
    },
    rightPair: {
      label: "Location",
      value: e.location
        ? `${e.location.lat.toFixed(1)}, ${e.location.lon.toFixed(1)}`
        : "—",
    },
    accent: domainColor(e.domain),
    href: `#/events/${encodeURIComponent(e.id)}`,
  }));
}


export function domainRiskBars(
  domainState: Record<string, UiWorldState>,
  domains: readonly string[],
): readonly RegionBar[] {
  return domains
    .map((id) => ({
      id,
      state: domainState[id],
    }))
    .filter((r) => r.state !== undefined)
    .map((r) => {
      const level = bucketRisk(r.state!.risk_index);
      let tone: RegionBar["tone"] = "accent";
      if (level === "critical" || level === "active-conflict") tone = "danger";
      else if (level === "elevated" || level === "warning") tone = "warn";
      else if (level === "stable" || level === "optimal") tone = "good";
      return {
        label: domainLabel(r.id),
        value: r.state!.risk_index,
        tone,
      };
    });
}


export function signalRows(
  signals: readonly UiSignal[],
  domains: readonly string[],
  limit: number = MATRIX_LIST_LIMIT,
): readonly StatusTableRow[] {
  const scoped =
    domains.length === 0
      ? signals
      : signals.filter((s) => domains.includes(s.domain));
  return scoped.slice(0, limit).map((s) => ({
    id: s.id,
    primary: s.reason,
    secondary: domainLabel(s.domain),
    status: bucketRisk(s.score),
    statusLabel: bucketRisk(s.score).toUpperCase(),
    right: (s.score * 100).toFixed(0) + "%",
    href: `#/events/${encodeURIComponent(s.event_id)}`,
  }));
}


export function domainKpiCells(
  domainState: Record<string, UiWorldState>,
  insights: Record<string, UiDomainInsight>,
  domain: string,
): readonly KpiCell[] {
  const state = domainState[domain];
  const insight = insights[domain];
  return [
    {
      label: "Events",
      value: "—",
      valueNumber: state?.event_count,
    },
    {
      label: "Avg severity",
      value: state ? state.avg_severity.toFixed(2) : "—",
    },
    {
      label: "Risk index",
      value: state ? state.risk_index.toFixed(2) : "—",
      tone: state && state.risk_index >= 0.6 ? "warn" : "default",
    },
    {
      label: "Anomalies",
      value: insight ? String(insight.anomaly_count_recent) : "0",
    },
  ];
}
