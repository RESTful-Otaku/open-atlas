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
 * On disconnect the client schedules exponential backoff reconnects (max
 * 8 attempts, 2s base). Operators can still call `reconnectNow()` from
 * Settings or the status pill to reset backoff immediately.
 */

import { DbConnection, type EventContext } from "./stdb";
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
import { stdbDatabaseName } from "./native-config";
import { resolveStdbWebSocketUri } from "./stdb-endpoint";
import { notifyStdbMessage } from "./notify/notify";
import { NOTIFY_CODES } from "./notify/notify-codes";
import {
  logStdbConnected,
  logStdbConnecting,
  logStdbDisconnected,
  logStdbError,
  logStdbReconnectAttempt,
} from "./observability/connection-log";

const DEFAULT_MODULE = "openatlas";

let activeConnection: DbConnection | null = null;
let shuttingDown = false;
let connectionOpening = false;
let connectionTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempts = 0;
const MAX_AUTO_RECONNECT_ATTEMPTS = 8;
const RECONNECT_BASE_MS = 2_000;
const CONNECTION_TIMEOUT_MS = 15_000;
let narrativeHandlersInstalled = false;
let narrativeSubscriptionActive = false;
let narrativeSubscriptionHandle: { unsubscribe: () => void } | null = null;
/** Views that need narrative rows (Hub, event detail, map with hover). */
let narrativeConsumerCount = 0;

function syncReconnectUi(): void {
  dashboard.autoReconnectAttempt =
    reconnectTimer !== undefined ? reconnectAttempts : 0;
  dashboard.autoReconnectExhausted =
    dashboard.dataMode !== "demo" &&
    reconnectAttempts >= MAX_AUTO_RECONNECT_ATTEMPTS &&
    reconnectTimer === undefined &&
    dashboard.connection === "offline";
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  syncReconnectUi();
}

function clearConnectionTimer(): void {
  if (connectionTimer !== undefined) {
    clearTimeout(connectionTimer);
    connectionTimer = undefined;
  }
}

function scheduleAutoReconnect(): void {
  if (shuttingDown || dashboard.dataMode === "demo") return;
  if (reconnectTimer !== undefined) return;
  if (reconnectAttempts >= MAX_AUTO_RECONNECT_ATTEMPTS) {
    syncReconnectUi();
    return;
  }
  const delay = Math.min(
    30_000,
    RECONNECT_BASE_MS * 2 ** reconnectAttempts,
  );
  reconnectAttempts += 1;
  logStdbReconnectAttempt(reconnectAttempts);
  syncReconnectUi();
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
/** Operator-facing line for Settings / OpsStrip when backoff is active. */
export function autoReconnectStatusLine(): string | null {
  if (dashboard.dataMode === "demo") return null;
  if (dashboard.connection === "connecting") {
    return "Connecting to SpacetimeDB…";
  }
  if (dashboard.autoReconnectExhausted) {
    return `Auto-reconnect stopped after ${MAX_AUTO_RECONNECT_ATTEMPTS} attempts — use Reconnect in Settings.`;
  }
  if (dashboard.autoReconnectAttempt > 0) {
    return `Auto-reconnect attempt ${dashboard.autoReconnectAttempt} of ${MAX_AUTO_RECONNECT_ATTEMPTS} (exponential backoff).`;
  }
  return null;
}

export function reconnectNow(): void {
  if (shuttingDown) return;
  clearReconnectTimer();
  reconnectAttempts = 0;
  dashboard.autoReconnectExhausted = false;
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
  logStdbConnecting();
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
  dashboard.autoReconnectAttempt = 0;
  dashboard.autoReconnectExhausted = false;
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
  logStdbDisconnected("shutdown");
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
  clearConnectionTimer();
  connectionOpening = true;
  setConnection("connecting");
  logStdbConnecting();
  connectionTimer = setTimeout(() => {
    connectionTimer = undefined;
    if (activeConnection) {
      try { activeConnection.disconnect(); } catch { /* */ }
    }
    activeConnection = null;
    connectionOpening = false;
    setConnectionLastError("Connection timed out");
    handleLostConnection();
  }, CONNECTION_TIMEOUT_MS);
  const uri = resolveStdbWebSocketUri();
  const db = stdbDatabaseName() || DEFAULT_MODULE;
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
        logStdbError(msg);
        handleLostConnection();
      })
      .onDisconnect((_ctx, error) => {
        if (error) {
          console.warn("spacetimedb disconnected with error", error);
          const errMsg =
            error instanceof Error ? error.message : String(error);
          setConnectionLastError(errMsg);
          logStdbDisconnected(errMsg);
        } else {
          logStdbDisconnected();
        }
        handleLostConnection();
      })
      .build();
  } catch (err) {
    console.error("failed to build SpacetimeDB connection", err);
    const buildMsg =
      err instanceof Error ? err.message : "failed to build connection";
    setConnectionLastError(buildMsg);
    logStdbError(buildMsg);
    connectionOpening = false;
    handleLostConnection();
    return;
  }

  activeConnection = conn;
  connectionOpening = false;
}

