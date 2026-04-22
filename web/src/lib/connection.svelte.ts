/**
 * SpacetimeDB connection lifecycle.
 *
 * This module replaces the earlier `/stream` WebSocket client. Instead
 * of speaking a bespoke JSON envelope from the ingest service, we now
 * connect **directly** to SpacetimeDB using the generated module
 * bindings (`./stdb/`). The SDK maintains a local row cache; we react
 * to `onInsert` / `onUpdate` / `onDelete` events and project the rows
 * into the UI state held in `state.svelte.ts`.
 *
 * # Responsibilities
 *
 *   * Open (and re-open after failures) a single connection to
 *     SpacetimeDB using the module name configured via Vite env vars.
 *   * Subscribe to the tables the dashboard consumes — the SQL clauses
 *     are `SELECT *` because the module itself enforces bounded ring
 *     sizes. We trust the server's caps rather than trying to filter
 *     here.
 *   * Mirror every table row into the typed reactive store.
 *   * Expose a tiny public surface (`connectDb`, `disconnectDb`,
 *     `reducerClient`) so components never touch the SDK directly.
 *
 * # Reconnect strategy
 *
 * The SDK tears down the connection on fatal errors. We retry with the
 * same bounded exponential backoff as the old WebSocket client so the
 * UI still feels responsive after a transient SpacetimeDB restart.
 */

import { DbConnection, type EventContext } from "./stdb";
import type {
  CausalEdge,
  DomainInsight,
  Event,
  EventNarrative,
  Signal,
  WorldStateRow,
} from "./stdb/types";
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
  removeCausalEdge,
  removeEvent,
  removeEventNarrative,
  removeSignal,
  dashboard,
  setConnection,
  setConnectionLastError,
} from "./state.svelte";
import { installDemoData } from "./demo-install.svelte";
import { resolveStdbWebSocketUri } from "./stdb-endpoint";
import { notifyStdbMessage } from "./notify/notify";
import { NOTIFY_CODES } from "./notify/notify-codes";

const DEFAULT_MODULE = "openatlas";

const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 15_000;

const backoffState = {
  currentMs: INITIAL_BACKOFF_MS,
  timer: null as ReturnType<typeof setTimeout> | null,
};

let activeConnection: DbConnection | null = null;
let shuttingDown = false;

/**
 * Kick off the initial connection. Idempotent — calling twice is a
 * no-op. Components invoke this from their root `$effect` in App.svelte.
 */
export function connectDb(): void {
  if (dashboard.dataMode === "demo") return;
  if (activeConnection) return;
  shuttingDown = false;
  openConnection();
}

/**
 * User-triggered or programmatic hard reconnect: drop backoff, tear down
 * any half-open socket, and open a fresh connection. Use when the pill
 * shows offline or after changing env.
 */
export function reconnectNow(): void {
  if (shuttingDown) return;
  if (dashboard.dataMode === "demo") {
    installDemoData();
    return;
  }
  if (backoffState.timer) {
    clearTimeout(backoffState.timer);
    backoffState.timer = null;
  }
  backoffState.currentMs = INITIAL_BACKOFF_MS;
  if (activeConnection) {
    try {
      activeConnection.disconnect();
    } catch {
      /* */
    }
  }
  activeConnection = null;
  setConnectionLastError(null);
  setConnection("connecting");
  openConnection();
}

/**
 * Explicit teardown. Primarily used by hot-module-replacement in dev
 * and by component unmount hooks in tests. Safe to call even if no
 * connection is open.
 */
export function disconnectDb(): void {
  shuttingDown = true;
  if (backoffState.timer) {
    clearTimeout(backoffState.timer);
    backoffState.timer = null;
  }
  if (activeConnection) {
    try {
      activeConnection.disconnect();
    } catch (err) {
      console.warn("spacetimedb disconnect threw", err);
    }
    activeConnection = null;
  }
  setConnection("offline");
}

/**
 * Accessor exposed for components that need to *call* reducers (e.g.
 * a future "submit anomaly" button). Returns `null` while the
 * connection is in flight or lost; callers should guard for that.
 */
export function activeDb(): DbConnection | null {
  return activeConnection;
}

function openConnection(): void {
  setConnection("connecting");
  const uri = resolveStdbWebSocketUri();
  const db = import.meta.env.VITE_STDB_DB ?? DEFAULT_MODULE;
  if (import.meta.env.DEV) {
    console.info(
      "[openatlas] SpacetimeDB",
      { uri, database: db },
    );
  }

  let conn: DbConnection;
  try {
    conn = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(db)
      .onConnect((connection) => {
        onConnected(connection);
      })
      .onConnectError((_ctx, error) => {
        const msg = error?.message ? String(error.message) : "connect error";
        console.error("spacetimedb connect error", error);
        setConnectionLastError(msg);
        handleLostConnection();
      })
      .onDisconnect((_ctx, error) => {
        if (error) {
          console.warn("spacetimedb disconnected with error", error);
          setConnectionLastError(
            error instanceof Error ? error.message : String(error),
          );
        }
        handleLostConnection();
      })
      .build();
  } catch (err) {
    console.error("failed to build SpacetimeDB connection", err);
    setConnectionLastError(
      err instanceof Error ? err.message : "failed to build connection",
    );
    handleLostConnection();
    return;
  }

  activeConnection = conn;
}

