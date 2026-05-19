import { describe, expect, test } from "bun:test";

import {
  llmBlockedReason,
  llmCanRun,
  llmSnapshotFromDashboard,
} from "./llm-analysis";

const emptySnapshot = llmSnapshotFromDashboard({
  events: [],
  recentSignals: [],
  domainState: {},
  domainInsights: {},
  recentCausalEdges: [],
});

const withEvents = llmSnapshotFromDashboard({
  events: [
    {
      id: "1",
      ordinal: 1,
      domain: "energy",
      timestamp: "2026-01-01T00:00:00Z",
      severity_score: 0.5,
      location: null,
    },
  ],
  recentSignals: [],
  domainState: { energy: { domain: "energy", event_count: 1, avg_severity: 0.5, risk_index: 0.4 } },
  domainInsights: {},
  recentCausalEdges: [],
});

describe("llmCanRun", () => {
  test("blocks when bridge down", () => {
    expect(
      llmCanRun(
        { dataMode: "live", connection: "live", snapshot: withEvents },
        false,
      ),
    ).toBe(false);
  });

  test("allows live connection with events and ready bridge", () => {
    expect(
      llmCanRun(
        { dataMode: "live", connection: "live", snapshot: withEvents },
        true,
      ),
    ).toBe(true);
  });

  test("allows demo mode with events when bridge ready", () => {
    expect(
      llmCanRun(
        { dataMode: "demo", connection: "offline", snapshot: withEvents },
        true,
      ),
    ).toBe(true);
  });

  test("blocks with no events", () => {
    expect(
      llmBlockedReason(
        { dataMode: "live", connection: "live", snapshot: emptySnapshot },
        true,
      ),
    ).toContain("No events");
  });
});
