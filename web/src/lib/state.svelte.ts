import type {
  CausalEdge,
  DomainInsight,
  Event,
  EventNarrative,
  Signal,
  WorldStateRow,
} from "./stdb/types";
import { domainIdFromTag } from "./domain";
import { notifyError } from "./notify/notify";
import { NOTIFY_CODES } from "./notify/notify-codes";
import {
  MAX_CAUSAL_EDGES,
  MAX_EVENT_NARRATIVES,
  MAX_EVENTS_HARD_CEILING,
  MAX_SEVERITY_HISTORY,
  MAX_SIGNALS,
} from "./data-limits";
import { DOMAIN_CATALOG } from "./colors";
import type {
  ConnectionState,
  UiCausalEdge,
  UiDomainInsight,
  UiEvent,
  UiEventNarrative,
  UiPredictedDisruption,
  UiSignal,
  UiWorldState,
} from "./types";

const HUB_DOMAIN_FILTER_KEY = "openatlas-hub-domain-filter:v1";

const VALID_HUB_DOMAINS = new Set(DOMAIN_CATALOG.map((d) => d.id));

function loadSelectedHubDomain(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(HUB_DOMAIN_FILTER_KEY);
    if (!raw || raw === "null") return null;
    return raw;
  } catch {
    return null;
  }
}

function saveSelectedHubDomain(domain: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (domain === null) {
      sessionStorage.removeItem(HUB_DOMAIN_FILTER_KEY);
    } else {
      sessionStorage.setItem(HUB_DOMAIN_FILTER_KEY, domain);
    }
  } catch {
    /* quota */
  }
}

function initialSelectedHubDomain(): string | null {
  const raw = loadSelectedHubDomain();
  if (raw && VALID_HUB_DOMAINS.has(raw)) return raw;
  return null;
}

export {
  MAX_CAUSAL_EDGES,
  MAX_EVENT_NARRATIVES,
  MAX_EVENTS,
  MAX_EVENTS_HARD_CEILING,
  MAX_SEVERITY_HISTORY,
  MAX_SIGNALS,
} from "./data-limits";

export const dashboard = $state({
  events: [] as UiEvent[],
  recentSignals: [] as UiSignal[],
  domainState: {} as Record<string, UiWorldState>,
  domainSeverityHistory: {} as Record<string, number[]>,
  recentCausalEdges: [] as UiCausalEdge[],
  domainInsights: {} as Record<string, UiDomainInsight>,
  eventNarratives: {} as Record<string, UiEventNarrative>,
  selectedDomain: initialSelectedHubDomain(),
  connection: "connecting" as ConnectionState,
  connectionLastError: null as string | null,
  autoReconnectAttempt: 0,
  autoReconnectExhausted: false,
  dataMode: "live" as "live" | "demo",
});

export function setConnection(next: ConnectionState): void {
  dashboard.connection = next;
}

export function setConnectionLastError(
  message: string | null,
): void {
  dashboard.connectionLastError = message;
}

export function setSelectedDomain(next: string | null): void {
  const normalized =
    next !== null && VALID_HUB_DOMAINS.has(next) ? next : null;
  dashboard.selectedDomain = normalized;
  saveSelectedHubDomain(normalized);
}

export function matchesSelectedDomain(candidate: string): boolean {
  const selected = dashboard.selectedDomain;
  return selected === null || selected === candidate;
}


export function activeDomains(): UiWorldState[] {
  return Object.values(dashboard.domainState).sort((a, b) =>
    a.domain.localeCompare(b.domain),
  );
}


function projectLocation(
  loc: Event["location"],
): { lat: number; lon: number } | null {
  if (loc == null) return null;
  if (typeof loc === "object" && "lat" in loc && "lon" in loc) {
    return {
      lat: (loc as { lat: number }).lat,
      lon: (loc as { lon: number }).lon,
    };
  }
  return null;
}


