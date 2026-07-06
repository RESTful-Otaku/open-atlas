/**
 * Executive hub charts — cross-domain summaries from live world-state and events.
 */

import type { EChartsOption } from "echarts";
import { DOMAIN_CATALOG, domainColor, domainLabel } from "../colors";
import type { UiEvent, UiEventHourBucket, UiWorldState } from "../types";
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

/**
 * Donut of event counts by domain — complements risk bars (which use world_state).
 */
export function hubEventSharePie(events: readonly UiEvent[]): EChartsOption {
  const counts = new Map<string, number>();
  for (const d of DOMAIN_CATALOG) {
    counts.set(d.id, 0);
  }
  for (const e of events) {
    counts.set(e.domain, (counts.get(e.domain) ?? 0) + 1);
  }
  const data = DOMAIN_CATALOG.map((d) => ({
    name: domainLabel(d.id),
    value: counts.get(d.id) ?? 0,
    itemStyle: { color: domainColor(d.id) },
  })).filter((d) => d.value > 0);

  if (data.length === 0) {
    return {
      backgroundColor: "transparent",
      textStyle: { color: chartTextMuted() },
      title: {
        text: "No events in buffer",
        left: "center",
        top: "middle",
        textStyle: { color: chartTextMuted(), fontSize: 12 },
      },
      series: [],
    };
  }

  return {
    backgroundColor: "transparent",
    textStyle: { color: chartTextMuted() },
    tooltip: { ...tooltipBase, trigger: "item" },
    series: [
      {
        type: "pie",
        radius: ["38%", "68%"],
        center: ["50%", "52%"],
        data,
        itemStyle: { borderRadius: 3, borderColor: "#09090b", borderWidth: 1 },
        label: { color: chartTextMuted(), fontSize: 9 },
      },
    ],
  };
}

/** Event arrivals by UTC hour in the current buffer (line + area). */
export function hubUtcHourIngestLine(
  events: readonly UiEvent[],
  eventHourBuckets?: Record<string, UiEventHourBucket>,
): EChartsOption {
  const hours = Array.from({ length: 24 }, (_, h) => `${h}h`);
  const buckets = new Array(24).fill(0);
  if (eventHourBuckets && Object.keys(eventHourBuckets).length > 0) {
    for (const hb of Object.values(eventHourBuckets)) {
      const hour = new Date(hb.utc_hour_bin * 1000).getUTCHours();
      buckets[hour] += hb.event_count;
    }
  } else {
    for (const e of events) {
      const t = Date.parse(e.timestamp);
      if (!Number.isFinite(t)) continue;
      buckets[new Date(t).getUTCHours()] += 1;
    }
  }
  const maxY = Math.max(1, ...buckets);

  return {
    backgroundColor: "transparent",
    textStyle: { color: chartTextMuted() },
    tooltip: { ...tooltipBase, trigger: "axis" },
    grid: { left: 40, right: 16, top: 12, bottom: 28 },
    xAxis: {
      type: "category",
      data: hours,
      axisLabel: { color: chartTextMuted(), fontSize: 8, interval: 3 },
      axisLine: { lineStyle: { color: chartGridLine() } },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: maxY,
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 9 },
    },
    series: [
      {
        name: "Events",
        type: "line",
        data: buckets,
        smooth: true,
        symbol: "circle",
        symbolSize: 4,
        areaStyle: { opacity: 0.12 },
        lineStyle: { width: 2, color: "#38bdf8" },
        itemStyle: { color: "#38bdf8" },
      },
    ],
  };
}

/** Domain × UTC hour event counts (when events exist in the buffer). */
export function hubActivityHeatmap(
  events: readonly UiEvent[],
  eventHourBuckets?: Record<string, UiEventHourBucket>,
): EChartsOption {
  const domains = DOMAIN_CATALOG.map((d) => d.id);
  const hours = Array.from({ length: 24 }, (_, h) => `${h}h`);
  const matrix = domains.map(() => new Array(24).fill(0));
  const di = new Map(domains.map((d, i) => [d, i] as const));

  if (eventHourBuckets && Object.keys(eventHourBuckets).length > 0) {
    for (const hb of Object.values(eventHourBuckets)) {
      const row = di.get(hb.domain);
      if (row === undefined) continue;
      const hour = new Date(hb.utc_hour_bin * 1000).getUTCHours();
      const mRow = matrix[row];
      if (mRow) mRow[hour] = (mRow[hour] ?? 0) + hb.event_count;
    }
  } else {
    for (const e of events) {
      const row = di.get(e.domain);
      if (row === undefined) continue;
      const t = Date.parse(e.timestamp);
      if (!Number.isFinite(t)) continue;
      const mRow2 = matrix[row];
      if (mRow2) { const h2 = new Date(t).getUTCHours(); mRow2[h2] = (mRow2[h2] ?? 0) + 1; }
    }
  }

  const data: [number, number, number][] = [];
  for (let r = 0; r < domains.length; r += 1) {
    for (let c = 0; c < 24; c += 1) {
      data.push([c, r, matrix[r]?.[c] ?? 0]);
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
