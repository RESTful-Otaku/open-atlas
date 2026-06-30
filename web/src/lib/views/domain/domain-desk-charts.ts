/**
 * ECharts options for per-domain desks — synthetic but structurally faithful
 * to how SOC, trading, NOC, and mission-control screens partition attention.
 */

import type { EChartsOption } from "echarts";
import type { DeskProfile } from "./domain-desk-types";
import type { DataMode } from "../../data-source-copy";
import { deskGeoNote } from "../../data-source-copy";
import type { UiCausalEdge, UiEvent, UiEventHourBucket, UiWorldState } from "../../types";
import {
  chartGridLine,
  chartItemBorder,
  chartTextMain,
  chartTextMuted,
} from "../../viz/chart-theme";

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pseudoRng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

function hourBuckets(
  events: readonly UiEvent[],
  eventHourBuckets?: Record<string, UiEventHourBucket>,
  domainId?: string,
): number[] {
  const h = new Array(24).fill(0);
  if (eventHourBuckets && Object.keys(eventHourBuckets).length > 0) {
    for (const hb of Object.values(eventHourBuckets)) {
      if (domainId !== undefined && hb.domain !== domainId) continue;
      const hour = new Date(hb.utc_hour_bin * 1000).getUTCHours();
      h[hour] += hb.event_count;
    }
  } else {
    for (const e of events) {
      const t = Date.parse(e.timestamp);
      if (!Number.isFinite(t)) continue;
      h[new Date(t).getUTCHours()] += 1;
    }
  }
  return h;
}

