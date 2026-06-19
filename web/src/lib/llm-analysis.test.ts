import { describe, expect, test } from "bun:test";

import {
  llmBlockedReason,
  llmCanRun,
  llmSnapshotFromDashboard,
  domainBriefingPrompt,
  matrixSynthesisPrompt,
  DAILY_BRIEFING_PROMPT,
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
  domainState: {
    energy: {
      domain: "energy",
      event_count: 1,
      avg_severity: 0.5,
      risk_index: 0.4,
    },
  },
  domainInsights: {},
  recentCausalEdges: [],
});

const demoContext = {
  dataMode: "demo" as const,
  connection: "offline" as const,
  snapshot: withEvents,
};

const liveContext = {
  dataMode: "live" as const,
  connection: "live" as const,
  snapshot: withEvents,
};

describe("llmCanRun", () => {
  test("blocks when bridge down", () => {
    expect(llmCanRun(liveContext, false)).toBe(false);
  });

  test("allows live connection with events and ready bridge", () => {
    expect(llmCanRun(liveContext, true)).toBe(true);
  });

  test("allows demo mode with events when bridge ready", () => {
    expect(llmCanRun(demoContext, true)).toBe(true);
  });

  test("blocks with no events", () => {
    expect(
      llmCanRun(
        { ...liveContext, snapshot: emptySnapshot },
        true,
      ),
    ).toBe(false);
  });

  test("blocks when llmReady is null (still checking)", () => {
    expect(llmCanRun(liveContext, null)).toBe(false);
  });
});

describe("llmBlockedReason", () => {
  test("returns null when everything is ready", () => {
    expect(llmBlockedReason(liveContext, true)).toBeNull();
  });

  test("blocks with no events message", () => {
    expect(
      llmBlockedReason(
        { ...liveContext, snapshot: emptySnapshot },
        true,
      ),
    ).toContain("No events");
  });

  test("online connection in demo mode is not blocked by connection", () => {
    const reason = llmBlockedReason(
      { dataMode: "demo", connection: "live", snapshot: withEvents },
      true,
    );
    expect(reason).toBeNull();
  });

  test("offline non-demo is blocked", () => {
    const reason = llmBlockedReason(
      {
        dataMode: "live",
        connection: "offline",
        snapshot: withEvents,
      },
      true,
    );
    expect(reason).toContain("offline");
  });

  test("connecting state shows waiting message", () => {
    const reason = llmBlockedReason(
      {
        dataMode: "live",
        connection: "connecting",
        snapshot: withEvents,
      },
      true,
    );
    expect(reason).toContain("connecting");
  });

  test("bridge not ready shows setup message", () => {
    const reason = llmBlockedReason(
      { ...liveContext, snapshot: withEvents },
      false,
    );
    expect(reason).toContain("Ollama");
  });

  test("bridge still checking shows status message", () => {
    const reason = llmBlockedReason(
      { ...liveContext, snapshot: withEvents },
      null,
    );
    expect(reason).toContain("Checking");
  });
});

describe("llmSnapshotFromDashboard", () => {
  test("includes capturedAt timestamp", () => {
    const snap = llmSnapshotFromDashboard({
      events: [],
      recentSignals: [],
      domainState: {},
      domainInsights: {},
      recentCausalEdges: [],
    });
    expect(snap.capturedAt).toBeString();
    expect(new Date(snap.capturedAt).getTime()).not.toBeNaN();
  });

  test("preserves provided fields", () => {
    const snap = llmSnapshotFromDashboard({
      events: [{ id: "e1" } as any],
      recentSignals: [],
      domainState: {},
      domainInsights: {},
      recentCausalEdges: [],
    });
    expect(snap.events).toHaveLength(1);
  });
});

describe("domainBriefingPrompt", () => {
  test("includes domain id in title", () => {
    const prompt = domainBriefingPrompt("energy");
    expect(prompt).toContain("energy");
    expect(prompt).toContain("live assessment");
  });

  test("includes required section headers", () => {
    const prompt = domainBriefingPrompt("transport");
    expect(prompt).toContain("Signals & anomalies");
    expect(prompt).toContain("Causal context");
    expect(prompt).toContain("Recommended actions");
  });

  test("mentions risk_index and event_count", () => {
    const prompt = domainBriefingPrompt("food");
    expect(prompt).toContain("risk_index");
    expect(prompt).toContain("event_count");
  });
});

describe("matrixSynthesisPrompt", () => {
  test("includes matrix id", () => {
    const prompt = matrixSynthesisPrompt("cyber-monitor", [
      "cyber",
      "tech",
    ]);
    expect(prompt).toContain("cyber-monitor");
  });

  test("lists scope domains", () => {
    const prompt = matrixSynthesisPrompt("test", ["food", "water"]);
    expect(prompt).toContain("food");
    expect(prompt).toContain("water");
  });

  test('uses "all tracked domains" when scope is empty', () => {
    const prompt = matrixSynthesisPrompt("global", []);
    expect(prompt).toContain("all tracked domains");
  });

  test("instructs to not invent facts", () => {
    const prompt = matrixSynthesisPrompt("x", ["y"]);
    expect(prompt).toContain("Do not invent");
  });
});

describe("DAILY_BRIEFING_PROMPT", () => {
  test("includes executive summary section", () => {
    expect(DAILY_BRIEFING_PROMPT).toContain("Executive summary");
  });

  test("includes global threat posture", () => {
    expect(DAILY_BRIEFING_PROMPT).toContain("Global threat posture");
  });

  test("includes suggested follow-ups", () => {
    expect(DAILY_BRIEFING_PROMPT).toContain("Suggested follow-ups");
  });

  test("instructs to not invent facts", () => {
    expect(DAILY_BRIEFING_PROMPT).toContain("Do not invent");
  });

  test("references causal_edges_sample", () => {
    expect(DAILY_BRIEFING_PROMPT).toContain("causal_edges_sample");
  });
});
