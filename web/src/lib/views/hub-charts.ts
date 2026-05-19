/**
 * Executive hub charts — cross-domain summaries from live world-state and events.
 */

import type { EChartsOption } from "echarts";
import { DOMAIN_CATALOG, domainColor, domainLabel } from "../colors";
import type { UiEvent, UiWorldState } from "../types";
import {
  chartGridLine,
  chartTextMuted,
  tooltipBase,
} from "../viz/chart-theme";

/** Horizontal bars: risk index per domain (sorted high → low). */
export function hubDomainRiskBars(
  domainState: Record<string, UiWorldState>,
): EChartsOption {
  const rows = DOMAIN_CATALOG.map((d) => {
    const s = domainState[d.id];
    return {
      id: d.id,
      label: domainLabel(d.id),
      risk: s?.risk_index ?? 0,
      color: domainColor(d.id),
    };
  }).sort((a, b) => b.risk - a.risk);

  return {
    backgroundColor: "transparent",
    textStyle: { color: chartTextMuted() },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (p: unknown) => {
        const items = Array.isArray(p) ? p : [p];
        const hit = items[0] as { dataIndex?: number } | undefined;
        const row = rows[hit?.dataIndex ?? 0];
        if (!row) return "";
        const s = domainState[row.id];
        return [
          `<strong>${row.label}</strong>`,
          `Risk index: ${row.risk.toFixed(2)}`,
          s ? `Events: ${s.event_count} · avg severity ${s.avg_severity.toFixed(2)}` : "No state row yet",
        ].join("<br/>");
      },
    },
    grid: { left: 96, right: 16, top: 8, bottom: 24 },
    xAxis: {
      type: "value",
      min: 0,
      max: 1,
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    yAxis: {
      type: "category",
      data: rows.map((r) => r.label),
      inverse: true,
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
      axisLine: { lineStyle: { color: chartGridLine() } },
    },
    series: [
      {
        type: "bar",
        data: rows.map((r) => ({
          value: r.risk,
          itemStyle: { color: r.color },
        })),
        barMaxWidth: 14,
      },
    ],
  };
}

/** Domain × UTC hour event counts (when events exist in the buffer). */
export function hubActivityHeatmap(events: readonly UiEvent[]): EChartsOption {
  const domains = DOMAIN_CATALOG.map((d) => d.id);
  const hours = Array.from({ length: 24 }, (_, h) => `${h}h`);
  const matrix = domains.map(() => new Array(24).fill(0));
  const di = new Map(domains.map((d, i) => [d, i] as const));

  for (const e of events) {
    const row = di.get(e.domain);
    if (row === undefined) continue;
    const t = Date.parse(e.timestamp);
    if (!Number.isFinite(t)) continue;
    matrix[row]![new Date(t).getUTCHours()] += 1;
  }

  const data: [number, number, number][] = [];
  for (let r = 0; r < domains.length; r += 1) {
    for (let c = 0; c < 24; c += 1) {
      data.push([c, r, matrix[r]![c]!]);
    }
  }
  const maxV = Math.max(1, ...data.map((d) => d[2]));

  return {
    backgroundColor: "transparent",
    textStyle: { color: chartTextMuted() },
    tooltip: { ...tooltipBase, position: "top" },
    grid: { left: 88, right: 12, top: 12, bottom: 32 },
    xAxis: {
      type: "category",
      data: hours,
      axisLabel: { color: chartTextMuted(), fontSize: 8, interval: 3 },
      splitArea: { show: true },
    },
    yAxis: {
      type: "category",
      data: domains.map((d) => domainLabel(d)),
      axisLabel: { color: chartTextMuted(), fontSize: 9 },
    },
    visualMap: {
      min: 0,
      max: maxV,
      orient: "horizontal",
      left: "center",
      bottom: 4,
      itemWidth: 12,
      itemHeight: 72,
      inRange: { color: ["#0f172a", "#38bdf8"] },
      textStyle: { color: chartTextMuted(), fontSize: 9 },
    },
    series: [{ type: "heatmap", data }],
  };
}