export function rollingStressLine(
  severityHistory: readonly number[],
  accent: string,
): EChartsOption {
  const labels = severityHistory.map((_, i) => `T-${severityHistory.length - i}`);
  return {
    backgroundColor: "transparent",
    animation: false,
    textStyle: { color: chartTextMuted() },
    tooltip: { trigger: "axis" },
    grid: { left: 44, right: 12, top: 28, bottom: 28 },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
      axisLine: { lineStyle: { color: chartGridLine() } },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 1,
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    series: [
      {
        type: "line",
        smooth: 0.35,
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { width: 2, color: accent },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${accent}55` },
              { offset: 1, color: "transparent" },
            ],
          },
        },
        data: [...severityHistory],
      },
    ],
  };
}

export function hourOfDayBars(
  events: readonly UiEvent[],
  accent: string,
  eventHourBuckets?: Record<string, UiEventHourBucket>,
  domainId?: string,
): EChartsOption {
  const data = hourBuckets(events, eventHourBuckets, domainId);
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    grid: { left: 36, right: 8, top: 22, bottom: 36 },
    xAxis: {
      type: "category",
      data: data.map((_, h) => `${h}h`),
      axisLabel: { color: chartTextMuted(), fontSize: 9, rotate: 45 },
      axisLine: { lineStyle: { color: chartGridLine() } },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    series: [
      {
        type: "bar",
        data,
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: accent },
              { offset: 1, color: `${accent}33` },
            ],
          },
        },
      },
    ],
  };
}

const MARKET_UP = "#22c55e";
const MARKET_DOWN = "#ef4444";

function tradingSessionData(
  domainId: string,
  bars: number,
): { labels: string[]; ohlc: number[][]; volume: number[] } {
  const rng = pseudoRng(hashStr(domainId) ^ 0x5ca1ab1e);
  const labels: string[] = [];
  const ohlc: number[][] = [];
  const volume: number[] = [];
  let last = domainId === "economy" ? 102.5 : 148.2 + rng() * 8;
  const now = Date.now();
  for (let i = bars - 1; i >= 0; i--) {
    const d = new Date(now - i * 3_600_000);
    labels.push(
      `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:00`,
    );
    const o = last;
    const c = o + (rng() - 0.48) * (domainId === "economy" ? 0.85 : 2.4);
    const low = Math.min(o, c) - rng() * 1.2;
    const high = Math.max(o, c) + rng() * 1.4;
    ohlc.push([
      +o.toFixed(2),
      +c.toFixed(2),
      +low.toFixed(2),
      +high.toFixed(2),
    ]);
    volume.push(Math.floor(4_000 + rng() * 48_000 + Math.abs(c - o) * 8_000));
    last = c;
  }
  return { labels, ohlc, volume };
}

/** Classic OHLC + volume panel (Bloomberg / TradingView style layout). */
export function financeTradingChart(domainId: string, _accent: string): EChartsOption {
  const { labels, ohlc, volume } = tradingSessionData(domainId, 48);
  return {
    backgroundColor: "transparent",
    animation: false,
    axisPointer: { link: [{ xAxisIndex: [0, 1] }] },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    grid: [
      { left: 52, right: 16, top: 24, height: "58%" },
      { left: 52, right: 16, top: "72%", height: "18%" },
    ],
    xAxis: [
      {
        type: "category",
        data: labels,
        boundaryGap: true,
        axisLine: { lineStyle: { color: chartGridLine() } },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      {
        type: "category",
        gridIndex: 1,
        data: labels,
        boundaryGap: true,
        axisLine: { lineStyle: { color: chartGridLine() } },
        axisLabel: { color: chartTextMuted(), fontSize: 8, rotate: 35 },
      },
    ],
    yAxis: [
      {
        scale: true,
        splitLine: { lineStyle: { color: chartGridLine() } },
        axisLabel: { color: chartTextMuted(), fontSize: 10 },
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { color: chartTextMuted(), fontSize: 9 },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      { type: "inside", xAxisIndex: [0, 1], start: 55, end: 100 },
      { type: "slider", xAxisIndex: [0, 1], bottom: 4, height: 18 },
    ],
    series: [
      {
        name: "Price",
        type: "candlestick",
        data: ohlc,
        itemStyle: {
          color: MARKET_UP,
          color0: MARKET_DOWN,
          borderColor: MARKET_UP,
          borderColor0: MARKET_DOWN,
        },
      },
      {
        name: "Volume",
        type: "bar",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volume.map((v, i) => ({
          value: v,
          itemStyle: {
            color:
              ohlc[i]![1] >= ohlc[i]![0]
                ? "rgba(34, 197, 94, 0.45)"
                : "rgba(239, 68, 68, 0.45)",
          },
        })),
      },
    ],
  };
}

/** Intraday index / spread line with moving average. */
export function financeIndexLine(domainId: string, accent: string): EChartsOption {
  const rng = pseudoRng(hashStr(domainId) ^ 0x901e5);
  const n = 64;
  const labels: string[] = [];
  const close: number[] = [];
  let v = 100;
  for (let i = 0; i < n; i++) {
    labels.push(`${i}`);
    v += (rng() - 0.48) * 1.1;
    close.push(+v.toFixed(2));
  }
  const ma = close.map((_, i) => {
    const slice = close.slice(Math.max(0, i - 7), i + 1);
    return +(slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2);
  });
  return {
    backgroundColor: "transparent",
    animation: false,
    tooltip: { trigger: "axis" },
    grid: { left: 48, right: 12, top: 22, bottom: 32 },
    xAxis: {
      type: "category",
      data: labels,
      boundaryGap: false,
      axisLabel: { show: false },
      axisLine: { lineStyle: { color: chartGridLine() } },
    },
    yAxis: {
      scale: true,
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    series: [
      {
        name: "Index",
        type: "line",
        data: close,
        showSymbol: false,
        lineStyle: { width: 1.5, color: accent },
      },
      {
        name: "MA(8)",
        type: "line",
        data: ma,
        showSymbol: false,
        lineStyle: { width: 1, type: "dashed", color: "#94a3b8" },
      },
    ],
  };
}

export function cyberKillChainBar(domainId: string, accent: string): EChartsOption {
  const rng = pseudoRng(hashStr(domainId) ^ 0xc0ffee);
  const stages = [
    "Recon",
    "Weapon",
    "Delivery",
    "Exploit",
    "C2",
    "Actions",
  ];
  const data = stages.map(() => Math.floor(rng() * 100));
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    grid: { left: 72, right: 16, top: 12, bottom: 12 },
    xAxis: {
      type: "value",
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    yAxis: {
      type: "category",
      data: stages,
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
      axisLine: { lineStyle: { color: chartGridLine() } },
    },
    series: [
      {
        type: "bar",
        data,
        itemStyle: { color: accent },
      },
    ],
  };
}

export function healthRadar(domainId: string, accent: string): EChartsOption {
  const rng = pseudoRng(hashStr(domainId) ^ 0xfa11);
  const axes = [
    "Surge cap.",
    "Staffing",
    "PPE / kit",
    "Lab TAT",
    "Bed pressure",
  ];
  const vals = axes.map(() => Math.floor(40 + rng() * 55));
  return {
    backgroundColor: "transparent",
    tooltip: {},
    radar: {
      indicator: axes.map((n) => ({ name: n, max: 100 })),
      splitLine: { lineStyle: { color: chartGridLine() } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: chartGridLine() } },
      axisName: { color: chartTextMuted(), fontSize: 10 },
    },
    series: [
      {
        type: "radar",
        data: [{ value: vals, name: "Posture", areaStyle: { opacity: 0.14 }, lineStyle: { color: accent } }],
      },
    ],
  };
}

export function spaceGauge(domainId: string, accent: string): EChartsOption {
  const rng = pseudoRng(hashStr(domainId) ^ 0x50ace);
  const v = Math.round(55 + rng() * 40);
  return {
    backgroundColor: "transparent",
    series: [
      {
        type: "gauge",
        min: 0,
        max: 100,
        splitNumber: 5,
        axisLine: {
          lineStyle: {
            width: 10,
            color: [
              [0.35, "#334155"],
              [0.65, "#64748b"],
              [1, accent],
            ],
          },
        },
        pointer: { itemStyle: { color: accent } },
        title: { offsetCenter: [0, "72%"], color: chartTextMuted(), fontSize: 11 },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, "42%"],
          fontSize: 22,
          color: chartTextMain(),
          formatter: "{value}%",
        },
        data: [{ value: v, name: "Conjunction readiness (synthetic)" }],
      },
    ],
  };
}

export function spaceScatter(domainId: string, accent: string): EChartsOption {
  const rng = pseudoRng(hashStr(domainId) ^ 0x0deb);
  const pts: [number, number][] = [];
  for (let i = 0; i < 42; i++) {
    pts.push([
      i + (rng() - 0.5) * 0.6,
      400 + rng() * 600 + Math.sin(i * 0.35) * 80,
    ]);
  }
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    grid: { left: 44, right: 12, top: 22, bottom: 32 },
    xAxis: {
      type: "value",
      name: "Orbit phase (arb.)",
      nameTextStyle: { color: chartTextMuted(), fontSize: 10 },
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    yAxis: {
      type: "value",
      name: "Alt. km (mock)",
      nameTextStyle: { color: chartTextMuted(), fontSize: 10 },
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    series: [
      {
        type: "scatter",
        symbolSize: (d: number[]) => 4 + (d[1] % 7),
        itemStyle: { color: accent, opacity: 0.75 },
        data: pts,
      },
    ],
  };
}

export function demographicsPyramid(domainId: string, accent: string): EChartsOption {
  const rng = pseudoRng(hashStr(domainId) ^ 0xde11);
  const bands = ["0–14", "15–29", "30–44", "45–59", "60+"];
  const m = bands.map(() => Math.floor(6 + rng() * 22));
  const f = bands.map(() => Math.floor(6 + rng() * 22));
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: { textStyle: { color: chartTextMuted() }, top: 0 },
    grid: { left: 48, right: 12, top: 28, bottom: 28 },
    xAxis: {
      type: "value",
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    yAxis: {
      type: "category",
      data: bands,
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    series: [
      { name: "Cohort A", type: "bar", stack: "t", data: m, itemStyle: { color: accent } },
      { name: "Cohort B", type: "bar", stack: "t", data: f, itemStyle: { color: `${accent}88` } },
    ],
  };
}

type GeoRegion = "AMER" | "EMEA" | "APAC" | "MENA" | "POLAR";

function regionBand(lat: number, lon: number): GeoRegion {
  if (lat > 66.5 || lat < -66.5) return "POLAR";
  if (lat >= 10 && lon >= -30 && lon < 60) return "MENA";
  if (lon >= -130 && lon < -30) return "AMER";
  if (lon >= -30 && lon < 60) return "EMEA";
  return "APAC";
}

/** Event counts by coarse region × severity band (geotagged events only). */
export function geopoliticalRegionBars(events: readonly UiEvent[], accent: string): EChartsOption {
  const regions: readonly GeoRegion[] = ["AMER", "EMEA", "APAC", "MENA", "POLAR"];
  const low = new Map(regions.map((r) => [r, 0]));
  const med = new Map(regions.map((r) => [r, 0]));
  const hi = new Map(regions.map((r) => [r, 0]));
  let untagged = 0;

  for (const e of events) {
    if (!e.location) {
      untagged += 1;
      continue;
    }
    const band = regionBand(e.location.lat, e.location.lon);
    const bucket =
      e.severity_score >= 0.67 ? hi : e.severity_score >= 0.34 ? med : low;
    bucket.set(band, (bucket.get(band) ?? 0) + 1);
  }

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: { textStyle: { color: chartTextMuted() }, top: 0 },
    grid: { left: 44, right: 12, top: 32, bottom: untagged > 0 ? 40 : 28 },
    xAxis: {
      type: "category",
      data: [...regions],
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    series: [
      {
        name: "Low",
        type: "bar",
        stack: "a",
        data: regions.map((r) => low.get(r) ?? 0),
        itemStyle: { color: `${accent}44` },
      },
      {
        name: "Medium",
        type: "bar",
        stack: "a",
        data: regions.map((r) => med.get(r) ?? 0),
        itemStyle: { color: `${accent}aa` },
      },
      {
        name: "High",
        type: "bar",
        stack: "a",
        data: regions.map((r) => hi.get(r) ?? 0),
        itemStyle: { color: accent },
      },
    ],
    graphic: untagged > 0
      ? [
          {
            type: "text",
            left: "center",
            bottom: 4,
            style: {
              text: `${untagged} events without coordinates (not shown)`,
              fill: chartTextMuted(),
              fontSize: 10,
            },
          },
        ]
      : undefined,
  };
}

/** Extra panel using additional registered series types (funnel, sankey, …). */
export function deskTertiarySunburstUtc(events: readonly UiEvent[], accent: string): EChartsOption {
  const bands = [
    { name: "Night", h0: 0, h1: 5 },
    { name: "Morning", h0: 6, h1: 11 },
    { name: "Midday", h0: 12, h1: 17 },
    { name: "Evening", h0: 18, h1: 23 },
  ] as const;
  const children = bands.map((b) => {
    const ev = events.filter((e) => {
      const t = Date.parse(e.timestamp);
      if (!Number.isFinite(t)) return false;
      const h = new Date(t).getUTCHours();
      return h >= b.h0 && h <= b.h1;
    });
    const low = ev.filter((e) => e.severity_score < 0.34).length;
    const med = ev.filter((e) => e.severity_score >= 0.34 && e.severity_score < 0.67).length;
    const hi = ev.filter((e) => e.severity_score >= 0.67).length;
    return {
      name: b.name,
      itemStyle: { color: accent },
      children: [
        { name: "Low", value: Math.max(low, 1) },
        { name: "Med", value: Math.max(med, 1) },
        { name: "High", value: Math.max(hi, 1) },
      ],
    };
  });
  return {
    backgroundColor: "transparent",
    textStyle: { color: chartTextMuted() },
    series: [
      {
        type: "sunburst",
        radius: [0, "92%"],
        data: [{ name: "UTC dayparts", children }],
        itemStyle: { borderRadius: 2, borderWidth: 1, borderColor: "#09090b" },
        label: { minAngle: 5, color: "#fafafa", fontSize: 10 },
      },
    ],
  };
}

export function deskTertiaryFunnelPipeline(events: readonly UiEvent[]): EChartsOption {
  const all = Math.max(events.length, 1);
  const t = events.filter((e) => e.severity_score >= 0.2).length;
  const e = events.filter((x) => x.severity_score >= 0.45).length;
  const w = events.filter((x) => x.severity_score >= 0.7).length;
  return {
    backgroundColor: "transparent",
    textStyle: { color: chartTextMuted() },
    series: [
      {
        type: "funnel",
        left: "8%",
        top: 18,
        bottom: 8,
        width: "84%",
        min: 0,
        max: all,
        sort: "descending",
        gap: 3,
        label: { color: "#0b0b0f", fontSize: 10 },
        data: [
          { value: all, name: "Observed" },
          { value: Math.max(t, 1), name: "Elevated" },
          { value: Math.max(e, 1), name: "Escalated" },
          { value: Math.max(w, 1), name: "Critical" },
        ],
      },
    ],
  };
}

export function deskTertiarySankeyStages(events: readonly UiEvent[], accent: string): EChartsOption {
  const nodes = [
    { name: "Ingress" },
    { name: "Correlate" },
    { name: "Contain" },
    { name: "Recover" },
  ];
  const n = Math.max(events.length, 1);
  const v1 = Math.ceil(n * 0.85);
  const v2 = Math.ceil(n * 0.55);
  const v3 = Math.ceil(n * 0.35);
  const links = [
    { source: "Ingress", target: "Correlate", value: v1 },
    { source: "Correlate", target: "Contain", value: v2 },
    { source: "Contain", target: "Recover", value: v3 },
  ];
  return {
    backgroundColor: "transparent",
    textStyle: { color: chartTextMuted() },
    series: [
      {
        type: "sankey",
        emphasis: { focus: "adjacency" },
        data: nodes,
        links,
        lineStyle: { color: "gradient", curveness: 0.35, opacity: 0.4 },
        label: { color: chartTextMuted(), fontSize: 10 },
        itemStyle: { color: accent },
      },
    ],
  };
}

export function deskTertiaryHeatmapWeekHour(
  events: readonly UiEvent[],
  accent: string,
): EChartsOption {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hours = Array.from({ length: 24 }, (_, h) => `${h}`);
  const m: number[][] = days.map(() => new Array(24).fill(0));
  for (const e of events) {
    const t = Date.parse(e.timestamp);
    if (!Number.isFinite(t)) continue;
    const d = new Date(t).getUTCDay();
    const h = new Date(t).getUTCHours();
    m[d]![h] += 1;
  }
  const data: [number, number, number][] = [];
  for (let r = 0; r < 7; r += 1) {
    for (let c = 0; c < 24; c += 1) {
      data.push([c, r, m[r]![c]!]);
    }
  }
  const maxV = Math.max(1, ...data.map((x) => x[2]));
  return {
    backgroundColor: "transparent",
    textStyle: { color: chartTextMuted() },
    tooltip: { trigger: "item" },
    grid: { left: 40, right: 8, top: 8, bottom: 24 },
    xAxis: {
      type: "category",
      data: hours,
      axisLabel: { color: chartTextMuted(), fontSize: 8, interval: 3 },
      splitArea: { show: true },
    },
    yAxis: {
      type: "category",
      data: days,
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    visualMap: {
      min: 0,
      max: maxV,
      orient: "horizontal",
      left: "center",
      bottom: 2,
      itemWidth: 12,
      itemHeight: 80,
      inRange: { color: ["#0f172a", accent] },
      textStyle: { color: chartTextMuted(), fontSize: 9 },
    },
    series: [{ type: "heatmap", data }],
  };
}

export function deskTertiaryThemeRiverOrdinal(
  domainId: string,
  events: readonly UiEvent[],
  accent: string,
): EChartsOption {
  const rng = pseudoRng(hashStr(domainId) ^ 0x711ee);
  const lanes = ["Ops", "Link", "Power", "Thermal"] as const;
  const slots = 12;
  const labels = Array.from({ length: slots }, (_, i) => `S${i + 1}`);
  const data: [string, number, string][] = [];
  const base = Math.max(1, Math.floor(events.length / (slots * lanes.length)));
  for (let s = 0; s < slots; s += 1) {
    for (const L of lanes) {
      const jitter = rng() * base * 0.4;
      data.push([labels[s]!, base + jitter, L]);
    }
  }
  return {
    backgroundColor: "transparent",
    textStyle: { color: chartTextMuted() },
    color: [accent, "#94a3b8", "#22d3ee", "#f97316"],
    singleAxis: {
      top: 36,
      bottom: 24,
      type: "category",
      data: labels,
      axisLabel: { color: chartTextMuted(), fontSize: 9 },
    },
    series: [{ type: "themeRiver", data }],
  };
}

export function deskTertiaryTreemapSeverity(events: readonly UiEvent[], accent: string): EChartsOption {
  const low = events.filter((e) => e.severity_score < 0.34).length;
  const med = events.filter((e) => e.severity_score >= 0.34 && e.severity_score < 0.67).length;
  const hi = events.filter((e) => e.severity_score >= 0.67).length;
  const data = [
    { name: "Low", value: Math.max(low, 1), itemStyle: { color: `${accent}55` } },
    { name: "Medium", value: Math.max(med, 1), itemStyle: { color: `${accent}aa` } },
    { name: "High", value: Math.max(hi, 1), itemStyle: { color: accent } },
  ];
  return {
    backgroundColor: "transparent",
    textStyle: { color: chartTextMuted() },
    series: [
      {
        type: "treemap",
        roam: false,
        breadcrumb: { show: false },
        data,
        label: { fontSize: 11, color: "#fafafa" },
        itemStyle: {
          borderColor: chartItemBorder(),
          borderWidth: 1,
          gapWidth: 2,
        },
      },
    ],
  };
}

export function deskTertiaryParallelSignals(events: readonly UiEvent[]): EChartsOption {
  const sample = events.slice(0, 36);
  let rows = sample.map((e) => {
    const t = Date.parse(e.timestamp);
    const h = Number.isFinite(t) ? new Date(t).getUTCHours() : 0;
    const lat = e.location?.lat ?? 0;
    const lon = e.location?.lon ?? 0;
    return [h, Math.round(e.severity_score * 100), Math.round(lat + 90), Math.round(lon + 180)] as number[];
  });
  if (rows.length === 0) rows.push([12, 40, 45, 120]);
  return {
    backgroundColor: "transparent",
    textStyle: { color: chartTextMuted() },
    parallelAxis: [
      { dim: 0, name: "Hour (UTC)", min: 0, max: 23 },
      { dim: 1, name: "Severity ×100", min: 0, max: 100 },
      { dim: 2, name: "Lat +90", min: 0, max: 180 },
      { dim: 3, name: "Lon +180", min: 0, max: 360 },
    ],
    series: [
      {
        type: "parallel",
        lineStyle: { width: 1.5, opacity: 0.7, color: "#a78bfa" },
        data: rows,
      },
    ],
  };
}

function sevBand(score: number): "low" | "med" | "hi" {
  if (score < 0.34) return "low";
  if (score < 0.67) return "med";
  return "hi";
}

/** Stacked bars: UTC hour × severity band (live buffer). */
export function domainStackedHourSeverity(
  events: readonly UiEvent[],
  accent: string,
): EChartsOption {
  const low = new Array(24).fill(0);
  const med = new Array(24).fill(0);
  const hi = new Array(24).fill(0);
  for (const e of events) {
    const t = Date.parse(e.timestamp);
    if (!Number.isFinite(t)) continue;
    const h = new Date(t).getUTCHours();
    const b = sevBand(e.severity_score);
    if (b === "low") low[h] += 1;
    else if (b === "med") med[h] += 1;
    else hi[h] += 1;
  }
  const labels = Array.from({ length: 24 }, (_, h) => `${h}h`);
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: { textStyle: { color: chartTextMuted() }, top: 0 },
    grid: { left: 40, right: 8, top: 28, bottom: 36 },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { color: chartTextMuted(), fontSize: 8, rotate: 45 },
      axisLine: { lineStyle: { color: chartGridLine() } },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    series: [
      {
        name: "Low",
        type: "bar",
        stack: "h",
        data: low,
        itemStyle: { color: `${accent}44` },
      },
      {
        name: "Med",
        type: "bar",
        stack: "h",
        data: med,
        itemStyle: { color: `${accent}aa` },
      },
      {
        name: "High",
        type: "bar",
        stack: "h",
        data: hi,
        itemStyle: { color: accent },
      },
    ],
  };
}

/** Donut: share by feed `feedSource` or severity quartile. */
export function domainDonutFeedOrSeverity(
  events: readonly UiEvent[],
  accent: string,
): EChartsOption {
  const byFeed = new Map<string, number>();
  for (const e of events) {
    const k = e.feedSource?.trim() || "Unknown source";
    byFeed.set(k, (byFeed.get(k) ?? 0) + 1);
  }
  let data = [...byFeed.entries()].map(([name, value], i) => ({
    name: name.length > 24 ? `${name.slice(0, 22)}…` : name,
    value,
    itemStyle: {
      color: [accent, "#94a3b8", "#64748b", "#22d3ee", "#a78bfa"][i % 5],
    },
  }));
  if (data.length === 0) {
    data = [
      { name: "Low", value: 1, itemStyle: { color: `${accent}55` } },
      { name: "Med", value: 1, itemStyle: { color: `${accent}aa` } },
      { name: "High", value: 1, itemStyle: { color: accent } },
    ];
  }
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    series: [
      {
        type: "pie",
        radius: ["42%", "72%"],
        avoidLabelOverlap: true,
        label: { color: chartTextMuted(), fontSize: 9 },
        data,
      },
    ],
  };
}

/** Histogram: severity density in the buffer (10 bins). */
export function domainHistogramSeverity(
  events: readonly UiEvent[],
  accent: string,
): EChartsOption {
  const bins = new Array(10).fill(0);
  for (const e of events) {
    const slot = Math.min(9, Math.floor(e.severity_score * 10));
    bins[slot] += 1;
  }
  const labels = bins.map((_, i) => `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`);
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    grid: { left: 40, right: 8, top: 22, bottom: 40 },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { color: chartTextMuted(), fontSize: 8, rotate: 35 },
      axisLine: { lineStyle: { color: chartGridLine() } },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    series: [
      {
        type: "bar",
        data: bins,
        barCategoryGap: 0,
        itemStyle: { color: accent },
      },
    ],
  };
}

/** Sparkline from event severities when domain ring history is empty. */
export function eventSeveritySparkline(
  events: readonly UiEvent[],
  accent: string,
): EChartsOption {
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  const pts = sorted.slice(-40).map((e) => e.severity_score);
  if (pts.length === 0) {
    return rollingStressLine([0.15, 0.12, 0.18, 0.11], accent);
  }
  return rollingStressLine(pts, accent);
}

/** Scatter + ripples on lon/lat; requires locations in buffer. */
export function domainScatterEffectGeo(
  events: readonly UiEvent[],
  accent: string,
): EChartsOption {
  const geo = events.filter((e) => e.location !== null);
  const scatterData = geo.map((e) => [
    e.location!.lon,
    e.location!.lat,
    Math.round(e.severity_score * 100),
  ]);
  const top = [...geo]
    .sort((a, b) => b.severity_score - a.severity_score)
    .slice(0, 4);
  const fxData = top.map((e) => [
    e.location!.lon,
    e.location!.lat,
    Math.round(e.severity_score * 100),
  ]);
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    xAxis: {
      type: "value",
      name: "Lon",
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 9 },
    },
    yAxis: {
      type: "value",
      name: "Lat",
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 9 },
    },
    series: [
      {
        type: "scatter",
        symbolSize: (val: unknown) => {
          const d = val as number[];
          return 6 + (d[2] ?? 0) / 25;
        },
        itemStyle: { color: `${accent}99` },
        data: scatterData.length > 0 ? scatterData : [[0, 0, 0]],
      },
      {
        type: "effectScatter",
        rippleEffect: { brushType: "stroke", scale: 2.5 },
        symbolSize: (val: unknown) => {
          const d = val as number[];
          return 12 + (d[2] ?? 0) / 20;
        },
        itemStyle: { color: accent },
        data: fxData.length > 0 ? fxData : [],
      },
    ],
  };
}

/** Force layout graph: events as nodes, causal edges as links (buffer). */
export function domainForceGraphFromCausal(
  events: readonly UiEvent[],
  edges: readonly UiCausalEdge[],
  accent: string,
): EChartsOption {
  const slice = events.slice(0, 48);
  if (slice.length === 0) {
    return {
      backgroundColor: "transparent",
      title: {
        text: "No events in buffer — graph needs domain events",
        left: "center",
        top: "middle",
        textStyle: { color: chartTextMuted(), fontSize: 11 },
      },
      series: [],
    };
  }
  const idSet = new Set(slice.map((e) => e.id));
  const nodes = slice.map((e) => ({
    id: e.id,
    name: `#${e.ordinal}`,
    symbolSize: 8 + e.severity_score * 22,
    category: 0,
  }));
  const links = edges
    .filter(
      (ed) =>
        idSet.has(ed.source_event_id) && idSet.has(ed.target_event_id),
    )
    .slice(0, 64)
    .map((ed) => ({
      source: ed.source_event_id,
      target: ed.target_event_id,
      lineStyle: {
        width: 1 + ed.influence_score * 3,
        opacity: 0.45 + ed.influence_score * 0.35,
      },
    }));
  return {
    backgroundColor: "transparent",
    tooltip: {},
    series: [
      {
        type: "graph",
        layout: "force",
        roam: true,
        draggable: true,
        categories: [{ name: "event" }],
        label: { show: nodes.length < 28, fontSize: 8, color: chartTextMuted() },
        force: {
          repulsion: nodes.length > 20 ? 120 : 80,
          edgeLength: [60, 140],
        },
        lineStyle: { color: "rgba(148,163,184,0.55)" },
        emphasis: { focus: "adjacency" },
        data: nodes,
        links,
        itemStyle: { color: accent },
      },
    ],
  };
}

