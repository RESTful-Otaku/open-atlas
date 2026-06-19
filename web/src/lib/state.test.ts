import { describe, expect, test, mock } from "bun:test";

// @ts-ignore
globalThis.$state = (init: unknown) => init;

mock.module("./notify/notify", () => ({
  notifyError: () => {},
  notify: () => {},
  notifyStdbMessage: () => {},
  appendNotifyLog: () => {},
  dismissToast: () => {},
  toasts: [],
}));

import type { UiEvent, UiSignal } from "./types";

function mockTimestamp(epochMs: number) {
  return {
    toISOString: () => new Date(epochMs).toISOString(),
  } as unknown as { toISOString: () => string };
}

describe("state", () => {
  describe("setConnection / setConnectionLastError", () => {
    test("setConnection updates dashboard.connection", async () => {
      const { setConnection, dashboard } = await import("./state.svelte");
      dashboard.connection = "connecting";
      setConnection("live");
      expect(dashboard.connection).toBe("live");
      setConnection("offline");
      expect(dashboard.connection).toBe("offline");
    });

    test("setConnectionLastError updates the error field", async () => {
      const { setConnectionLastError, dashboard } = await import(
        "./state.svelte",
      );
      dashboard.connectionLastError = null;
      setConnectionLastError("something went wrong");
      expect(dashboard.connectionLastError).toBe("something went wrong");
      setConnectionLastError(null);
      expect(dashboard.connectionLastError).toBeNull();
    });
  });

  describe("setSelectedDomain / matchesSelectedDomain", () => {
    test("setSelectedDomain sets a valid domain", async () => {
      const { setSelectedDomain, dashboard } = await import("./state.svelte");
      dashboard.selectedDomain = null;
      setSelectedDomain("energy");
      expect(dashboard.selectedDomain).toBe("energy");
    });

    test("setSelectedDomain rejects invalid domain", async () => {
      const { setSelectedDomain, dashboard } = await import("./state.svelte");
      dashboard.selectedDomain = "energy";
      setSelectedDomain("nonexistent-domain");
      expect(dashboard.selectedDomain).toBeNull();
    });

    test("setSelectedDomain rejects empty string", async () => {
      const { setSelectedDomain, dashboard } = await import("./state.svelte");
      dashboard.selectedDomain = "energy";
      setSelectedDomain("");
      expect(dashboard.selectedDomain).toBeNull();
    });

    test("matchesSelectedDomain returns true when no domain selected", async () => {
      const { matchesSelectedDomain, dashboard } = await import(
        "./state.svelte",
      );
      dashboard.selectedDomain = null;
      expect(matchesSelectedDomain("anything")).toBe(true);
    });

    test("matchesSelectedDomain returns true for matching domain", async () => {
      const { matchesSelectedDomain, dashboard } = await import(
        "./state.svelte",
      );
      dashboard.selectedDomain = "energy";
      expect(matchesSelectedDomain("energy")).toBe(true);
      expect(matchesSelectedDomain("climate")).toBe(false);
    });
  });

  describe("activeDomains", () => {
    test("returns sorted domains", async () => {
      const { activeDomains, dashboard } = await import("./state.svelte");
      dashboard.domainState = {
        transport: {
          domain: "transport",
          event_count: 5,
          avg_severity: 0.3,
          risk_index: 0.2,
        },
        energy: {
          domain: "energy",
          event_count: 10,
          avg_severity: 0.5,
          risk_index: 0.4,
        },
      };
      const result = activeDomains();
      expect(result).toHaveLength(2);
      expect(result[0].domain).toBe("energy");
      expect(result[1].domain).toBe("transport");
    });

    test("returns empty array when no domains", async () => {
      const { activeDomains, dashboard } = await import("./state.svelte");
      dashboard.domainState = {};
      expect(activeDomains()).toEqual([]);
    });
  });

  describe("beginDashboardBatch / endDashboardBatch", () => {
    test("nested batch requires same number of ends", async () => {
      const { beginDashboardBatch, endDashboardBatch, dashboard } = await import(
        "./state.svelte",
      );
      dashboard.events = [];
      dashboard.recentSignals = [];
      dashboard.recentCausalEdges = [];
      dashboard.eventNarratives = {};
      dashboard.domainState = {};
      dashboard.domainInsights = {};

      beginDashboardBatch();
      beginDashboardBatch();
      expect(() => endDashboardBatch()).not.toThrow();
      expect(() => endDashboardBatch()).not.toThrow();
    });

    test("endDashboardBatch with no matching begin is a no-op", async () => {
      const { endDashboardBatch } = await import("./state.svelte");
      expect(() => endDashboardBatch()).not.toThrow();
    });
  });

  describe("rebuildEventIdIndex / lookupEventById", () => {
    test("lookupEventById returns undefined for unknown id", async () => {
      const { lookupEventById, dashboard } = await import("./state.svelte");
      dashboard.events = [];
      expect(lookupEventById("nonexistent")).toBeUndefined();
    });

    test("rebuildEventIdIndex builds index from dashboard.events", async () => {
      const { rebuildEventIdIndex, lookupEventById, dashboard } = await import(
        "./state.svelte",
      );
      dashboard.events = [
        { id: "1", ordinal: 1, domain: "energy", timestamp: "2024-01-01T00:00:00Z", severity_score: 0.5, location: null },
        { id: "2", ordinal: 2, domain: "climate", timestamp: "2024-01-01T00:00:01Z", severity_score: 0.3, location: null },
      ] as UiEvent[];
      rebuildEventIdIndex();
      const found = lookupEventById("1") as UiEvent;
      expect(found).not.toBeUndefined();
      expect(found.id).toBe("1");
      expect(lookupEventById("3")).toBeUndefined();
    });

    test("rebuildEventIdIndex rebuilds after events change", async () => {
      const { rebuildEventIdIndex, lookupEventById, dashboard } = await import(
        "./state.svelte",
      );
      dashboard.events = [
        { id: "5", ordinal: 1, domain: "energy", timestamp: "2024-01-01T00:00:00Z", severity_score: 0.5, location: null },
      ] as UiEvent[];
      rebuildEventIdIndex();
      expect((lookupEventById("5") as UiEvent).id).toBe("5");
    });
  });

  describe("applyEvent / dashboard events", () => {
    test("applyEvent projects an event and makes it available via flush", async () => {
      const { applyEvent, flushPendingDashboardPatches, dashboard } = await import(
        "./state.svelte",
      );
      dashboard.events = [];
      const row = {
        id: BigInt(42),
        ordinal: BigInt(1),
        timestamp: mockTimestamp(1_704_060_000_000),
        domain: 0 as unknown as number,
        severityScore: 0.75,
        payloadJson: JSON.stringify({ source: "test-feed" }),
      };
      applyEvent(row as never);
      const result = flushPendingDashboardPatches();
      expect(result.streamDirty).toBe(true);
      expect(dashboard.events).toHaveLength(1);
      expect(dashboard.events[0].id).toBe("42");
      expect(dashboard.events[0].feedSource).toBe("test-feed");
    });

    test("applyEvent does not crash on invalid payload", async () => {
      const { applyEvent, flushPendingDashboardPatches, dashboard } = await import(
        "./state.svelte",
      );
      dashboard.events = [];
      const row = {
        id: BigInt(999),
        ordinal: BigInt(1),
        timestamp: mockTimestamp(1_704_060_000_000),
        domain: 0 as unknown as number,
        severityScore: 0.75,
        payloadJson: "{invalid json",
      };
      applyEvent(row as never);
      const result = flushPendingDashboardPatches();
      expect(result.streamDirty).toBe(true);
      expect(dashboard.events).toHaveLength(1);
    });

    test("removeEvent adds to deletes, flush removes from dashboard", async () => {
      const { removeEvent, flushPendingDashboardPatches, dashboard } = await import(
        "./state.svelte",
      );
      dashboard.events = [
        { id: "1", ordinal: 1, domain: "energy", timestamp: "2024-01-01T00:00:00Z", severity_score: 0.5, location: null },
        { id: "2", ordinal: 2, domain: "climate", timestamp: "2024-01-01T00:00:01Z", severity_score: 0.3, location: null },
      ] as UiEvent[];
      removeEvent(BigInt(1));
      flushPendingDashboardPatches();
      expect(dashboard.events).toHaveLength(1);
      expect(dashboard.events[0].id).toBe("2");
    });
  });

  describe("applySignal / dashboard signals", () => {
    test("applySignal projects a signal and makes it available via flush", async () => {
      const { applySignal, flushPendingDashboardPatches, dashboard } = await import(
        "./state.svelte",
      );
      dashboard.recentSignals = [];
      const row = {
        id: BigInt(1),
        eventId: BigInt(42),
        domain: 1 as unknown as number,
        score: 0.9,
        reason: "test reason",
      };
      applySignal(row as never);
      const result = flushPendingDashboardPatches();
      expect(result.streamDirty).toBe(true);
      expect(dashboard.recentSignals).toHaveLength(1);
      expect(dashboard.recentSignals[0].event_id).toBe("42");
    });

    test("removeSignal adds to deletes, flush removes", async () => {
      const { applySignal, removeSignal, flushPendingDashboardPatches, dashboard } = await import(
        "./state.svelte",
      );
      dashboard.recentSignals = [];
      const row = {
        id: BigInt(1),
        eventId: BigInt(42),
        domain: 1 as unknown as number,
        score: 0.9,
        reason: "test",
      };
      applySignal(row as never);
      flushPendingDashboardPatches();
      expect(dashboard.recentSignals).toHaveLength(1);
      expect(dashboard.recentSignals[0].id).toBe("1");

      removeSignal(BigInt(1));
      flushPendingDashboardPatches();
      expect(dashboard.recentSignals).toHaveLength(0);
    });
  });

  describe("applyCausalEdge / dashboard causal edges", () => {
    test("applyCausalEdge projects and makes available via flush", async () => {
      const { applyCausalEdge, flushPendingDashboardPatches, dashboard } = await import(
        "./state.svelte",
      );
      dashboard.recentCausalEdges = [];
      const row = {
        id: BigInt(1),
        sourceEventId: BigInt(10),
        targetEventId: BigInt(20),
        influenceScore: 0.8,
        decayRate: 0.1,
      };
      applyCausalEdge(row as never);
      const result = flushPendingDashboardPatches();
      expect(result.streamDirty).toBe(true);
      expect(dashboard.recentCausalEdges).toHaveLength(1);
      expect(dashboard.recentCausalEdges[0].source_event_id).toBe("10");
    });
  });

  describe("applyWorldState / dashboard domain state", () => {
    test("applyWorldState updates dashboard.domainState via flush", async () => {
      const { applyWorldState, flushPendingDashboardPatches, dashboard } = await import(
        "./state.svelte",
      );
      dashboard.domainState = {};
      const row = {
        domain: 0 as unknown as number,
        eventCount: BigInt(100),
        avgSeverity: 0.5,
        riskIndex: 0.3,
      };
      applyWorldState(row as never);
      const result = flushPendingDashboardPatches();
      expect(result.domainsDirty).toBe(true);
      expect(dashboard.domainState["energy"]).toBeDefined();
      expect(dashboard.domainState["energy"].event_count).toBe(100);
    });
  });

  describe("flushPendingSeverityUpdates", () => {
    test("flushPendingSeverityUpdates clears severity state", async () => {
      const { flushPendingSeverityUpdates, dashboard } = await import(
        "./state.svelte",
      );
      dashboard.domainSeverityHistory = {};
      flushPendingSeverityUpdates();
      const result = flushPendingSeverityUpdates();
      expect(result).toBe(false);
    });
  });

  describe("re-exports from data-limits", () => {
    test("exports data-limits constants", async () => {
      const state = await import("./state.svelte");
      expect(state.MAX_EVENTS).toBeGreaterThan(0);
      expect(state.MAX_SIGNALS).toBeGreaterThan(0);
      expect(state.MAX_CAUSAL_EDGES).toBeGreaterThan(0);
      expect(state.MAX_EVENT_NARRATIVES).toBeGreaterThan(0);
      expect(state.MAX_SEVERITY_HISTORY).toBeGreaterThan(0);
    });
  });
});
