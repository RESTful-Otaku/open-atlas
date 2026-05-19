/**
 * SpacetimeDB connection lifecycle.
 *
 * This module replaces the earlier `/stream` WebSocket client. Instead
 * of speaking a bespoke JSON envelope from the ingest service, we now
 * connect **directly** to SpacetimeDB using the generated module
 * bindings (`./stdb/`). The SDK maintains a local row cache (tier 4 in
 * `docs/DATA_PLANE.md`); we react to `onInsert` / `onUpdate` / `onDelete`
 * and project trimmed rows into `state.svelte.ts`. External APIs are never
 * polled from the browser in live mode.
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
 * The SDK tears down the connection on fatal errors. Reconnect is manual
 * (Settings or the status pill) so a bad subscription does not loop.
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
import {
  CORE_SUBSCRIPTION_QUERIES,
  NARRATIVE_SUBSCRIPTION_QUERIES,
} from "./stdb-subscriptions";
import { scheduleDashboardFlush } from "./dashboard-flush";
import {
  hydrateDashboardFromConnection,
  hydrateNarrativesFromConnection,
} from "./sync-dashboard-cache";
import { installDemoData } from "./demo-install.svelte";
import { resolveStdbWebSocketUri } from "./stdb-endpoint";
import { notifyStdbMessage } from "./notify/notify";
import { NOTIFY_CODES } from "./notify/notify-codes";

const DEFAULT_MODULE = "openatlas";

let activeConnection: DbConnection | null = null;
let shuttingDown = false;
let connectionOpening = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempts = 0;
const MAX_AUTO_RECONNECT_ATTEMPTS = 8;
const RECONNECT_BASE_MS = 2_000;
let narrativeHandlersInstalled = false;
let narrativeSubscriptionActive = false;
/** Views that need narrative rows (Hub, event detail, map with hover). */
let narrativeConsumerCount = 0;

function clearReconnectTimer(): void {
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
}

function scheduleAutoReconnect(): void {
  if (shuttingDown || dashboard.dataMode === "demo") return;
  if (reconnectTimer !== undefined) return;
  if (reconnectAttempts >= MAX_AUTO_RECONNECT_ATTEMPTS) return;
  const delay = Math.min(
    30_000,
    RECONNECT_BASE_MS * 2 ** reconnectAttempts,
  );
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    if (
      shuttingDown ||
      dashboard.dataMode === "demo" ||
      activeConnection ||
      connectionOpening
    ) {
      return;
    }
    if (dashboard.connection === "offline") {
      openConnection();
    }
  }, delay);
}

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
  clearReconnectTimer();
  reconnectAttempts = 0;
  if (dashboard.dataMode === "demo") {
    installDemoData();
    return;
  }
  if (activeConnection) {
    try {
      activeConnection.disconnect();
    } catch {
      /* */
    }
  }
  activeConnection = null;
  narrativeHandlersInstalled = false;
  narrativeSubscriptionActive = false;
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
  clearReconnectTimer();
  reconnectAttempts = 0;
  connectionOpening = false;
  narrativeHandlersInstalled = false;
  narrativeSubscriptionActive = false;
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
  if (shuttingDown || connectionOpening) return;
  if (activeConnection) return;

  clearReconnectTimer();
  connectionOpening = true;
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
    connectionOpening = false;
    handleLostConnection();
    return;
  }

  activeConnection = conn;
  connectionOpening = false;
}

function onConnected(connection: DbConnection): void {
  connectionOpening = false;
  reconnectAttempts = 0;
  clearReconnectTimer();
  setConnectionLastError(null);
  setConnection("live");
  installRowHandlers(connection);
  subscribeDashboardQueries(connection);
}

let rowMutationDepth = 0;

function withRowMutation(fn: () => void): void {
  rowMutationDepth += 1;
  try {
    fn();
  } finally {
    rowMutationDepth -= 1;
    if (rowMutationDepth === 0) {
      scheduleDashboardFlush();
    }
  }
}