/** Nightingale rose: severity band mix. */
export function domainNightingaleRose(
  events: readonly UiEvent[],
  accent: string,
): EChartsOption {
  let low = 0;
  let med = 0;
  let hi = 0;
  for (const e of events) {
    const b = sevBand(e.severity_score);
    if (b === "low") low += 1;
    else if (b === "med") med += 1;
    else hi += 1;
  }
  const palette = [`${accent}66`, `${accent}bb`, accent];
  const data = [
    { name: "Low", value: Math.max(low, 1), itemStyle: { color: palette[0] } },
    { name: "Med", value: Math.max(med, 1), itemStyle: { color: palette[1] } },
    { name: "High", value: Math.max(hi, 1), itemStyle: { color: palette[2] } },
  ];
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    series: [
      {
        type: "pie",
        radius: [16, 96],
        roseType: "area",
        label: { color: chartTextMuted(), fontSize: 9 },
        data,
      },
    ],
  };
}

/** Tree: severity hierarchy weighted by counts (live buffer). */
export function domainTreeSeverity(events: readonly UiEvent[], accent: string): EChartsOption {
  let low = 0;
  let med = 0;
  let hi = 0;
  for (const e of events) {
    const b = sevBand(e.severity_score);
    if (b === "low") low += 1;
    else if (b === "med") med += 1;
    else hi += 1;
  }
  const root = {
    name: "Infrastructure signals",
    itemStyle: { color: accent },
    children: [
      { name: "Elevated", value: Math.max(hi, 1), itemStyle: { color: accent } },
      {
        name: "Watch",
        value: Math.max(med, 1),
        children: [{ name: "Med", value: Math.max(med, 1) }],
      },
      { name: "Nominal", value: Math.max(low, 1), itemStyle: { color: `${accent}66` } },
    ],
  };
  return {
    backgroundColor: "transparent",
    textStyle: { color: chartTextMuted() },
    series: [
      {
        type: "tree",
        data: [root],
        top: 12,
        bottom: 12,
        left: 12,
        right: 12,
        symbol: "circle",
        symbolSize: 7,
        orient: "TB",
        expandAndCollapse: true,
        label: { fontSize: 10, color: chartTextMain() },
        lineStyle: { color: "rgba(148,163,184,0.45)" },
      },
    ],
  };
}

