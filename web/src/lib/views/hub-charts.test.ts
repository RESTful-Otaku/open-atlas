import { describe, expect, test } from "bun:test";

import { hubActivityHeatmap, hubDomainRiskBars } from "./hub-charts";
import type { UiEvent, UiWorldState } from "../types";

describe("hub-charts", () => {
  test("hubDomainRiskBars returns series for catalog domains", () => {
    const domainState: Record<string, UiWorldState> = {
      finance: {
        domain: "finance",
        risk_index: 0.8,
        event_count: 10,
        avg_severity: 0.4,
        last_updated: "2026-01-01T00:00:00Z",
      },
    };
    const opt = hubDomainRiskBars(domainState);
    const series = (opt.series as { data: unknown[] }[])?.[0];
    expect(series?.data?.length).toBeGreaterThan(0);
  });

  test("hubActivityHeatmap buckets events by UTC hour", () => {
    const events: UiEvent[] = [
      {
        id: "1",
        ordinal: 1,
        timestamp: "2026-01-01T12:30:00Z",
        domain: "finance",
        severity_score: 0.5,
        location: null,
      },
    ];
    const opt = hubActivityHeatmap(events);
    const heat = (opt.series as { data: [number, number, number][] }[])?.[0];
    const total = heat?.data?.reduce((n, cell) => n + cell[2], 0) ?? 0;
    expect(total).toBe(1);
  });
});
