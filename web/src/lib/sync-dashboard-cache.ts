/**
 * Hydrate the reactive dashboard from the SpacetimeDB client table cache.
 *
 * Only projects the newest N rows (see `data-limits.ts`) so initial connect
 * does not JSON.parse thousands of payloads.
 */
import type { DbConnection } from "./stdb";
import type { Event, Signal, CausalEdge, EventNarrative } from "./stdb/types";
import { bumpDashboardRevision, bumpDomainsRevision } from "./dashboard-revision.svelte";
import { invalidateDomainEventsCache } from "./domain-events-cache";
import { sameOrderedEvents, sameOrderedIds } from "./buffer-trim";
import { invalidateGeoEventIndex } from "./geo-event-index";
import {
  MAX_CAUSAL_EDGES,
  MAX_EVENT_NARRATIVES,
  MAX_EVENTS,
  MAX_SIGNALS,
  applyCausalEdge,
  applyDomainInsight,
  applyEvent,
  applyEventNarrative,
  applySignal,
  applyWorldState,
  beginDashboardBatch,
  dashboard,
  endDashboardBatch,
  flushPendingDashboardPatches,
  flushPendingSeverityUpdates,
  rebuildEventIdIndex,
} from "./state.svelte";

function topEventsByOrdinal(rows: Iterable<Event>, limit: number): Event[] {
  const buf: Event[] = [];
  for (const row of rows) {
    buf.push(row);
  }
  buf.sort((a, b) => Number(b.ordinal) - Number(a.ordinal));
  return buf.slice(0, limit);
}

function topSignalsById(rows: Iterable<Signal>, limit: number): Signal[] {
  const buf: Signal[] = [];
  for (const row of rows) {
    buf.push(row);
  }
  buf.sort((a, b) => Number(b.id) - Number(a.id));
  return buf.slice(0, limit);
}

function topEdgesById(rows: Iterable<CausalEdge>, limit: number): CausalEdge[] {
  const buf: CausalEdge[] = [];
  for (const row of rows) {
    buf.push(row);
  }
  buf.sort((a, b) => Number(b.id) - Number(a.id));
  return buf.slice(0, limit);
}

function topNarratives(rows: Iterable<EventNarrative>, limit: number): EventNarrative[] {
  const buf: EventNarrative[] = [];
  for (const row of rows) {
    buf.push(row);
  }
  buf.sort((a, b) =>
    b.updatedAt.toISOString().localeCompare(a.updatedAt.toISOString()),
  );
  return buf.slice(0, limit);
}

/** Replace dashboard lists from the SDK cache (post-subscription). */
export function hydrateDashboardFromConnection(connection: DbConnection): void {
  const db = connection.db;

  beginDashboardBatch();
  dashboard.domainState = {};
  dashboard.domainInsights = {};
  dashboard.domainSeverityHistory = {};

  for (const row of topEventsByOrdinal(db.event.iter(), MAX_EVENTS)) {
    applyEvent(row);
  }
  for (const row of topSignalsById(db.signal.iter(), MAX_SIGNALS)) {
    applySignal(row);
  }
  for (const row of topEdgesById(db.causal_edge.iter(), MAX_CAUSAL_EDGES)) {
    applyCausalEdge(row);
  }
  for (const row of db.world_state.iter()) {
    applyWorldState(row);
  }
  for (const row of db.domain_insight.iter()) {
    applyDomainInsight(row);
  }
  for (const row of topNarratives(db.event_narrative.iter(), MAX_EVENT_NARRATIVES)) {
    applyEventNarrative(row);
  }

  endDashboardBatch();
  sortAndTrimDashboardBuffers({ publish: true });
  bumpDomainsRevision();

  if (import.meta.env.DEV) {
    console.info(
      "[openatlas] hydrated dashboard (trimmed)",
      dashboard.events.length,
      "events",
      Object.keys(dashboard.eventNarratives).length,
      "narratives",
    );
  }
}

/** Merge only narrative rows from cache (lazy subscription). */
export function hydrateNarrativesFromConnection(connection: DbConnection): void {
  beginDashboardBatch();
  for (const row of topNarratives(
    connection.db.event_narrative.iter(),
    MAX_EVENT_NARRATIVES,
  )) {
    applyEventNarrative(row);
  }
  endDashboardBatch();
  sortAndTrimDashboardBuffers({ publish: true });
}

/** Keep buffers sorted and within caps (subscriptions lack ORDER BY). */
export function sortAndTrimDashboardBuffers(options?: {
  /** When true, sort/trim and bump viz revision even if no pending stream patches. */
  publish?: boolean;
}): void {
  const { streamDirty, domainsDirty: pendingDomains } =
    flushPendingDashboardPatches();
  const severityDirty = flushPendingSeverityUpdates();
  const publish =
    options?.publish ?? (streamDirty || pendingDomains || severityDirty);
  if (!publish) return;

  let streamChanged = streamDirty;
  let domainsChanged = pendingDomains || severityDirty;

  const nextEvents = [...dashboard.events]
    .sort((a, b) => b.ordinal - a.ordinal)
    .slice(0, MAX_EVENTS);
  if (!sameOrderedEvents(dashboard.events, nextEvents)) {
    dashboard.events = nextEvents;
    streamChanged = true;
  }

  const nextSignals = [...dashboard.recentSignals]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, MAX_SIGNALS);
  if (!sameOrderedIds(dashboard.recentSignals, nextSignals)) {
    dashboard.recentSignals = nextSignals;
    streamChanged = true;
  }

  const nextEdges = [...dashboard.recentCausalEdges]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, MAX_CAUSAL_EDGES);
  if (!sameOrderedIds(dashboard.recentCausalEdges, nextEdges)) {
    dashboard.recentCausalEdges = nextEdges;
    streamChanged = true;
  }

  const narratives = Object.values(dashboard.eventNarratives)
    .sort(
      (a, b) =>
        Date.parse(b.updated_at) - Date.parse(a.updated_at),
    )
    .slice(0, MAX_EVENT_NARRATIVES);
  const nextNarratives = Object.fromEntries(
    narratives.map((n) => [n.event_id, n]),
  );
  const narrKeys = Object.keys(dashboard.eventNarratives);
  const nextKeys = Object.keys(nextNarratives);
  let narrChanged =
    narrKeys.length !== nextKeys.length ||
    narrKeys.some((k) => dashboard.eventNarratives[k] !== nextNarratives[k]);
  if (narrChanged) {
    dashboard.eventNarratives = nextNarratives;
    streamChanged = true;
  }

  if (!streamChanged && !domainsChanged) return;

  rebuildEventIdIndex();
  invalidateGeoEventIndex();
  invalidateDomainEventsCache();
  bumpDashboardRevision();
  if (domainsChanged) bumpDomainsRevision();
}

/** Call after domain-only patches (hydrate does full commit). */
export function commitDashboardDomainsRevision(): void {
  bumpDomainsRevision();
}