function onConnected(connection: DbConnection): void {
  backoffState.currentMs = INITIAL_BACKOFF_MS;
  setConnectionLastError(null);
  setConnection("live");
  installRowHandlers(connection);
  subscribeDashboardQueries(connection);
}

function installRowHandlers(connection: DbConnection): void {
  const db = connection.db;

  db.event.onInsert((_ctx: EventContext, row: Event) => applyEvent(row));
  db.event.onUpdate((_ctx: EventContext, _old: Event, row: Event) =>
    applyEvent(row),
  );
  db.event.onDelete((_ctx: EventContext, row: Event) => removeEvent(row.id));

  db.signal.onInsert((_ctx: EventContext, row: Signal) => applySignal(row));
  db.signal.onDelete((_ctx: EventContext, row: Signal) =>
    removeSignal(row.id),
  );

  db.causal_edge.onInsert((_ctx: EventContext, row: CausalEdge) =>
    applyCausalEdge(row),
  );
  db.causal_edge.onDelete((_ctx: EventContext, row: CausalEdge) =>
    removeCausalEdge(row.id),
  );

  db.world_state.onInsert((_ctx: EventContext, row: WorldStateRow) =>
    applyWorldState(row),
  );
  db.world_state.onUpdate(
    (_ctx: EventContext, _old: WorldStateRow, row: WorldStateRow) =>
      applyWorldState(row),
  );

  db.domain_insight.onInsert((_ctx: EventContext, row: DomainInsight) =>
    applyDomainInsight(row),
  );
  db.domain_insight.onUpdate(
    (_ctx: EventContext, _old: DomainInsight, row: DomainInsight) =>
      applyDomainInsight(row),
  );

  db.event_narrative.onInsert((_ctx: EventContext, row: EventNarrative) =>
    applyEventNarrative(row),
  );
  db.event_narrative.onUpdate(
    (_ctx: EventContext, _old: EventNarrative, row: EventNarrative) =>
      applyEventNarrative(row),
  );
  db.event_narrative.onDelete((_ctx: EventContext, row: EventNarrative) =>
    removeEventNarrative(row.eventId),
  );
}

/**
 * Subscribe to the rows the dashboard needs. We keep the queries
 * narrow to the latest window of each ring so the browser's working
 * set stays modest even when the module's ring holds 50k events.
 *
 * `ORDER BY ... DESC LIMIT N` pushes the trimming to the server so we
 * never ship rows we are going to throw away on arrival.
 */
function subscribeDashboardQueries(connection: DbConnection): void {
  connection
    .subscriptionBuilder()
    .onError((ctx) => {
      const err = ctx.event;
      const msg =
        err instanceof Error ? err.message : err ? String(err) : "subscription error";
      console.error("subscription error", ctx);
      setConnectionLastError(msg);
      notifyStdbMessage(
        NOTIFY_CODES.STDB_SUBSCRIPTION,
        "Data subscription failed",
        "The dashboard could not keep its SpacetimeDB query subscriptions. Live updates may be stale until this is resolved.",
        msg,
        "Try reconnecting from the status bar, or check that the openatlas module and tables match this client’s subscription SQL.",
      );
    })
    .subscribe([
      `SELECT * FROM event ORDER BY ordinal DESC LIMIT ${MAX_EVENTS}`,
      `SELECT * FROM signal ORDER BY id DESC LIMIT ${MAX_SIGNALS}`,
      `SELECT * FROM causal_edge ORDER BY id DESC LIMIT ${MAX_CAUSAL_EDGES}`,
      "SELECT * FROM world_state",
      "SELECT * FROM domain_insight",
      // Narratives are only written for high-severity events (gated
      // in the module), so the row count is naturally much smaller
      // than `event`. We still bound by `MAX_EVENT_NARRATIVES` so a
      // fleet-wide incident cannot flood the client.
      `SELECT * FROM event_narrative ORDER BY event_id DESC LIMIT ${MAX_EVENT_NARRATIVES}`,
    ]);
}

function handleLostConnection(): void {
  if (activeConnection) {
    try {
      activeConnection.disconnect();
    } catch {
      /* already torn down */
    }
  }
  activeConnection = null;
  setConnection("offline");
  if (shuttingDown) return;
  scheduleReconnect();
}

function scheduleReconnect(): void {
  if (backoffState.timer) return;
  const delay = backoffState.currentMs;
  backoffState.currentMs = Math.min(delay * 2, MAX_BACKOFF_MS);
  backoffState.timer = setTimeout(() => {
    backoffState.timer = null;
    openConnection();
  }, delay);
}
