import type { DbConnection } from "./stdb";
import type { Event, Signal, CausalEdge, EventNarrative } from "./stdb/types";
import { bumpDashboardRevision, bumpDomainsRevision } from "./dashboard-revision.svelte";
import { invalidateDomainEventsCache } from "./domain-events-cache";
import { sameOrderedEvents, sameOrderedIds } from "./buffer-trim";
import { invalidateGeoEventIndex } from "./geo-event-index";
import { parseEventMs } from "./map/map-sim-time";
import { trimEventsByRetention } from "./event-retention-trim";
import {
  MAX_CAUSAL_EDGES,
  MAX_EVENT_NARRATIVES,
  MAX_EVENTS,
  MAX_SIGNALS,
  applyCausalEdge,
  applyDomainInsight,
  applyEvent,
  applyEventHourBucket,
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
  buf.sort((a, b) => Number(b.updatedAt.microsSinceUnixEpoch) - Number(a.updatedAt.microsSinceUnixEpoch));
  return buf.slice(0, limit);
}


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
  for (const row of db.event_hour_bucket.iter()) {
    applyEventHourBucket(row);
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
  const { streamDirty, domainsDirty: pendingDomains, eventsDirty, signalsDirty, edgesDirty, narrativesDirty } =
    flushPendingDashboardPatches();
  const severityDirty = flushPendingSeverityUpdates();
  const publish =
    options?.publish ?? (streamDirty || pendingDomains || severityDirty);
  if (!publish) return;

  let streamChanged = streamDirty;
  let domainsChanged = pendingDomains || severityDirty;

  const force = options?.publish ?? false;

  if (eventsDirty || force) {
    const events = dashboard.events;
    let maxEventMs = 0;
    for (let i = 0; i < events.length; i++) {
      const t = parseEventMs(events[i].timestamp);
      if (t !== null && t > maxEventMs) maxEventMs = t;
    }
    const nowMs = maxEventMs > 0 ? maxEventMs : Date.now();
    const nextEvents = trimEventsByRetention(events, { nowMs });
    if (!sameOrderedEvents(dashboard.events, nextEvents)) {
      dashboard.events = nextEvents;
      streamChanged = true;
    }
  }

  if (signalsDirty || force) {
    const nextSignals = [...dashboard.recentSignals]
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, MAX_SIGNALS);
    if (!sameOrderedIds(dashboard.recentSignals, nextSignals)) {
      dashboard.recentSignals = nextSignals;
      streamChanged = true;
    }
  }

  if (edgesDirty || force) {
    const nextEdges = [...dashboard.recentCausalEdges]
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, MAX_CAUSAL_EDGES);
    if (!sameOrderedIds(dashboard.recentCausalEdges, nextEdges)) {
      dashboard.recentCausalEdges = nextEdges;
      streamChanged = true;
    }
  }

  if (narrativesDirty || force) {
    const narratives = Object.values(dashboard.eventNarratives)
      .sort((a, b) => {
        const da = Date.parse(a.updated_at);
        const db = Date.parse(b.updated_at);
        return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da);
      })
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