function readCanonicalPayload(json: string): {
  source?: string;
  icao24?: string;
  callsign?: string;
  velocity_mps?: number;
  true_track_deg?: number;
  baro_altitude_m?: number;
  on_ground?: boolean;
  temperature_2m?: number;
  wind_speed_10m?: number;
} {
  if (!json) return {};
  try {
    const p = JSON.parse(json) as Record<string, unknown>;
    const source =
      typeof p.src === "string"
        ? p.src
        : typeof p.source === "string"
          ? p.source
          : undefined;
    return {
      source,
      icao24: typeof p.icao24 === "string" ? p.icao24 : undefined,
      callsign:
        typeof p.callsign === "string" ? p.callsign.trim() : undefined,
      velocity_mps:
        typeof p.velocity_mps === "number" ? p.velocity_mps : undefined,
      true_track_deg:
        typeof p.true_track_deg === "number" ? p.true_track_deg : undefined,
      baro_altitude_m:
        typeof p.baro_altitude_m === "number" ? p.baro_altitude_m : undefined,
      on_ground: typeof p.on_ground === "boolean" ? p.on_ground : undefined,
      temperature_2m:
        typeof p.temperature_2m === "number" ? p.temperature_2m : undefined,
      wind_speed_10m:
        typeof p.wind_speed_10m === "number" ? p.wind_speed_10m : undefined,
    };
  } catch {
    return {};
  }
}

function projectEvent(row: Event): UiEvent {
  const canon = readCanonicalPayload(row.payloadJson);
  return {
    id: String(row.id),
    ordinal: Number(row.ordinal),
    timestamp: row.timestamp.toISOString(),
    domain: domainIdFromTag(row.domain),
    severity_score: row.severityScore,
    location: projectLocation(row.location),
    feedSource: canon.source,
    icao24: canon.icao24,
    callsign: canon.callsign,
    velocity_mps: canon.velocity_mps,
    true_track_deg: canon.true_track_deg,
    baro_altitude_m: canon.baro_altitude_m,
    on_ground: canon.on_ground,
    temperature_2m: canon.temperature_2m,
    wind_speed_10m: canon.wind_speed_10m,
  };
}

function projectSignal(row: Signal): UiSignal {
  return {
    id: String(row.id),
    event_id: String(row.eventId),
    domain: domainIdFromTag(row.domain),
    score: row.score,
    reason: row.reason,
  };
}

function projectCausalEdge(row: CausalEdge): UiCausalEdge {
  return {
    id: String(row.id),
    source_event_id: String(row.sourceEventId),
    target_event_id: String(row.targetEventId),
    influence_score: row.influenceScore,
    decay_rate: row.decayRate,
  };
}

function projectWorldState(row: WorldStateRow): UiWorldState {
  return {
    domain: domainIdFromTag(row.domain),
    event_count: Number(row.eventCount),
    avg_severity: row.avgSeverity,
    risk_index: row.riskIndex,
  };
}

function projectEventNarrative(row: EventNarrative): UiEventNarrative {
  return {
    event_id: String(row.eventId),
    headline: row.headline,
    summary: row.summary,
    inference: row.inference,
    predicted_disruption: parseDisruptions(row.predictedDisruptionJson),
    updated_at: row.updatedAt.toISOString(),
  };
}