/** Radar with axes scaled from live buffer size / severity (not purely synthetic). */
export function healthRadarFromEvents(
  events: readonly UiEvent[],
  accent: string,
): EChartsOption {
  const n = events.length;
  const avgSev = n
    ? events.reduce((a, e) => a + e.severity_score, 0) / n
    : 0;
  const hi = events.filter((e) => e.severity_score >= 0.67).length;
  const med = events.filter(
    (e) => e.severity_score >= 0.34 && e.severity_score < 0.67,
  ).length;
  const withLoc = events.filter((e) => e.location !== null).length;
  const axes = [
    "Volume",
    "Avg sev.×100",
    "High sev. ct.",
    "Med sev. ct.",
    "Geo tags",
  ];
  const vals = [
    Math.min(100, n * 3),
    Math.min(100, avgSev * 100),
    Math.min(100, hi * 8),
    Math.min(100, med * 5),
    Math.min(100, withLoc * 4),
  ];
  return {
    backgroundColor: "transparent",
    tooltip: {},
    radar: {
      indicator: axes.map((name) => ({ name, max: 100 })),
      splitLine: { lineStyle: { color: chartGridLine() } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: chartGridLine() } },
      axisName: { color: chartTextMuted(), fontSize: 10 },
    },
    series: [
      {
        type: "radar",
        data: [
          {
            value: vals,
            name: "Buffer posture",
            areaStyle: { opacity: 0.14 },
            lineStyle: { color: accent },
          },
        ],
      },
    ],
  };
}