function installRowHandlers(connection: DbConnection): void {
  const db = connection.db;

  db.event.onInsert((_ctx: EventContext, row: Event) =>
    withRowMutation(() => applyEvent(row)),
  );
  db.event.onUpdate((_ctx: EventContext, _old: Event, row: Event) =>
    withRowMutation(() => applyEvent(row)),
  );
  db.event.onDelete((_ctx: EventContext, row: Event) =>
    withRowMutation(() => removeEvent(row.id)),
  );

  db.signal.onInsert((_ctx: EventContext, row: Signal) =>
    withRowMutation(() => applySignal(row)),
  );
  db.signal.onDelete((_ctx: EventContext, row: Signal) =>
    withRowMutation(() => removeSignal(row.id)),
  );

  db.causal_edge.onInsert((_ctx: EventContext, row: CausalEdge) =>
    withRowMutation(() => applyCausalEdge(row)),
  );
  db.causal_edge.onDelete((_ctx: EventContext, row: CausalEdge) =>
    withRowMutation(() => removeCausalEdge(row.id)),
  );

  db.world_state.onInsert((_ctx: EventContext, row: WorldStateRow) =>
    withRowMutation(() => applyWorldState(row)),
  );
  db.world_state.onUpdate(
    (_ctx: EventContext, _old: WorldStateRow, row: WorldStateRow) =>
      withRowMutation(() => applyWorldState(row)),
  );

  db.domain_insight.onInsert((_ctx: EventContext, row: DomainInsight) =>
    withRowMutation(() => applyDomainInsight(row)),
  );
  db.domain_insight.onUpdate(
    (_ctx: EventContext, _old: DomainInsight, row: DomainInsight) =>
      withRowMutation(() => applyDomainInsight(row)),
  );
}

function installNarrativeRowHandlers(connection: DbConnection): void {
  if (narrativeHandlersInstalled) return;
  narrativeHandlersInstalled = true;
  const db = connection.db;
  db.event_narrative.onInsert((_ctx: EventContext, row: EventNarrative) =>
    withRowMutation(() => applyEventNarrative(row)),
  );
  db.event_narrative.onUpdate(
    (_ctx: EventContext, _old: EventNarrative, row: EventNarrative) =>
      withRowMutation(() => applyEventNarrative(row)),
  );
  db.event_narrative.onDelete((_ctx: EventContext, row: EventNarrative) =>
    withRowMutation(() => removeEventNarrative(row.eventId)),
  );
}

/**
 * Subscribe to `event_narrative` only when a view needs headlines/LLM context.
 * Keeps the default WS payload small (narratives are large text blobs).
 */
export function ensureNarrativeSubscription(): void {
  if (dashboard.dataMode === "demo") return;
  const connection = activeConnection;
  if (!connection || narrativeSubscriptionActive) return;
  narrativeSubscriptionActive = true;
  installNarrativeRowHandlers(connection);
  connection
    .subscriptionBuilder()
    .onApplied(() => {
      hydrateNarrativesFromConnection(connection);
    })
    .onError((ctx) => {
      console.warn("event_narrative subscription error", ctx);
    })
    .subscribe([...NARRATIVE_SUBSCRIPTION_QUERIES]);
}

/**
 * Call from view `onMount`; returned teardown runs on destroy so narratives
 * are not merged into dashboard state when no view is listening.
 */
export function acquireNarrativeSubscription(): () => void {
  if (dashboard.dataMode === "demo") return () => {};
  narrativeConsumerCount += 1;
  ensureNarrativeSubscription();
  return () => {
    narrativeConsumerCount = Math.max(0, narrativeConsumerCount - 1);
  };
}

/**
 * Subscribe to dashboard tables (full `SELECT *` per ring/small table).
 * Trimming happens in `sync-dashboard-cache.ts` — STDB 2.1 subscription
 * SQL rejects ORDER BY and LIMIT on some tables (e.g. event_narrative).
 */
function subscribeDashboardQueries(connection: DbConnection): void {
  installNarrativeRowHandlers(connection);
  connection
    .subscriptionBuilder()
    .onApplied(() => {
      hydrateDashboardFromConnection(connection);
      ensureNarrativeSubscription();
    })
    .onError((ctx) => {
      const err = ctx.event;
      const msg = formatSubscriptionError(err);
      console.error("subscription error", ctx);
      setConnectionLastError(msg);
      notifyStdbMessage(
        NOTIFY_CODES.STDB_SUBSCRIPTION,
        "Data subscription failed",
        "The dashboard could not subscribe to SpacetimeDB tables. Live views stay empty until this is fixed.",
        msg,
        "Use full SELECT * only (no ORDER BY or LIMIT). See web/src/lib/stdb-subscriptions.ts.",
      );
      handleLostConnection();
    })
    .subscribe([...CORE_SUBSCRIPTION_QUERIES]);
}

function formatSubscriptionError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.error === "string") return o.error;
  }
  return err ? String(err) : "subscription error";
}

function handleLostConnection(): void {
  connectionOpening = false;
  narrativeHandlersInstalled = false;
  narrativeSubscriptionActive = false;
  const prev = activeConnection;
  activeConnection = null;
  if (prev) {
    try {
      prev.disconnect();
    } catch {
      /* already torn down */
    }
  }
  setConnection("offline");
  scheduleAutoReconnect();
}
