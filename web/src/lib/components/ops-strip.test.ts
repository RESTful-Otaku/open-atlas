import { describe, expect, test } from "bun:test";

import {
  connectionOpsLabel,
  connectionOpsTier,
  feedOpsHint,
  feedOpsTier,
  simOpsLine,
} from "./ops-strip";

describe("ops-strip helpers", () => {
  test("connectionOpsLabel reflects mode and socket state", () => {
    expect(connectionOpsLabel("demo", "offline")).toBe("Preview");
    expect(connectionOpsLabel("live", "live")).toBe("Live");
    expect(connectionOpsLabel("live", "connecting")).toBe("Connecting");
    expect(connectionOpsLabel("live", "offline")).toBe("Offline");
    expect(connectionOpsLabel("live", "offline", 2, false)).toBe(
      "Offline (retry 2)",
    );
    expect(connectionOpsLabel("live", "offline", 0, true)).toBe(
      "Offline (retry stopped)",
    );
  });

  test("connectionOpsTier maps to pillar tiers", () => {
    expect(connectionOpsTier("live", "live")).toBe("live");
    expect(connectionOpsTier("live", "connecting")).toBe("degraded");
    expect(connectionOpsTier("demo", "offline")).toBe("degraded");
  });

  test("feedOpsHint summarizes catalog health", () => {
    expect(feedOpsHint(null, true, null)).toContain("Loading");
    expect(
      feedOpsHint({ ok: 3, degraded: 0, error: 1, idle: 0, total: 4 }, false, null),
    ).toContain("error");
    expect(
      feedOpsHint({ ok: 4, degraded: 0, error: 0, idle: 0, total: 4 }, false, null),
    ).toBe("4/4 feeds OK");
  });

  test("feedOpsTier degrades on errors", () => {
    expect(feedOpsTier({ ok: 1, degraded: 0, error: 1, idle: 0, total: 2 }, false, null)).toBe(
      "degraded",
    );
    expect(feedOpsTier(null, false, "network")).toBe("offline");
  });

  test("simOpsLine extracts clock and phase", () => {
    const line = simOpsLine("2026-05-20 14:30", 14 * 60 + 30);
    expect(line.clock).toBe("14:30");
    expect(line.phase).toBe("Day");
  });
});
