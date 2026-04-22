/**
 * ECharts options for the `/viz` gallery — one representative config per
 * family (bar, pie, graph, treemap, …). Components copy these patterns
 * for production panels.
 */
import type { EChartsOption } from "echarts";

import {
  axisLineStyle,
  chartPalette,
  gridReadability,
  splitLineStyle,
  tooltipBase,
  withTransparentBackground,
} from "./chart-theme";
import {
  THEME_RIVER_WEEKS,
  boxplotFromSample,
  boxplotRuns,
  crossDockMinutes,
  graphSample,
  logisticsSankey,
  marketShare,
  ohlcWeek,
  orgTree,
  parallelMetrics,
  portThroughputKteu,
  sunburstHier,
  themeRiverBlocks,
  trafficByHour,
  treemapHier,
} from "./showcase-datasets";

/** Deep-clone to satisfy ECharts option types (mutable trees vs `as const` datasets). */
function mut(x: unknown): any {
  return JSON.parse(JSON.stringify(x));
}

const tAxis = { ...axisLineStyle };
const tSplit = { ...splitLineStyle };

const common: Pick<EChartsOption, "textStyle" | "tooltip" | "animationEasing"> = {
  textStyle: { fontFamily: "Inter, sans-serif", color: "#a1a1aa" },
  tooltip: tooltipBase,
  animationEasing: "cubicOut",
};

function barVertical(): EChartsOption {
  return withTransparentBackground({
    ...common,
    grid: gridReadability,
    xAxis: {
      type: "category",
      data: [...portThroughputKteu.weeks],
      axisLine: tAxis,
      axisLabel: { color: "#a1a1aa" },
    },
    yAxis: {
      type: "value",
      splitLine: tSplit,
      axisLabel: { color: "#a1a1aa" },
    },
    series: [
      { name: "Shanghai", type: "bar", data: [...portThroughputKteu.shanghai], stack: "a" },
      { name: "Rotterdam", type: "bar", data: [...portThroughputKteu.rotterdam], stack: "a" },
      {
        name: "Los Angeles",
        type: "bar",
        data: [...portThroughputKteu.los_angeles],
        stack: "a",
        itemStyle: { borderRadius: [2, 2, 0, 0] },
      },
    ],
  });
}

function barHorizontal(): EChartsOption {
  return withTransparentBackground({
    ...common,
    grid: { ...gridReadability, left: 64 },
    xAxis: { type: "value", splitLine: tSplit, axisLabel: { color: "#a1a1aa" } },
    yAxis: {
      type: "category",
      data: crossDockMinutes.sites.map((s) => s.name),
      axisLine: tAxis,
      axisLabel: { color: "#a1a1aa" },
    },
    series: [
      {
        type: "bar",
        data: crossDockMinutes.sites.map((s) => s.value),
        itemStyle: {
          color: (params) => chartPalette[params.dataIndex % chartPalette.length]!,
        },
      },
    ],
  });
}

function pictorialBar(): EChartsOption {
  return withTransparentBackground({
    ...common,
    title: { text: "Pictorial bar (capacity)", left: 0, top: 0, textStyle: { color: "#e4e4e7" } },
    grid: gridReadability,
    xAxis: { type: "category", data: crossDockMinutes.sites.map((s) => s.name), axisLine: tAxis },
    yAxis: { type: "value", splitLine: tSplit, max: 70 },
    series: [
      {
        name: "dwell",
        type: "pictorialBar",
        data: crossDockMinutes.sites.map((s) => s.value),
        symbol: "roundRect",
        symbolRepeat: true,
        symbolSize: [12, 6],
        symbolMargin: 2,
        itemStyle: { color: "#22d3ee" },
      },
    ],
  });
}

function histogram(): EChartsOption {
  return withTransparentBackground({
    ...common,
    title: { text: "Histogram (ring-road volume / 100 veh)", left: 0, top: 0, textStyle: { color: "#e4e4e7" } },
    grid: gridReadability,
    xAxis: {
      type: "category",
      data: [...trafficByHour.hours],
      axisLine: tAxis,
      axisLabel: { rotate: 45, color: "#71717a" },
    },
    yAxis: { type: "value", splitLine: tSplit, name: "count" },
    series: [
      {
        name: "veh",
        type: "bar",
        data: [...trafficByHour.volume],
        barCategoryGap: 0,
        itemStyle: { color: "#a78bfa" },
        markLine: {
          data: [{ type: "average", name: "avg" }],
          lineStyle: { color: "#f59e0b" },
        },
      },
    ],
  });
}

