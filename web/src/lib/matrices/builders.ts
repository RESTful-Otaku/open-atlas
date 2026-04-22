/**
 * Small, pure helpers that transform the reactive dashboard state into
 * the panel-specific data shapes defined in `./panels/*.svelte`.
 *
 * Kept separate from the catalog so tests can exercise them without
 * dragging Svelte component dependencies. Each helper is pure:
 * `(state) => readonly rows` with no side effects.
 */

import type { CardListItem } from "./panels/CardList.svelte";
import type { RegionBar } from "./panels/RegionBarBadges.svelte";
import type { StatusTableRow } from "./panels/StatusTable.svelte";
import type { KpiCell } from "./panels/KpiGrid.svelte";

import { bucketRisk, bucketSeverity } from "../primitives/status";
import { domainColor, domainLabel } from "../colors";
import type {
  UiDomainInsight,
  UiEvent,
  UiSignal,
  UiWorldState,
} from "../types";

/** Default limit for any "recent N" list in a matrix panel. */
export const MATRIX_LIST_LIMIT = 8;

export function eventsInDomains(
  events: readonly UiEvent[],
  domains: readonly string[],
): readonly UiEvent[] {
  if (domains.length === 0) return events;
  const set = new Set(domains);
  return events.filter((e) => set.has(e.domain));
}

/** CardList items derived from the most recent events in the given domains. */
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
    // Hash-style link so the card respects the app's hash router.
    // Encoding the id keeps the URL safe even if we later switch to
    // non-numeric identifiers.
    href: `#/events/${encodeURIComponent(e.id)}`,
  }));
}

/** Per-domain risk index as a bar badge list. */
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

/** Status table rows from recent signals in given domains. */
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

/** KPI cells summarising a domain from world-state. */
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
      value: state ? String(state.event_count) : "—",
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