/** Gauge: world-state risk index (×100). */
export function domainGaugeRiskIndex(
  state: UiWorldState | undefined,
  accent: string,
): EChartsOption {
  const hasSignal = state && state.event_count > 0;
  const v = hasSignal ? Math.round(Math.min(100, state!.risk_index * 100)) : 4;
  return {
    backgroundColor: "transparent",
    textStyle: { color: chartTextMuted() },
    series: [
      {
        type: "gauge",
        min: 0,
        max: 100,
        splitNumber: 10,
        axisLine: {
          lineStyle: {
            width: 12,
            color: [
              [0.35, `${accent}55`],
              [0.7, `${accent}aa`],
              [1, accent],
            ],
          },
        },
        pointer: { itemStyle: { color: chartTextMain() } },
        detail: { fontSize: 12, color: chartTextMain() },
        data: [{ value: v, name: hasSignal ? "Risk ×100" : "Idle" }],
      },
    ],
  };
}

/** Boxplot: severity spread in buffer (five-number summary). */
export function domainSeverityBoxplot(
  events: readonly UiEvent[],
  accent: string,
): EChartsOption {
  const s = events.map((e) => e.severity_score).sort((a, b) => a - b);
  let box: number[];
  if (s.length === 0) {
    box = [0, 0.2, 0.4, 0.6, 0.8];
  } else if (s.length === 1) {
    const x = s[0]!;
    box = [x, x, x, x, x];
  } else {
    const q = (p: number) =>
      s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]!;
    box = [s[0]!, q(0.25), q(0.5), q(0.75), s[s.length - 1]!];
  }
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    grid: { left: 48, right: 12, top: 28, bottom: 36 },
    xAxis: {
      type: "category",
      data: ["Buffer"],
      axisLabel: { color: chartTextMuted() },
      axisLine: { lineStyle: { color: chartGridLine() } },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 1,
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 10 },
    },
    series: [
      {
        type: "boxplot",
        data: [box],
        itemStyle: { color: `${accent}77`, borderColor: accent },
      },
    ],
  };
}

