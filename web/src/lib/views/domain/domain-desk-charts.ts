/**
 * ECharts options for per-domain desks — synthetic but structurally faithful
 * to how SOC, trading, NOC, and mission-control screens partition attention.
 */

import type { EChartsOption } from "echarts";
import type { DeskProfile } from "./domain-desk-types";
import type { DataMode } from "../../data-source-copy";
import { deskGeoNote } from "../../data-source-copy";
import type { UiEvent, UiWorldState } from "../../types";
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

function hourBuckets(events: readonly UiEvent[]): number[] {
  const h = new Array(24).fill(0);
  for (const e of events) {
    const t = Date.parse(e.timestamp);
    if (!Number.isFinite(t)) continue;
    h[new Date(t).getUTCHours()] += 1;
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

export function hourOfDayBars(events: readonly UiEvent[], accent: string): EChartsOption {
  const data = hourBuckets(events);
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

export interface DeskChartPack {
  readonly primaryTitle: string;
  readonly secondaryTitle?: string;
  readonly tertiaryTitle?: string;
  readonly primary: EChartsOption;
  readonly secondary?: EChartsOption;
  readonly tertiary?: EChartsOption;
  readonly notes: readonly string[];
}

export function deskChartPack(
  profile: DeskProfile,
  params: {
    domainId: string;
    accent: string;
    events: readonly UiEvent[];
    severityHistory: readonly number[];
    state?: UiWorldState;
    dataMode?: DataMode;
  },
): DeskChartPack {
  const { domainId, accent, events, severityHistory, state, dataMode = "live" } = params;
  switch (profile) {
    case "markets":
      return {
        primaryTitle:
          domainId === "economy"
            ? "Macro index · intraday (synthetic)"
            : "OHLC · session (synthetic tape)",
        secondaryTitle: "Domain risk stress (live ring)",
        tertiaryTitle: "Arrivals by UTC hour",
        primary: financeTradingChart(domainId, accent),
        secondary: rollingStressLine(severityHistory, accent),
        tertiary: hourOfDayBars(events, accent),
        notes: [
          domainId === "economy"
            ? "Economy desk: macro-style index and stress from live world-state — wire sovereign/bond feeds for production."
            : "Finance desk: candlestick + volume layout as used on trading terminals; live event tempo in supporting panels.",
          state
            ? `Risk index ${state.risk_index.toFixed(2)} · ${state.event_count} events in ring.`
            : "World-state row not yet populated for this domain.",
        ],
      };
    case "defensive_digital":
      return {
        primaryTitle: "Kill-chain stage histogram",
        secondaryTitle: "Hour × day-of-week SOC heatmap",
        tertiaryTitle: "Escalation funnel (severity)",
        primary: cyberKillChainBar(domainId, accent),
        secondary: deskTertiaryHeatmapWeekHour(events, accent),
        tertiary: deskTertiaryFunnelPipeline(events),
        notes: [
          "SOC-style views: MITRE-aligned stage counts (synthetic) plus live event tempo from SpacetimeDB.",
        ],
      };
    case "life_sciences":
      return {
        primaryTitle: "Capacity radar (synthetic wards)",
        secondaryTitle: "Week × hour surge heatmap",
        tertiaryTitle: "Escalation funnel",
        primary: healthRadar(domainId, accent),
        secondary: deskTertiaryHeatmapWeekHour(events, accent),
        tertiary: deskTertiaryFunnelPipeline(events),
        notes: [
          "Hospital operations: radar for surge axes; heatmap shows when live events cluster in UTC.",
        ],
      };
    case "orbital_regime":
      return {
        primaryTitle: "Conjunction readiness gauge",
        secondaryTitle: "Altitude vs orbit phase (scatter)",
        tertiaryTitle: "UTC dayparts × severity",
        primary: spaceGauge(domainId, accent),
        secondary: spaceScatter(domainId, accent),
        tertiary: deskTertiarySunburstUtc(events, accent),
        notes: [
          "Mission control: conjunction gauge and orbit scatter are synthetic; conjunction tracks live on the globe.",
        ],
      };
    case "human_systems":
      return {
        primaryTitle: "Population pyramid (synthetic cohorts)",
        secondaryTitle: "Event arrivals by UTC hour",
        tertiaryTitle: "Severity mix (treemap)",
        primary: demographicsPyramid(domainId, accent),
        secondary: hourOfDayBars(events, accent),
        tertiary: deskTertiaryTreemapSeverity(events, accent),
        notes: [
          "Demographics desk: pyramid until census tables are wired; hour/treemap reflect live event stream.",
        ],
      };
    case "geopolitical_layer":
      return {
        primaryTitle: "Regional severity stack (geotagged)",
        secondaryTitle: "Rolling stress (severity ring)",
        tertiaryTitle: "Sankey · response stages",
        primary: geopoliticalRegionBars(events, accent),
        secondary: rollingStressLine(severityHistory, accent),
        tertiary: deskTertiarySankeyStages(events, accent),
        notes: [
          "Regions inferred from coordinates (AMER / EMEA / APAC / MENA / POLAR).",
        ],
      };
    case "geo_operational":
    default:
      return {
        primaryTitle: "NOC · week × hour load (UTC)",
        secondaryTitle: "Rolling severity stress (ring)",
        tertiaryTitle: "Ops flow (sankey)",
        primary: deskTertiaryHeatmapWeekHour(events, accent),
        secondary: rollingStressLine(severityHistory, accent),
        tertiary: deskTertiarySankeyStages(events, accent),
        notes: [
          state
            ? `World-state risk index ${state.risk_index.toFixed(2)} vs avg severity ${state.avg_severity.toFixed(2)}.`
            : "World-state row not yet populated for this domain.",
          deskGeoNote(dataMode),
        ],
      };
  }
}
