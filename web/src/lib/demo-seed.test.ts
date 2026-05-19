import { describe, expect, test } from "bun:test";

import { MAX_EVENTS, MAX_SIGNALS } from "./data-limits";
import { buildDemoSnapshot } from "./demo-seed";

describe("buildDemoSnapshot", () => {
  test("is deterministic for a fixed seed", () => {
    const a = buildDemoSnapshot(42);
    const b = buildDemoSnapshot(42);
    expect(a.events.length).toBe(b.events.length);
    expect(a.events[0]?.id).toBe(b.events[0]?.id);
    expect(a.domainState).toEqual(b.domainState);
  });

  test("respects dashboard caps", () => {
    const s = buildDemoSnapshot(7);
    expect(s.events.length).toBeLessThanOrEqual(MAX_EVENTS);
    expect(s.recentSignals.length).toBeLessThanOrEqual(MAX_SIGNALS);
    expect(Object.keys(s.domainState).length).toBeGreaterThan(0);
  });

  test("different seeds change stochastic fields", () => {
    const a = buildDemoSnapshot(1);
    const b = buildDemoSnapshot(99_001);
    expect(a.events.length).toBe(b.events.length);
    const severityA = a.events.reduce((s, e) => s + e.severity_score, 0);
    const severityB = b.events.reduce((s, e) => s + e.severity_score, 0);
    expect(severityA).not.toBe(severityB);
  });
});