/** Pictorial bars: UTC hour arrivals as repeating symbols. */
export function domainPictorialHourArrivals(
  events: readonly UiEvent[],
  accent: string,
  eventHourBuckets?: Record<string, UiEventHourBucket>,
  domainId?: string,
): EChartsOption {
  const data = hourBuckets(events, eventHourBuckets, domainId);
  const max = Math.max(1, ...data);
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    grid: { left: 38, right: 8, top: 22, bottom: 36 },
    xAxis: {
      type: "category",
      data: data.map((_, h) => `${h}h`),
      axisLabel: { color: chartTextMuted(), fontSize: 8, rotate: 45 },
      axisLine: { lineStyle: { color: chartGridLine() } },
    },
    yAxis: {
      type: "value",
      max: max + 1,
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 9 },
    },
    series: [
      {
        type: "pictorialBar",
        symbol: "roundRect",
        symbolRepeat: true,
        symbolSize: [10, 5],
        symbolMargin: "10%",
        data,
        itemStyle: { color: accent },
      },
    ],
  };
}

/** Scatter: arrival ordinal vs severity (buffer tail). */
export function domainScatterOrdinalSeverity(
  events: readonly UiEvent[],
  accent: string,
): EChartsOption {
  const pts = events.slice(-80).map((e) => [e.ordinal % 500, e.severity_score]);
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    grid: { left: 44, right: 12, top: 24, bottom: 32 },
    xAxis: {
      type: "value",
      name: "Ordinal (mod)",
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 9 },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 1,
      name: "Severity",
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 9 },
    },
    series: [
      {
        type: "scatter",
        symbolSize: 7,
        itemStyle: { color: `${accent}cc` },
        data: pts.length > 0 ? pts : [[0, 0.35]],
      },
    ],
  };
}