function pieBase(): EChartsOption {
  return withTransparentBackground({
    ...common,
    series: [
      {
        type: "pie",
        radius: "62%",
        center: ["50%", "50%"],
        data: marketShare.map((d) => ({ ...d })),
        itemStyle: { borderRadius: 4, borderColor: "#09090b", borderWidth: 2 },
        label: { color: "#d4d4d8" },
      },
    ],
  });
}

function donut(): EChartsOption {
  return withTransparentBackground({
    ...common,
    title: { text: "Donut (share + inner radius)", textStyle: { color: "#e4e4e7" }, left: "center" },
    series: [
      {
        type: "pie",
        radius: ["42%", "68%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: "#09090b", borderWidth: 2 },
        label: { color: "#d4d4d8" },
        data: marketShare.map((d) => ({ ...d })),
      },
    ],
  });
}

function rose(): EChartsOption {
  return withTransparentBackground({
    ...common,
    series: [
      {
        type: "pie",
        radius: [24, 120],
        roseType: "area",
        data: marketShare.map((d, i) => ({
          ...d,
          itemStyle: { color: chartPalette[i % chartPalette.length]! },
        })),
        label: { color: "#d4d4d8" },
      },
    ],
  });
}

function wedgeHalf(): EChartsOption {
  return withTransparentBackground({
    ...common,
    title: { text: "Wedge (180° semicircle)", textStyle: { color: "#e4e4e7" }, left: "center" },
    series: [
      {
        type: "pie",
        radius: "68%",
        startAngle: 180,
        endAngle: 360,
        center: ["50%", "68%"],
        data: marketShare.map((d) => ({ ...d })),
        label: { show: true, color: "#d4d4d8" },
        itemStyle: { borderColor: "#09090b", borderWidth: 1 },
      },
    ],
  });
}

function lineArea(): EChartsOption {
  return withTransparentBackground({
    ...common,
    grid: gridReadability,
    xAxis: { type: "category", data: [...portThroughputKteu.weeks], axisLine: tAxis },
    yAxis: { type: "value", splitLine: tSplit },
    dataZoom: [{ type: "inside" }, { type: "slider", height: 20 }],
    series: [
      {
        name: "Shanghai",
        type: "line",
        data: [...portThroughputKteu.shanghai],
        smooth: true,
        areaStyle: { opacity: 0.12 },
        lineStyle: { width: 2, color: chartPalette[0] },
        itemStyle: { color: chartPalette[0] },
      },
      {
        name: "Rotterdam",
        type: "line",
        data: [...portThroughputKteu.rotterdam],
        smooth: true,
        lineStyle: { width: 2, color: chartPalette[1] },
        itemStyle: { color: chartPalette[1] },
      },
    ],
  });
}

function combinedBarLine(): EChartsOption {
  return withTransparentBackground({
    ...common,
    title: { text: "Combo: bars + line (two axes)", textStyle: { color: "#e4e4e7" } },
    legend: { textStyle: { color: "#a1a1aa" } },
    grid: gridReadability,
    xAxis: { type: "category", data: [...portThroughputKteu.weeks], axisLine: tAxis },
    yAxis: [
      { type: "value", name: "teu", splitLine: tSplit, axisLabel: { color: "#a1a1aa" } },
      {
        type: "value",
        name: "ratio",
        splitLine: { show: false },
        axisLabel: { formatter: "{value}", color: "#a1a1aa" },
      },
    ],
    series: [
      {
        name: "Shanghai (bar)",
        type: "bar",
        data: [...portThroughputKteu.shanghai],
        yAxisIndex: 0,
        itemStyle: { color: chartPalette[0] },
      },
      {
        name: "Shanghai/Rotterdam (line)",
        type: "line",
        yAxisIndex: 1,
        data: portThroughputKteu.shanghai.map((v, i) =>
          Number((v / portThroughputKteu.rotterdam[i]!).toFixed(2)),
        ),
        lineStyle: { color: "#f59e0b" },
        itemStyle: { color: "#f59e0b" },
      },
    ],
  });
}

function scatterAndEffect(): EChartsOption {
  const scatter = parallelMetrics.map((p) => [p.punctuality * 100, p.co2 * 100, p.name] as (string | number)[]);
  return withTransparentBackground({
    ...common,
    grid: gridReadability,
    xAxis: { name: "Punct %", type: "value", splitLine: tSplit, nameTextStyle: { color: "#a1a1aa" } },
    yAxis: { name: "CO₂ idx", type: "value", splitLine: tSplit, nameTextStyle: { color: "#a1a1aa" } },
    series: [
      {
        type: "scatter",
        data: scatter,
        symbolSize: 18,
        itemStyle: { color: "rgba(34,211,238,0.65)" },
      },
      {
        type: "effectScatter",
        data: scatter.slice(0, 2),
        rippleEffect: { brushType: "fill" },
        symbolSize: 24,
        itemStyle: { color: "rgba(244,114,182,0.5)" },
      },
    ],
  });
}

function heatmapCartesian(): EChartsOption {
  const days = 7;
  const hours = 12;
  const data: [number, number, number][] = [];
  for (let d = 0; d < days; d += 1) {
    for (let h = 0; h < hours; h += 1) {
      const jitter = (d * 17 + h * 11) % 19;
      const v = Math.max(
        0,
        40 + Math.sin((d + h) * 0.4) * 20 + jitter * 0.5 - 4,
      );
      data.push([h, d, Math.round(v)]);
    }
  }
  return withTransparentBackground({
    ...common,
    grid: { ...gridReadability, left: 56 },
    xAxis: { type: "category", data: Array.from({ length: hours }, (_, i) => `H${i * 2}`), splitArea: { show: true } },
    yAxis: { type: "category", data: Array.from({ length: days }, (_, i) => `D${i + 1}`), splitArea: { show: true } },
    visualMap: {
      min: 0,
      max: 80,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 4,
      inRange: { color: ["#0f172a", "#22d3ee", "#f59e0b", "#f43f5e"] },
    },
    series: [{ name: "load", type: "heatmap", data, emphasis: { itemStyle: { borderColor: "#fff" } } }],
  });
}

function gaugeSla(): EChartsOption {
  return withTransparentBackground({
    ...common,
    series: [
      {
        name: "SLA",
        type: "gauge",
        center: ["50%", "55%"],
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        splitNumber: 10,
        itemStyle: { color: "#22c55e" },
        progress: { show: true, width: 10 },
        axisLine: { lineStyle: { width: 10, color: [[1, "rgba(63,63,70,0.4)"]] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { distance: 12, color: "#a1a1aa" },
        detail: { valueAnimation: true, color: "#f4f4f5", fontSize: 22, offsetCenter: [0, 36] },
        data: [{ value: 86, name: "p95 latency SLA" }],
      },
    ],
  });
}

function radarLogistics(): EChartsOption {
  return withTransparentBackground({
    ...common,
    radar: {
      indicator: [
        { name: "Punctuality", max: 1 },
        { name: "Cost", max: 1 },
        { name: "Risk", max: 1 },
        { name: "CO₂", max: 1 },
      ],
      splitLine: tSplit,
      splitArea: { show: true, areaStyle: { color: ["rgba(39,39,42,0.2)", "rgba(24,24,27,0.2)"] } },
    },
    series: [
      {
        type: "radar",
        data: parallelMetrics.map((p) => ({
          name: p.name,
          value: [p.punctuality, p.cost, p.risk, p.co2],
        })),
        lineStyle: { width: 1.5 },
        areaStyle: { opacity: 0.08 },
      },
    ],
  });
}

function funnel(): EChartsOption {
  return withTransparentBackground({
    ...common,
    series: [
      {
        type: "funnel",
        left: "10%",
        top: 24,
        bottom: 8,
        width: "80%",
        min: 0,
        max: 100,
        sort: "descending",
        gap: 4,
        label: { show: true, position: "inside", color: "#0b0b0f" },
        itemStyle: { borderColor: "#09090b" },
        data: [
          { value: 100, name: "Ingest" },
          { value: 82, name: "Validate" },
          { value: 64, name: "Enrich" },
          { value: 48, name: "Route" },
          { value: 32, name: "Ack" },
        ],
      },
    ],
  });
}

function sankeyLogistics(): EChartsOption {
  return withTransparentBackground({
    ...common,
    series: [
      {
        type: "sankey",
        emphasis: { focus: "adjacency" },
        data: mut(logisticsSankey.nodes),
        links: mut(logisticsSankey.links),
        lineStyle: { color: "gradient", curveness: 0.45, opacity: 0.4 },
        label: { color: "#d4d4d8" },
        itemStyle: { borderWidth: 0 },
      },
    ],
  });
}

function treeHier(): EChartsOption {
  return withTransparentBackground({
    ...common,
    series: [
      {
        type: "tree",
        data: [mut(orgTree)],
        top: 8,
        bottom: 8,
        left: 8,
        right: 100,
        symbol: "roundRect",
        symbolSize: 8,
        orient: "LR",
        expandAndCollapse: true,
        label: { position: "left", color: "#d4d4d8", fontSize: 11 },
        leaves: { label: { position: "right" } },
        lineStyle: { color: "rgba(148,163,184,0.45)" },
        emphasis: { focus: "descendant" },
      },
    ],
  });
}

function treemapIn(): EChartsOption {
  return withTransparentBackground({
    ...common,
    series: [
      {
        type: "treemap",
        data: [mut(treemapHier)],
        breadcrumb: { show: true, itemStyle: { color: "#a1a1aa" } },
        label: { show: true, color: "#fafafa" },
        itemStyle: { borderColor: "#09090b", borderWidth: 1, gapWidth: 2 },
        levels: [
          { itemStyle: { borderColor: "#18181b" } },
          { itemStyle: { borderColor: "#27272a" } },
        ],
      },
    ],
  });
}

function sunburstIn(): EChartsOption {
  return withTransparentBackground({
    ...common,
    series: [
      {
        type: "sunburst",
        data: [mut(sunburstHier)],
        radius: [0, "92%"],
        itemStyle: { borderRadius: 3, borderWidth: 1, borderColor: "#09090b" },
        label: { minAngle: 8, color: "#fafafa" },
        emphasis: { focus: "ancestor" },
      },
    ],
  });
}

function parallel(): EChartsOption {
  return withTransparentBackground({
    ...common,
    parallelAxis: [
      { dim: 0, name: "Lane", type: "category", data: parallelMetrics.map((p) => p.name) },
      { dim: 1, name: "Punct" },
      { dim: 2, name: "Cost" },
      { dim: 3, name: "Risk" },
      { dim: 4, name: "CO₂" },
    ],
    series: [
      {
        type: "parallel",
        lineStyle: { width: 2, opacity: 0.75 },
        data: parallelMetrics.map(
          (p) => [p.name, p.punctuality, p.cost, p.risk, p.co2] as (string | number)[],
        ),
      },
    ],
  });
}

function boxplotOut(): EChartsOption {
  const b = boxplotFromSample(boxplotRuns.data);
  return withTransparentBackground({
    ...common,
    title: { text: "Boxplot (synthetic tail)", textStyle: { color: "#e4e4e7" } },
    grid: gridReadability,
    xAxis: { type: "category", data: [boxplotRuns.category], axisLine: tAxis },
    yAxis: { type: "value", splitLine: tSplit, name: "ms" },
    series: [
      {
        name: "latency",
        type: "boxplot",
        data: [[b.min, b.q1, b.median, b.q3, b.max]],
        itemStyle: { color: "rgba(34,197,94,0.25)", borderColor: "#22c55e" },
      },
    ],
  });
}

function candlestickIn(): EChartsOption {
  return withTransparentBackground({
    ...common,
    grid: gridReadability,
    xAxis: { type: "category", data: ohlcWeek.days, axisLine: tAxis },
    yAxis: { type: "value", splitLine: tSplit, scale: true },
    series: [
      {
        type: "candlestick",
        data: ohlcWeek.data,
        itemStyle: { color: "#22c55e", color0: "#ef4444", borderColor: "#22c55e", borderColor0: "#ef4444" },
      },
    ],
  });
}

function themeRiverViz(): EChartsOption {
  return withTransparentBackground({
    ...common,
    singleAxis: {
      top: 48,
      bottom: 32,
      type: "category",
      data: THEME_RIVER_WEEKS.slice() as string[],
    },
    series: [
      {
        type: "themeRiver",
        data: themeRiverBlocks.map((r) => [r.week, r.value, r.type]),
      },
    ],
  });
}

function graphForce(): EChartsOption {
  const cats = ["edge", "hub", "leaf"].map((name) => ({ name }));
  return withTransparentBackground({
    ...common,
    tooltip: { ...tooltipBase },
    series: [
      {
        type: "graph",
        layout: "force",
        roam: true,
        draggable: true,
        label: { show: true, color: "#e4e4e7" },
        categories: cats,
        force: { repulsion: 120, edgeLength: [48, 120] },
        data: mut(graphSample.nodes),
        links: mut(graphSample.links),
        lineStyle: { curveness: 0.1, color: "rgba(148,163,184,0.5)" },
        edgeSymbol: ["none", "arrow"],
        emphasis: { focus: "adjacency" },
      },
    ],
  });
}

function linesCartesian(): EChartsOption {
  return withTransparentBackground({
    ...common,
    grid: gridReadability,
    xAxis: { type: "value", name: "km", min: 0, max: 100, splitLine: tSplit, nameTextStyle: { color: "#a1a1aa" } },
    yAxis: { type: "value", name: "alt", min: 0, max: 20, splitLine: tSplit, nameTextStyle: { color: "#a1a1aa" } },
    series: [
      {
        type: "lines",
        coordinateSystem: "cartesian2d",
        polyline: true,
        data: [
          { coords: [[0, 2], [30, 8], [60, 5], [100, 12]] as [number, number][] },
        ],
        lineStyle: { color: "#a78bfa", width: 2, curveness: 0.15 },
        effect: { show: true, period: 5, symbol: "pin", symbolSize: 6 },
      },
    ],
  });
}

function calendarHeatmap(): EChartsOption {
  const data: [string, number][] = [];
  for (let d = 1; d <= 28; d += 1) {
    const v = 20 + (d * 11 + 7) % 50;
    const day = `2024-11-${d.toString().padStart(2, "0")}`;
    data.push([day, v]);
  }
  return withTransparentBackground({
    ...common,
    visualMap: { min: 0, max: 80, type: "continuous", orient: "horizontal", left: "center", bottom: 4, inRange: { color: ["#0c4a6e", "#f59e0b"] } },
    calendar: { range: "2024-11", cellSize: 14, itemStyle: { borderWidth: 0.5, borderColor: "#18181b" } },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data,
      },
    ],
  });
}

export interface ShowcaseEntry {
  id: string;
  title: string;
  subtitle: string;
  build: () => EChartsOption;
}

export const SHOWCASE_ECHARTS: readonly ShowcaseEntry[] = [
  { id: "bar-v", title: "Stacked bar", subtitle: "Port throughput (kTEU) — weekly", build: barVertical },
  { id: "bar-h", title: "Horizontal bar", subtitle: "Cross-dock dwell by site", build: barHorizontal },
  { id: "pictorial", title: "Pictorial bar", subtitle: "Repeating symbol strip", build: pictorialBar },
  { id: "hist", title: "Histogram", subtitle: "Hourly traffic bins", build: histogram },
  { id: "pie", title: "Pie", subtitle: "Carrier mix", build: pieBase },
  { id: "donut", title: "Donut", subtitle: "Inner/outer radii", build: donut },
  { id: "rose", title: "Nightingale rose", subtitle: "Same data, roseType area", build: rose },
  { id: "wedge", title: "Semicircle wedge", subtitle: "180° arc", build: wedgeHalf },
  { id: "line", title: "Line + area", subtitle: "Smooth + dataZoom", build: lineArea },
  { id: "combo", title: "Bar + line", subtitle: "Dual y-axis ratio", build: combinedBarLine },
  { id: "scatter", title: "Scatter + effect", subtitle: "Routes vs CO₂", build: scatterAndEffect },
  { id: "heat-grid", title: "Cartesian heatmap", subtitle: "D×H grid (synthetic load)", build: heatmapCartesian },
  { id: "calendar", title: "Calendar heatmap", subtitle: "Daily ops score", build: calendarHeatmap },
  { id: "gauge", title: "Gauge", subtitle: "SLA dial", build: gaugeSla },
  { id: "radar", title: "Radar", subtitle: "Corridor KPIs", build: radarLogistics },
  { id: "funnel", title: "Funnel", subtitle: "Pipeline drop-off", build: funnel },
  { id: "sankey", title: "Sankey", subtitle: "Intermodal flow", build: sankeyLogistics },
  { id: "tree", title: "Tree", subtitle: "Node hierarchy (LR)", build: treeHier },
  { id: "treemap", title: "Treemap", subtitle: "Nested volume", build: treemapIn },
  { id: "sunburst", title: "Sunburst", subtitle: "Radial partition", build: sunburstIn },
  { id: "parallel", title: "Parallel coords", subtitle: "Multi-metric trade-offs", build: parallel },
  { id: "box", title: "Boxplot", subtitle: "Latency distribution (tail outlier)", build: boxplotOut },
  { id: "candle", title: "Candlestick", subtitle: "Synthetic OHLC", build: candlestickIn },
  { id: "river", title: "Theme river", subtitle: "Grid / traffic / logistics stack", build: themeRiverViz },
  { id: "graph", title: "Force graph", subtitle: "Nodes + edges", build: graphForce },
  { id: "lines2d", title: "Lines (2D path)", subtitle: "Animated path + effect", build: linesCartesian },
] as const;
