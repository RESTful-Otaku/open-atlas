import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";

// @ts-ignore
globalThis.$state = (init: unknown) => init;

mock.module("./stdb", () => {
  const builder = {
    withUri: () => builder,
    withDatabaseName: () => builder,
    onConnect: () => builder,
    onConnectError: () => builder,
    onDisconnect: () => builder,
    build: () => built,
  };
  const built = {
    disconnect: () => {},
    db: {},
    subscriptionBuilder: () => ({
      onApplied: () => sub,
      onError: () => sub,
      subscribe: () => ({ unsubscribe: () => {} }),
    }),
  };
  const sub = { onApplied: () => sub, onError: () => sub, subscribe: () => ({ unsubscribe: () => {} }) };
  return { DbConnection: { builder: () => builder } };
});

mock.module("./stdb-subscriptions", () => ({
  CORE_SUBSCRIPTION_QUERIES: ["SELECT * FROM event"],
  NARRATIVE_SUBSCRIPTION_QUERIES: ["SELECT * FROM event_narrative"],
}));

mock.module("./update-interval.svelte", () => ({
  getUpdateIntervalMs: () => 5_000,
  restartDashboardFlushCadence: () => {},
  installDashboardFlushCadence: () => {},
}));

mock.module("./sync-dashboard-cache", () => ({
  hydrateDashboardFromConnection: () => {},
  hydrateNarrativesFromConnection: () => {},
  sortAndTrimDashboardBuffers: () => {},
  commitDashboardDomainsRevision: () => {},
}));

mock.module("./demo-install.svelte", () => ({
  installDemoData: () => {},
}));

mock.module("./native-config", () => ({
  stdbDatabaseName: () => "openatlas",
  ingestUrl: () => "",
  shouldProbeIngest: () => true,
  shouldProbeLlm: () => true,
  isNativeApp: () => false,
}));

mock.module("./stdb-endpoint", () => ({
  resolveStdbWebSocketUri: () => "ws://localhost:3000",
}));

mock.module("./notify/notify", () => ({
  notify: () => {},
  notifyStdbMessage: () => {},
  notifyError: () => {},
  appendNotifyLog: () => {},
  dismissToast: () => {},
  toasts: [],
}));

mock.module("./observability/connection-log", () => ({
  logStdbConnected: () => {},
  logStdbConnecting: () => {},
  logStdbDisconnected: () => {},
  logStdbError: () => {},
  logStdbReconnectAttempt: () => {},
}));

describe("connection", () => {
  describe("autoReconnectStatusLine", () => {
    test("returns null when dataMode is demo", async () => {
      const { autoReconnectStatusLine } = await import(
        "./connection.svelte"
      );
      const { dashboard } = await import("./state.svelte");
      dashboard.dataMode = "demo";
      expect(autoReconnectStatusLine()).toBeNull();
    });

    test('returns connecting message when connection is "connecting"', async () => {
      const { autoReconnectStatusLine } = await import(
        "./connection.svelte"
      );
      const { dashboard } = await import("./state.svelte");
      dashboard.dataMode = "live";
      dashboard.connection = "connecting";
      const result = autoReconnectStatusLine();
      expect(result).toContain("Connecting");
      expect(result).toContain("SpacetimeDB");
    });

    test("returns exhausted message when auto-reconnect exhausted", async () => {
      const { autoReconnectStatusLine } = await import(
        "./connection.svelte"
      );
      const { dashboard } = await import("./state.svelte");
      dashboard.connection = "offline";
      dashboard.autoReconnectExhausted = true;
      dashboard.autoReconnectAttempt = 0;
      const result = autoReconnectStatusLine();
      expect(result).toContain("stopped");
      expect(result).toContain("8 attempts");
    });

    test("returns attempt progress message when reconnecting", async () => {
      const { autoReconnectStatusLine } = await import(
        "./connection.svelte"
      );
      const { dashboard } = await import("./state.svelte");
      dashboard.connection = "offline";
      dashboard.autoReconnectExhausted = false;
      dashboard.autoReconnectAttempt = 3;
      const result = autoReconnectStatusLine();
      expect(result).toContain("attempt 3");
      expect(result).toContain("8");
      expect(result).toContain("backoff");
    });

    test("returns null when connection is stable", async () => {
      const { autoReconnectStatusLine } = await import(
        "./connection.svelte"
      );
      const { dashboard } = await import("./state.svelte");
      dashboard.dataMode = "live";
      dashboard.connection = "live";
      dashboard.autoReconnectAttempt = 0;
      dashboard.autoReconnectExhausted = false;
      expect(autoReconnectStatusLine()).toBeNull();
    });
  });

  describe("reconnectNow", () => {
    test("resets reconnect state", async () => {
      const { reconnectNow } = await import("./connection.svelte");
      const { dashboard } = await import("./state.svelte");
      dashboard.dataMode = "live";
      dashboard.connection = "offline";
      dashboard.autoReconnectExhausted = true;
      dashboard.autoReconnectAttempt = 8;

      reconnectNow();

      expect(dashboard.autoReconnectExhausted).toBe(false);
      expect(dashboard.connectionLastError).toBeNull();
    });
  });

  describe("disconnectDb", () => {
    test("resets connection state to offline", async () => {
      const { disconnectDb } = await import("./connection.svelte");
      const { dashboard } = await import("./state.svelte");
      dashboard.connection = "live";
      disconnectDb();
      expect(dashboard.connection).toBe("offline");
      expect(dashboard.autoReconnectAttempt).toBe(0);
      expect(dashboard.autoReconnectExhausted).toBe(false);
    });
  });

  describe("activeDb", () => {
    test("returns null when no connection", async () => {
      const { activeDb } = await import("./connection.svelte");
      expect(activeDb()).toBeNull();
    });
  });

  describe("acquireNarrativeSubscription", () => {
    test("returns noop teardown in demo mode", async () => {
      const { acquireNarrativeSubscription } = await import(
        "./connection.svelte"
      );
      const { dashboard } = await import("./state.svelte");
      dashboard.dataMode = "demo";
      const teardown = acquireNarrativeSubscription();
      expect(typeof teardown).toBe("function");
      expect(() => teardown()).not.toThrow();
    });
  });
});