function parseDisruptions(raw: string): UiPredictedDisruption[] {
  if (raw === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: UiPredictedDisruption[] = [];
    for (const item of parsed) {
      if (
        item !== null &&
        typeof item === "object" &&
        "entity" in item &&
        "severity" in item &&
        "note" in item &&
        typeof (item as { entity: unknown }).entity === "string" &&
        typeof (item as { severity: unknown }).severity === "string" &&
        typeof (item as { note: unknown }).note === "string"
      ) {
        out.push({
          entity: (item as { entity: string }).entity,
          severity: (item as { severity: string }).severity,
          note: (item as { note: string }).note,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function projectDomainInsight(row: DomainInsight): UiDomainInsight {
  return {
    domain: domainIdFromTag(row.domain),
    trend: row.trend,
    anomaly_count_recent: row.anomalyCountRecent,
    dominant_source: row.dominantSource || null,
    source_link: row.sourceLink || null,
    narrative: row.narrative,
    updated_at: row.updatedAt.toISOString(),
  };
}


let batchDepth = 0;
let batchEvents: UiEvent[] | null = null;
let batchSignals: UiSignal[] | null = null;
let batchCausalEdges: UiCausalEdge[] | null = null;
let batchNarratives: Record<string, UiEventNarrative> | null = null;
let batchDomainState: Record<string, UiWorldState> | null = null;
let batchDomainInsights: Record<string, UiDomainInsight> | null = null;
const batchSeverityEvents: UiEvent[] = [];


export function beginDashboardBatch(): void {
  batchDepth += 1;
  if (batchDepth === 1) {
    batchEvents = [];
    batchSignals = [];
    batchCausalEdges = [];
    batchNarratives = {};
    batchDomainState = {};
    batchDomainInsights = {};
    batchSeverityEvents.length = 0;
  }
}


export function endDashboardBatch(): void {
  if (batchDepth <= 0) return;
  batchDepth = Math.max(0, batchDepth - 1);
  if (batchDepth > 0) return;

  if (batchEvents !== null) {
    dashboard.events = batchEvents;
    batchEvents = null;
  }
  if (batchSignals !== null) {
    dashboard.recentSignals = batchSignals;
    batchSignals = null;
    rebuildSignalIdIndex();
  }
  if (batchCausalEdges !== null) {
    dashboard.recentCausalEdges = batchCausalEdges;
    batchCausalEdges = null;
    rebuildCausalIdIndex();
  }
  if (batchNarratives !== null) {
    evictOldestNarratives(batchNarratives, MAX_EVENT_NARRATIVES);
    dashboard.eventNarratives = batchNarratives;
    batchNarratives = null;
  }
  if (batchDomainState !== null) {
    dashboard.domainState = batchDomainState;
    batchDomainState = null;
  }
  if (batchDomainInsights !== null) {
    dashboard.domainInsights = batchDomainInsights;
    batchDomainInsights = null;
  }
  flushPendingSeverityUpdates();
}

const eventIdToIndex = new Map<string, number>();
const signalIdToIndex = new Map<string, number>();
const causalIdToIndex = new Map<string, number>();


export function lookupEventById(id: string): UiEvent | undefined {
  const idx = eventIdToIndex.get(id);
  if (idx === undefined) return undefined;
  return dashboard.events[idx];
}

function rebuildSignalIdIndex(): void {
  signalIdToIndex.clear();
  dashboard.recentSignals.forEach((row, i) => {
    signalIdToIndex.set(row.id, i);
  });
}

function rebuildCausalIdIndex(): void {
  causalIdToIndex.clear();
  dashboard.recentCausalEdges.forEach((row, i) => {
    causalIdToIndex.set(row.id, i);
  });
}


const pendingEvents = new Map<string, UiEvent>();
const pendingSignals = new Map<string, UiSignal>();
const pendingCausalEdges = new Map<string, UiCausalEdge>();
const pendingWorldState: Record<string, UiWorldState> = {};
const pendingDomainInsights: Record<string, UiDomainInsight> = {};
const pendingEventDeletes = new Set<string>();
const pendingSignalDeletes = new Set<string>();
const pendingCausalDeletes = new Set<string>();
const pendingNarratives = new Map<string, UiEventNarrative>();

export type PendingDashboardFlush = {
  streamDirty: boolean;
  domainsDirty: boolean;
  eventsDirty: boolean;
  signalsDirty: boolean;
  edgesDirty: boolean;
  narrativesDirty: boolean;
};

function flushPendingTrackableList<T extends { id: string }>(
  deletes: Set<string>,
  pending: Map<string, T>,
  idIndex: Map<string, number>,
  getList: () => T[],
  setList: (list: T[]) => void,
  rebuildIndex: () => void,
): boolean {
  let dirty = false;

  if (deletes.size > 0) {
    setList(getList().filter((e) => !deletes.has(e.id)));
    deletes.clear();
    idIndex.clear();
    const list = getList();
    for (let i = 0; i < list.length; i++) {
      idIndex.set(list[i].id, i);
    }
    dirty = true;
  }

  if (pending.size > 0) {
    if (idIndex.size === 0 && getList().length > 0) {
      rebuildIndex();
    }
    let buf = getList();
    let mutated = false;
    for (const next of pending.values()) {
      const idx = idIndex.get(next.id);
      if (idx !== undefined) {
        if (buf[idx] !== next) {
          if (!mutated) {
            buf = buf.slice();
            mutated = true;
          }
          buf[idx] = next;
        }
      } else {
        if (!mutated) {
          buf = buf.slice();
          mutated = true;
        }
        buf.push(next);
        idIndex.set(next.id, buf.length - 1);
      }
    }
    pending.clear();
    if (mutated) {
      setList(buf);
      dirty = true;
    }
  }

  return dirty;
}


export function flushPendingDashboardPatches(): PendingDashboardFlush {
  let domainsDirty = false;
  let streamDirty = false;
  let eventsDirty = false;
  let signalsDirty = false;
  let edgesDirty = false;
  let narrativesDirty = false;

  eventsDirty = flushPendingTrackableList(
    pendingEventDeletes, pendingEvents, eventIdToIndex,
    () => dashboard.events,
    (l) => { dashboard.events = l; },
    rebuildEventIdIndex,
  );
  streamDirty ||= eventsDirty;

  signalsDirty = flushPendingTrackableList(
    pendingSignalDeletes, pendingSignals, signalIdToIndex,
    () => dashboard.recentSignals,
    (l) => { dashboard.recentSignals = l; },
    rebuildSignalIdIndex,
  );
  streamDirty ||= signalsDirty;

  edgesDirty = flushPendingTrackableList(
    pendingCausalDeletes, pendingCausalEdges, causalIdToIndex,
    () => dashboard.recentCausalEdges,
    (l) => { dashboard.recentCausalEdges = l; },
    rebuildCausalIdIndex,
  );
  streamDirty ||= edgesDirty;

  if (pendingNarratives.size > 0) {
    const merged = { ...dashboard.eventNarratives };
    for (const n of pendingNarratives.values()) {
      merged[n.event_id] = n;
    }
    pendingNarratives.clear();
    evictOldestNarratives(merged, MAX_EVENT_NARRATIVES);
    dashboard.eventNarratives = merged;
    narrativesDirty = true;
    streamDirty = true;
  }

  if (Object.keys(pendingWorldState).length > 0) {
    dashboard.domainState = { ...dashboard.domainState, ...pendingWorldState };
    for (const k of Object.keys(pendingWorldState)) {
      delete pendingWorldState[k];
    }
    domainsDirty = true;
  }

  if (Object.keys(pendingDomainInsights).length > 0) {
    dashboard.domainInsights = {
      ...dashboard.domainInsights,
      ...pendingDomainInsights,
    };
    for (const k of Object.keys(pendingDomainInsights)) {
      delete pendingDomainInsights[k];
    }
    domainsDirty = true;
  }

  return { streamDirty, domainsDirty, eventsDirty, signalsDirty, edgesDirty, narrativesDirty };
}

function appendToSeverityHistory(
  hist: Record<string, number[]>,
  domain: string,
  score: number,
): void {
  let arr = hist[domain] ?? [];
  arr = arr.concat(score);
  if (arr.length > MAX_SEVERITY_HISTORY) {
    arr = arr.slice(arr.length - MAX_SEVERITY_HISTORY);
  }
  hist[domain] = arr;
}

const pendingSeverityByDomain = new Map<string, number[]>();

function queueSeverity(event: UiEvent): void {
  if (batchDepth > 0) {
    batchSeverityEvents.push(event);
    return;
  }
  let list = pendingSeverityByDomain.get(event.domain);
  if (!list) {
    list = [];
    pendingSeverityByDomain.set(event.domain, list);
  }
  list.push(event.severity_score);
}


export function flushPendingSeverityUpdates(): boolean {
  const nextHist = { ...dashboard.domainSeverityHistory };
  let dirty = false;

  for (const event of batchSeverityEvents) {
    appendToSeverityHistory(nextHist, event.domain, event.severity_score);
    dirty = true;
  }
  batchSeverityEvents.length = 0;

  for (const [domain, scores] of pendingSeverityByDomain) {
    for (const score of scores) {
      appendToSeverityHistory(nextHist, domain, score);
      dirty = true;
    }
  }
  pendingSeverityByDomain.clear();

  if (dirty) {
    dashboard.domainSeverityHistory = nextHist;
  }
  return dirty;
}

function mergeEventInPlace(next: UiEvent): void {
  if (batchEvents !== null) {
    batchEvents.push(next);
    return;
  }
  pendingEvents.set(next.id, next);
}

export function rebuildEventIdIndex(): void {
  eventIdToIndex.clear();
  dashboard.events.forEach((row, i) => {
    eventIdToIndex.set(row.id, i);
  });
}


export function applyEvent(row: Event): void {
  let next: UiEvent;
  try {
    next = projectEvent(row);
  } catch (e) {
    console.error("openatlas: projectEvent failed, row dropped", e, row);
    const detail = e instanceof Error ? e.message : String(e);
    notifyError({
      code: NOTIFY_CODES.EVENT_PROJECT,
      title: "Could not import an event row",
      message:
        "The event was skipped so the rest of the stream stays responsive. A schema or domain mismatch may be involved.",
      detail,
      action:
        "If this was after a SpacetimeDB or client upgrade, regenerate and publish the module, then hard-refresh the app.",
      dedupeKey: `EVENT_PROJECT:${detail}`,
    });
    return;
  }
  mergeEventInPlace(next);
  queueSeverity(next);
}

export function removeEvent(id: bigint): void {
  const key = String(id);
  if (batchEvents !== null) {
    batchEvents = batchEvents.filter((row) => row.id !== key);
    return;
  }
  pendingEvents.delete(key);
  if (pendingEventDeletes.size < MAX_EVENTS_HARD_CEILING * 2) {
    pendingEventDeletes.add(key);
  }
}

export function applySignal(row: Signal): void {
  let next: UiSignal;
  try {
    next = projectSignal(row);
  } catch (e) {
    console.error("openatlas: projectSignal failed, row dropped", e, row);
    const detail = e instanceof Error ? e.message : String(e);
    notifyError({
      code: NOTIFY_CODES.EVENT_PROJECT,
      title: "Could not import a signal row",
      message:
        "The signal was skipped so the rest of the stream stays responsive. A schema or domain mismatch may be involved.",
      detail,
      action:
        "If this was after a SpacetimeDB or client upgrade, regenerate and publish the module, then hard-refresh the app.",
      dedupeKey: `SIGNAL_PROJECT:${detail}`,
    });
    return;
  }
  if (batchSignals !== null) {
    batchSignals.push(next);
    return;
  }
  pendingSignals.set(next.id, next);
}

export function removeSignal(id: bigint): void {
  const key = String(id);
  if (batchSignals !== null) {
    batchSignals = batchSignals.filter((row) => row.id !== key);
    return;
  }
  pendingSignals.delete(key);
  if (pendingSignalDeletes.size < MAX_SIGNALS * 2) {
    pendingSignalDeletes.add(key);
  }
}

export function applyCausalEdge(row: CausalEdge): void {
  let next: UiCausalEdge;
  try {
    next = projectCausalEdge(row);
  } catch (e) {
    console.error("openatlas: projectCausalEdge failed, row dropped", e, row);
    const detail = e instanceof Error ? e.message : String(e);
    notifyError({
      code: NOTIFY_CODES.EVENT_PROJECT,
      title: "Could not import a causal edge row",
      message:
        "The causal edge was skipped so the rest of the stream stays responsive. A schema or domain mismatch may be involved.",
      detail,
      action:
        "If this was after a SpacetimeDB or client upgrade, regenerate and publish the module, then hard-refresh the app.",
      dedupeKey: `CAUSAL_EDGE_PROJECT:${detail}`,
    });
    return;
  }
  if (batchCausalEdges !== null) {
    batchCausalEdges.push(next);
    return;
  }
  pendingCausalEdges.set(next.id, next);
}

export function removeCausalEdge(id: bigint): void {
  const key = String(id);
  if (batchCausalEdges !== null) {
    batchCausalEdges = batchCausalEdges.filter((row) => row.id !== key);
    return;
  }
  pendingCausalEdges.delete(key);
  if (pendingCausalDeletes.size < MAX_CAUSAL_EDGES * 2) {
    pendingCausalDeletes.add(key);
  }
}

export function applyWorldState(row: WorldStateRow): void {
  let next: UiWorldState;
  try {
    next = projectWorldState(row);
  } catch (e) {
    console.error("openatlas: projectWorldState failed, row dropped", e, row);
    const detail = e instanceof Error ? e.message : String(e);
    notifyError({
      code: NOTIFY_CODES.EVENT_PROJECT,
      title: "Could not import a world state row",
      message:
        "The world state was skipped so the rest of the stream stays responsive. A schema or domain mismatch may be involved.",
      detail,
      action:
        "If this was after a SpacetimeDB or client upgrade, regenerate and publish the module, then hard-refresh the app.",
      dedupeKey: `WORLD_STATE_PROJECT:${detail}`,
    });
    return;
  }
  if (batchDomainState !== null) {
    batchDomainState[next.domain] = next;
    return;
  }
  pendingWorldState[next.domain] = next;
}

export function applyDomainInsight(row: DomainInsight): void {
  let next: UiDomainInsight;
  try {
    next = projectDomainInsight(row);
  } catch (e) {
    console.error("openatlas: projectDomainInsight failed, row dropped", e, row);
    const detail = e instanceof Error ? e.message : String(e);
    notifyError({
      code: NOTIFY_CODES.EVENT_PROJECT,
      title: "Could not import a domain insight row",
      message:
        "The domain insight was skipped so the rest of the stream stays responsive. A schema or domain mismatch may be involved.",
      detail,
      action:
        "If this was after a SpacetimeDB or client upgrade, regenerate and publish the module, then hard-refresh the app.",
      dedupeKey: `DOMAIN_INSIGHT_PROJECT:${detail}`,
    });
    return;
  }
  if (batchDomainInsights !== null) {
    batchDomainInsights[next.domain] = next;
    return;
  }
  pendingDomainInsights[next.domain] = next;
}

export function applyEventNarrative(row: EventNarrative): void {
  const next = projectEventNarrative(row);
  if (batchNarratives !== null) {
    batchNarratives[next.event_id] = next;
    return;
  }
  pendingNarratives.set(next.event_id, next);
}

export function removeEventNarrative(eventId: bigint): void {
  const key = String(eventId);
  if (batchNarratives !== null) {
    delete batchNarratives[key];
    return;
  }
  if (!(key in dashboard.eventNarratives)) return;
  const { [key]: _omit, ...rest } = dashboard.eventNarratives;
  dashboard.eventNarratives = rest;
}


function evictOldestNarratives(
  bucket: Record<string, UiEventNarrative>,
  max: number,
): void {
  const keys = Object.keys(bucket);
  if (keys.length <= max) return;
  keys
    .sort((a, b) => {
      const da = bucket[a] ? Date.parse(bucket[a].updated_at) : 0;
      const db = bucket[b] ? Date.parse(bucket[b].updated_at) : 0;
      return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da);
    })
    .slice(max)
    .forEach((key) => {
      delete bucket[key];
    });
}