/** Polyline path (lines series): running mean severity along buffer timeline. */
export function domainLinesCumulativePath(
  events: readonly UiEvent[],
  accent: string,
): EChartsOption {
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  const slice = sorted.slice(-36);
  let cum = 0;
  const coords: [number, number][] = [];
  slice.forEach((e, i) => {
    cum += e.severity_score;
    coords.push([i, cum / (i + 1)]);
  });
  if (coords.length === 0) {
    coords.push([0, 0.4], [1, 0.45], [2, 0.42]);
  }
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    grid: { left: 44, right: 12, top: 24, bottom: 28 },
    xAxis: {
      type: "value",
      min: 0,
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 9 },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 1,
      splitLine: { lineStyle: { color: chartGridLine() } },
      axisLabel: { color: chartTextMuted(), fontSize: 9 },
    },
    series: [
      {
        type: "lines",
        coordinateSystem: "cartesian2d",
        polyline: true,
        lineStyle: { color: accent, width: 2, opacity: 0.9 },
        data: [{ coords }],
      },
    ],
  };
}

export type DomainPrimaryTag =
  | "stacked_hour"
  | "donut"
  | "histogram"
  | "stress_line"
  | "parallel"
  | "radar_live"
  | "scatter_fx"
  | "candle"
  | "region_stack"
  | "graph"
  | "sunburst"
  | "rose"
  | "tree"
  | "heatmap_primary";

/** One tile in the domain desk chart grid (may be any registered ECharts series). */
export interface DeskChartPanel {
  readonly title: string;
  readonly option: EChartsOption;
}

interface DeskPackParams {
  domainId: string;
  accent: string;
  events: readonly UiEvent[];
  eventHourBuckets?: Record<string, UiEventHourBucket>;
  severityHistory: readonly number[];
  causalEdges: readonly UiCausalEdge[];
  state?: UiWorldState;
  dataMode?: DataMode;
}

export function buildDomainPrimary(
  domainId: string,
  p: DeskPackParams,
): { title: string; option: EChartsOption; tag: DomainPrimaryTag } {
  const { accent, events, severityHistory, causalEdges } = p;
  switch (domainId) {
    case "energy":
      return {
        title: "Stacked load · UTC hour × severity band (buffer)",
        option: domainStackedHourSeverity(events, accent),
        tag: "stacked_hour",
      };
    case "finance":
      return {
        title: "Source mix · donut (feed labels when present)",
        option: domainDonutFeedOrSeverity(events, accent),
        tag: "donut",
      };
    case "climate":
      return {
        title: "Severity histogram · buffer",
        option: domainHistogramSeverity(events, accent),
        tag: "histogram",
      };
    case "seismic":
      return {
        title: "Ring stress · line + area (domain history)",
        option:
          severityHistory.length > 0
            ? rollingStressLine(severityHistory, accent)
            : eventSeveritySparkline(events, accent),
        tag: "stress_line",
      };
    case "transport":
      return {
        title: "Parallel coordinates · time, severity, geo (buffer)",
        option: deskTertiaryParallelSignals(events),
        tag: "parallel",
      };
    case "health":
      return {
        title: "Capacity / load radar · from buffer stats",
        option: healthRadarFromEvents(events, accent),
        tag: "radar_live",
      };
    case "geospatial":
      return {
        title: "Scatter + effect · lon/lat (buffer)",
        option: domainScatterEffectGeo(events, accent),
        tag: "scatter_fx",
      };
    case "economy":
      return {
        title: "Macro-style OHLC · synthetic tape (finance desk)",
        option: financeTradingChart("economy", accent),
        tag: "candle",
      };
    case "geopolitics":
      return {
        title: "Regional stack · geotagged severity bands",
        option: geopoliticalRegionBars(events, accent),
        tag: "region_stack",
      };
    case "cyber":
      return {
        title: "Force graph · causal edges in buffer",
        option: domainForceGraphFromCausal(events, causalEdges, accent),
        tag: "graph",
      };
    case "space":
      return {
        title: "UTC dayparts × severity · sunburst",
        option: deskTertiarySunburstUtc(events, accent),
        tag: "sunburst",
      };
    case "demographics":
      return {
        title: "Severity mix · Nightingale rose",
        option: domainNightingaleRose(events, accent),
        tag: "rose",
      };
    case "infrastructure":
      return {
        title: "Severity tree · hierarchical mix",
        option: domainTreeSeverity(events, accent),
        tag: "tree",
      };
    default:
      return {
        title: "Week × hour activity · buffer",
        option: deskTertiaryHeatmapWeekHour(events, accent),
        tag: "heatmap_primary",
      };
  }
}

function rollOrSpark(
  severityHistory: readonly number[],
  events: readonly UiEvent[],
  accent: string,
): EChartsOption {
  return severityHistory.length > 0
    ? rollingStressLine(severityHistory, accent)
    : eventSeveritySparkline(events, accent);
}

/**
 * Four additional panels per domain (primary + these = five tiles).
 * Each domain uses a distinct mix of ECharts series so the catalog rotates through
 * bar/line/pie variants, gauge, map-like heatmaps, graph/sankey/funnel/treemap,
 * boxplot, pictorialBar, themeRiver, scatter/lines, etc.
 */