function onConnected(connection: DbConnection): void {
  clearConnectionTimer();
  if (activeConnection !== null && connection !== activeConnection) return;
  connectionOpening = false;
  reconnectAttempts = 0;
  dashboard.autoReconnectAttempt = 0;
  dashboard.autoReconnectExhausted = false;
  clearReconnectTimer();
  setConnectionLastError(null);
  setConnection("live");
  logStdbConnected();
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

function onInsert<T>(apply: (row: T) => void) {
  return (_ctx: EventContext, row: T) => withRowMutation(() => apply(row));
}

function onUpdate<T>(apply: (row: T) => void) {
  return (_ctx: EventContext, _old: T, row: T) => withRowMutation(() => apply(row));
}

function onDelete(remove: (id: bigint) => void) {
  return (_ctx: EventContext, row: { id: bigint }) =>
    withRowMutation(() => remove(row.id));
}

function installRowHandlers(connection: DbConnection): void {
  const db = connection.db;

  db.event.onInsert(onInsert(applyEvent));
  db.event.onUpdate(onUpdate(applyEvent));
  db.event.onDelete(onDelete(removeEvent));

  db.signal.onInsert(onInsert(applySignal));
  db.signal.onDelete(onDelete(removeSignal));

  db.causal_edge.onInsert(onInsert(applyCausalEdge));
  db.causal_edge.onDelete(onDelete(removeCausalEdge));

  db.world_state.onInsert(onInsert(applyWorldState));
  db.world_state.onUpdate(onUpdate(applyWorldState));

  db.domain_insight.onInsert(onInsert(applyDomainInsight));
  db.domain_insight.onUpdate(onUpdate(applyDomainInsight));
}

function installNarrativeRowHandlers(connection: DbConnection): void {
  if (narrativeHandlersInstalled) return;
  narrativeHandlersInstalled = true;
  const db = connection.db;
  db.event_narrative.onInsert(onInsert(applyEventNarrative));
  db.event_narrative.onUpdate(onUpdate(applyEventNarrative));
  db.event_narrative.onDelete(
    (_ctx: EventContext, row: { eventId: bigint }) =>
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
  const handle = connection
    .subscriptionBuilder()
    .onApplied(() => {
      hydrateNarrativesFromConnection(connection);
    })
    .onError((ctx) => {
      console.warn("event_narrative subscription error", ctx);
    })
    .subscribe([...NARRATIVE_SUBSCRIPTION_QUERIES]);
  narrativeSubscriptionHandle = handle;
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
    if (narrativeConsumerCount === 0 && narrativeSubscriptionHandle) {
      try {
        narrativeSubscriptionHandle.unsubscribe();
      } catch {
        /* already torn down */
      }
      narrativeSubscriptionHandle = null;
      narrativeSubscriptionActive = false;
    }
  };
}

/**
 * Subscribe to dashboard tables (full `SELECT *` per ring/small table).
 * Trimming happens in `sync-dashboard-cache.ts` — STDB 2.1 subscription
 * SQL rejects ORDER BY and LIMIT on some tables (e.g. event_narrative).
 */
function subscribeDashboardQueries(connection: DbConnection): void {
  connection
    .subscriptionBuilder()
    .onApplied(() => {
      hydrateDashboardFromConnection(connection);
    })
    .onError((ctx) => {
      const err = ctx.event;
      const msg = formatSubscriptionError(err);
      console.error("subscription error", ctx);
      setConnectionLastError(msg);
      logStdbError(`Subscription: ${msg}`);
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
  clearConnectionTimer();
  connectionOpening = false;
  narrativeHandlersInstalled = false;
  narrativeSubscriptionActive = false;
  narrativeSubscriptionHandle = null;
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
  syncReconnectUi();
}