function buildAdditionalPanels(
  domainId: string,
  p: DeskPackParams,
): DeskChartPanel[] {
  const { accent, events, eventHourBuckets, severityHistory } = p;
  const heat = () => deskTertiaryHeatmapWeekHour(events, accent);
  const hour = () => hourOfDayBars(events, accent, eventHourBuckets, domainId);
  const sankey = () => deskTertiarySankeyStages(events, accent);
  const roll = () => rollOrSpark(severityHistory, events, accent);
  const gauge = () => domainGaugeRiskIndex(p.state, accent);
  const funnel = () => deskTertiaryFunnelPipeline(events);
  const treemap = () => deskTertiaryTreemapSeverity(events, accent);

  switch (domainId) {
    case "energy":
      return [
        { title: "Ring stress trajectory", option: roll() },
        { title: "Week × hour (UTC)", option: heat() },
        { title: "Ops flow (sankey · counts)", option: sankey() },
        { title: "Risk gauge · world state", option: gauge() },
      ];
    case "finance":
      return [
        { title: "Ring stress trajectory", option: roll() },
        { title: "Arrivals · UTC hour", option: hour() },
        { title: "Escalation funnel · severity", option: funnel() },
        { title: "Severity treemap", option: treemap() },
      ];
    case "climate":
      return [
        { title: "Ring stress trajectory", option: roll() },
        { title: "Week × hour (UTC)", option: heat() },
        { title: "Hour arrivals · pictorial strip", option: domainPictorialHourArrivals(events, accent, eventHourBuckets, domainId) },
        {
          title: "Ordinal lanes · theme river",
          option: deskTertiaryThemeRiverOrdinal(domainId, events, accent),
        },
      ];
    case "seismic":
      return [
        { title: "Arrivals · UTC hour", option: hour() },
        { title: "Week × hour (UTC)", option: heat() },
        { title: "Severity boxplot · buffer", option: domainSeverityBoxplot(events, accent) },
        { title: "Ops flow (sankey · counts)", option: sankey() },
      ];
    case "transport":
      return [
        { title: "Ring stress trajectory", option: roll() },
        { title: "Arrivals · UTC hour", option: hour() },
        { title: "Escalation funnel · severity", option: funnel() },
        { title: "Ordinal vs severity · scatter", option: domainScatterOrdinalSeverity(events, accent) },
      ];
    case "health":
      return [
        { title: "UTC hour arrivals", option: hour() },
        { title: "Week × hour (UTC)", option: heat() },
        { title: "Severity treemap", option: treemap() },
        { title: "Parallel signals · buffer", option: deskTertiaryParallelSignals(events) },
      ];
    case "geospatial":
      return [
        { title: "Ring stress trajectory", option: roll() },
        { title: "Week × hour (UTC)", option: heat() },
        { title: "UTC dayparts · sunburst", option: deskTertiarySunburstUtc(events, accent) },
        { title: "Ops flow (sankey · counts)", option: sankey() },
      ];
    case "economy":
      return [
        { title: "Ring risk trajectory", option: roll() },
        { title: "Arrivals · UTC hour", option: hour() },
        {
          title: "Ordinal lanes · theme river",
          option: deskTertiaryThemeRiverOrdinal(domainId, events, accent),
        },
        { title: "Risk gauge · world state", option: gauge() },
      ];
    case "geopolitics":
      return [
        { title: "Ring stress trajectory", option: roll() },
        { title: "Week × hour pressure", option: heat() },
        { title: "Escalation funnel · severity", option: funnel() },
        { title: "Running mean path · lines", option: domainLinesCumulativePath(events, accent) },
      ];
    case "cyber":
      return [
        { title: "UTC hour arrivals", option: hour() },
        { title: "Week × hour (UTC)", option: heat() },
        { title: "Severity boxplot · buffer", option: domainSeverityBoxplot(events, accent) },
        { title: "Escalation funnel · severity", option: funnel() },
      ];
    case "space":
      return [
        { title: "Ring stress trajectory", option: roll() },
        { title: "Arrivals · UTC hour", option: hour() },
        { title: "Risk gauge · world state", option: gauge() },
        { title: "Hour arrivals · pictorial strip", option: domainPictorialHourArrivals(events, accent, eventHourBuckets, domainId) },
      ];
    case "demographics":
      return [
        { title: "Ring stress trajectory", option: roll() },
        { title: "Week × hour (UTC)", option: heat() },
        { title: "Severity treemap", option: treemap() },
        { title: "Escalation funnel · severity", option: funnel() },
      ];
    case "infrastructure":
      return [
        { title: "Ring stress trajectory", option: roll() },
        { title: "Week × hour (UTC)", option: heat() },
        { title: "Severity treemap", option: treemap() },
        { title: "Ops flow (sankey · counts)", option: sankey() },
      ];
    default:
      return [
        { title: "Ring stress trajectory", option: roll() },
        { title: "Week × hour (UTC)", option: heat() },
        { title: "Ops flow (sankey · counts)", option: sankey() },
        { title: "Risk gauge · world state", option: gauge() },
      ];
  }
}

export interface DeskChartPack {
  /** Primary chart first, then four additional panels with distinct series kinds. */
  readonly panels: readonly DeskChartPanel[];
  readonly notes: readonly string[];
}

export function deskChartPack(
  profile: DeskProfile,
  params: {
    domainId: string;
    accent: string;
    events: readonly UiEvent[];
    eventHourBuckets?: Record<string, UiEventHourBucket>;
    severityHistory: readonly number[];
    causalEdges?: readonly UiCausalEdge[];
    state?: UiWorldState;
    dataMode?: DataMode;
  },
): DeskChartPack {
  const {
    domainId,
    accent,
    events,
    severityHistory,
    causalEdges = [],
    state,
    dataMode = "live",
  } = params;

  const packParams: DeskPackParams = {
    domainId,
    accent,
    events,
    eventHourBuckets: params.eventHourBuckets,
    severityHistory,
    causalEdges,
    state,
    dataMode,
  };

  const primary = buildDomainPrimary(domainId, packParams);
  const additional = buildAdditionalPanels(domainId, packParams);

  const domainNote = `Five analytic panels per desk — distinct ECharts series; ${domainId} primary is ${primary.tag.replace(/_/g, " ")}. Desk profile: ${profile}.`;

  const geoNotes: string[] = [];
  if (
    ["energy", "climate", "seismic", "transport", "geospatial", "infrastructure"].includes(
      domainId,
    )
  ) {
    geoNotes.push(deskGeoNote(dataMode));
  }
  if (profile === "orbital_regime") {
    geoNotes.push(
      "Orbital panels: sunburst is live UTC bucketed; pair with globe for conjunction tracks.",
    );
  }
  if (profile === "defensive_digital" && domainId === "cyber") {
    geoNotes.push(
      "Force graph uses causal edges whose endpoints appear in the current event buffer.",
    );
  }

  return {
    panels: [{ title: primary.title, option: primary.option }, ...additional],
    notes: [
      domainNote,
      state
        ? `World-state: risk ${state.risk_index.toFixed(2)} · ${state.event_count} events · avg severity ${state.avg_severity.toFixed(2)}.`
        : "World-state row not yet populated for this domain.",
      ...geoNotes,
    ],
  };
}
