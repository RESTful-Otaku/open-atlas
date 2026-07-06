

import type { EChartsOption } from "echarts";
import type { UiEvent, UiWorldState } from "../types";
import { domainColor, domainLabel } from "../colors";
import { eventsInDomains } from "./builders";
import { chartPalette, gridReadability, splitLineStyle, tooltipBase } from "../viz/chart-theme";

const textMuted = "#a1a1aa";
const gridLine = "rgba(255,255,255,0.06)";

export type MatrixChartKind =
  | "sunburst_domain_severity"
  | "heatmap_hour_domain"
  | "funnel_severity_pipeline"
  | "treemap_domain_volume"
  | "pie_domain_share"
  | "radar_domain_load"
  | "sankey_domain_band"
  | "themeRiver_recent"
  | "parallel_event_vectors"
  | "graph_domain_star"
  | "line_count_timeline"
  | "scatter_time_severity"
  | "gauge_scope_risk"
  | "bar_domain_counts"
  | "pictorial_hour_strip"
  | "boxplot_severity_per_domain"
  | "tree_domain_hierarchy"
  | "rose_domain_share"
  | "lines2d_corridor"
  | "effectScatter_flashpoints";

export interface MatrixChartContext {
  readonly events: readonly UiEvent[];
  readonly domainState: Record<string, UiWorldState>;
  readonly domains: readonly string[];
  readonly accent: string;
}

function sevBucket(score: number): "Low" | "Medium" | "High" {
  if (score < 0.34) return "Low";
  if (score < 0.67) return "Medium";
  return "High";
}

function scoped(ctx: MatrixChartContext): readonly UiEvent[] {
  return eventsInDomains(ctx.events, ctx.domains);
}

function domainList(ctx: MatrixChartContext): readonly string[] {
  return ctx.domains.length > 0 ? ctx.domains : ["geopolitics"];
}

function countsByDomain(events: readonly UiEvent[], domains: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of domains) m.set(d, 0);
  for (const e of events) {
    if (!m.has(e.domain)) continue;
    m.set(e.domain, (m.get(e.domain) ?? 0) + 1);
  }
  return m;
}

function hourDomainMatrix(
  events: readonly UiEvent[],
  domains: readonly string[],
): { hours: string[]; matrix: number[][] } {
  const hours = Array.from({ length: 24 }, (_, h) => `${h}h`);
  const di = new Map(domains.map((d, i) => [d, i] as const));
  const matrix = domains.map(() => new Array(24).fill(0));
  for (const e of events) {
    const row = di.get(e.domain);
    if (row === undefined) continue;
    const t = Date.parse(e.timestamp);
    if (!Number.isFinite(t)) continue;
    const h = new Date(t).getUTCHours();
    const rowArr = matrix[row];
    if (rowArr) rowArr[h] = (rowArr[h] ?? 0) + 1;
  }
  return { hours, matrix };
}

export function matrixChartOption(kind: MatrixChartKind, ctx: MatrixChartContext): EChartsOption {
  const events = scoped(ctx);
  const domains = domainList(ctx);
  const base = {
    backgroundColor: "transparent",
    textStyle: { color: textMuted },
    tooltip: tooltipBase,
  } satisfies EChartsOption;

  switch (kind) {
    case "sunburst_domain_severity": {
      const children = domains.map((id) => {
        const ev = events.filter((e) => e.domain === id);
        const low = ev.filter((e) => sevBucket(e.severity_score) === "Low").length;
        const med = ev.filter((e) => sevBucket(e.severity_score) === "Medium").length;
        const hi = ev.filter((e) => sevBucket(e.severity_score) === "High").length;
        return {
          name: domainLabel(id),
          itemStyle: { color: domainColor(id) },
          children: [
            { name: "Low", value: Math.max(low, 1) },
            { name: "Medium", value: Math.max(med, 1) },
            { name: "High", value: Math.max(hi, 1) },
          ],
        };
      });
      return {
        ...base,
        series: [
          {
            type: "sunburst",
            radius: [0, "92%"],
            data: [{ name: "Scope", children }],
            itemStyle: { borderRadius: 2, borderWidth: 1, borderColor: "#09090b" },
            label: { minAngle: 6, color: "#fafafa", fontSize: 10 },
          },
        ],
      };
    }
    case "heatmap_hour_domain": {
      const { hours, matrix } = hourDomainMatrix(events, domains);
      const data: [number, number, number][] = [];
      for (let r = 0; r < domains.length; r += 1) {
        for (let c = 0; c < 24; c += 1) {
          data.push([c, r, matrix[r]?.[c] ?? 0]);
        }
      }
      const maxV = Math.max(1, ...data.map((d) => d[2]));
      return {
        ...base,
        tooltip: { ...tooltipBase, position: "top" },
        grid: { left: 72, right: 12, top: 16, bottom: 28, containLabel: false },
        xAxis: {
          type: "category",
          data: hours,
          axisLabel: { color: textMuted, fontSize: 9, rotate: 45 },
          splitArea: { show: true },
        },
        yAxis: {
          type: "category",
          data: domains.map((d) => domainLabel(d)),
          axisLabel: { color: textMuted, fontSize: 10 },
        },
        visualMap: {
          min: 0,
          max: maxV,
          calculable: true,
          orient: "horizontal",
          left: "center",
          bottom: 2,
          inRange: { color: ["#0c4a6e", ctx.accent] },
          textStyle: { color: textMuted, fontSize: 10 },
        },
        series: [{ type: "heatmap", data, emphasis: { itemStyle: { shadowBlur: 8 } } }],
      };
    }
    case "funnel_severity_pipeline": {
      const all = Math.max(events.length, 1);
      const triage = events.filter((e) => e.severity_score >= 0.2).length;
      const escalate = events.filter((e) => e.severity_score >= 0.45).length;
      const warroom = events.filter((e) => e.severity_score >= 0.7).length;
      const data = [
        { value: all, name: "Ingested" },
        { value: Math.max(triage, 1), name: "Triaged" },
        { value: Math.max(escalate, 1), name: "Escalated" },
        { value: Math.max(warroom, 1), name: "Critical path" },
      ];
      return {
        ...base,
        series: [
          {
            type: "funnel",
            left: "8%",
            top: 20,
            bottom: 8,
            width: "84%",
            min: 0,
            max: all,
            sort: "descending",
            gap: 4,
            label: { color: "#0b0b0f", fontSize: 10 },
            data,
          },
        ],
      };
    }
    case "treemap_domain_volume": {
      const counts = countsByDomain(events, domains);
      const data = domains.map((id) => ({
        name: domainLabel(id),
        value: Math.max(counts.get(id) ?? 0, 1),
        itemStyle: { color: domainColor(id) },
      }));
      return {
        ...base,
        series: [
          {
            type: "treemap",
            roam: false,
            data,
            breadcrumb: { show: false },
            label: { show: true, fontSize: 11, color: "#fafafa" },
            itemStyle: { borderColor: "#09090b", borderWidth: 1, gapWidth: 2 },
          },
        ],
      };
    }
    case "pie_domain_share":
    case "rose_domain_share": {
      const counts = countsByDomain(events, domains);
      const data = domains.map((id) => ({
        name: domainLabel(id),
        value: Math.max(counts.get(id) ?? 0, 1),
        itemStyle: { color: domainColor(id) },
      }));
      const isRose = kind === "rose_domain_share";
      return {
        ...base,
        series: [
          {
            type: "pie",
            roseType: isRose ? "area" : undefined,
            radius: isRose ? [16, "62%"] : ["36%", "62%"],
            center: ["50%", "52%"],
            data,
            label: { color: textMuted, fontSize: 10 },
          },
        ],
      };
    }
    case "radar_domain_load": {
      const counts = countsByDomain(events, domains);
      const indicators = domains.map((id) => ({
        name: domainLabel(id),
        max: Math.max(10, (counts.get(id) ?? 0) * 2, 4),
      }));
      const vals = domains.map((id) => Math.max(counts.get(id) ?? 0, 0.5));
      return {
        ...base,
        radar: {
          indicator: indicators,
          splitLine: { lineStyle: { color: gridLine } },
          axisName: { color: textMuted, fontSize: 10 },
        },
        series: [
          {
            type: "radar",
            data: [
              {
                name: "Event load",
                value: vals,
                areaStyle: { opacity: 0.12 },
                lineStyle: { color: ctx.accent, width: 2 },
              },
            ],
          },
        ],
      };
    }
    case "sankey_domain_band": {
      const bands = ["Low", "Medium", "High"] as const;
      const nodes: { name: string }[] = [];
      const nameSet = new Set<string>();
      for (const d of domains) {
        const n = domainLabel(d);
        if (!nameSet.has(n)) {
          nameSet.add(n);
          nodes.push({ name: n });
        }
      }
      for (const b of bands) nodes.push({ name: b });
      const links: { source: string; target: string; value: number }[] = [];
      for (const d of domains) {
        const label = domainLabel(d);
        const ev = events.filter((e) => e.domain === d);
        for (const b of bands) {
          const c = ev.filter((e) => sevBucket(e.severity_score) === b).length;
          if (c > 0) links.push({ source: label, target: b, value: c });
        }
      }
      if (links.length === 0) {
        links.push({ source: domainLabel(domains[0] ?? ""), target: "Low", value: 1 });
      }
      return {
        ...base,
        series: [
          {
            type: "sankey",
            emphasis: { focus: "adjacency" },
            data: nodes,
            links,
            lineStyle: { color: "gradient", curveness: 0.45, opacity: 0.35 },
            label: { color: textMuted, fontSize: 10 },
          },
        ],
      };
    }
    case "themeRiver_recent": {
      const slots = 10;
      const slotLabels = Array.from({ length: slots }, (_, i) => `−${slots - i - 1}`);
      const perDomain = new Map<string, number[]>();
      for (const d of domains) perDomain.set(d, new Array(slots).fill(0));
      const sorted = [...events].sort(
        (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
      );
      for (let i = 0; i < sorted.length; i += 1) {
        const slot = Math.min(slots - 1, Math.floor(i / Math.max(1, Math.ceil(sorted.length / slots))));
        const evt = sorted[i]!;
        const arr = perDomain.get(evt.domain);
        if (arr) arr[slot] += 1;
      }
      const data: [string, number, string][] = [];
      for (const d of domains) {
        const arr = perDomain.get(d);
        if (!arr) continue;
        const label = domainLabel(d);
        for (let s = 0; s < slots; s += 1) {
          data.push([slotLabels[s]!, Math.max(arr[s] ?? 0, 0.05), label]);
        }
      }
      return {
        ...base,
        singleAxis: {
          top: 40,
          bottom: 28,
          type: "category",
          data: slotLabels,
          axisLabel: { color: textMuted, fontSize: 9 },
        },
        series: [{ type: "themeRiver", data }],
      };
    }
    case "parallel_event_vectors": {
      const sample = events.slice(0, 48);
      const domainCats = domains.map((d) => domainLabel(d));
      const rows = sample.map((e) => {
        const t = Date.parse(e.timestamp);
        const h = Number.isFinite(t) ? new Date(t).getUTCHours() : 0;
        return [
          domainLabel(e.domain),
          h,
          Math.round(e.severity_score * 100),
          e.location ? Math.round((e.location.lat + 90) % 60) : 0,
        ] as (string | number)[];
      });
      if (rows.length === 0) {
        rows.push([domainLabel(domains[0] ?? ""), 12, 35, 10]);
      }
      return {
        ...base,
        parallelAxis: [
          { dim: 0, name: "Domain", type: "category", data: domainCats },
          { dim: 1, name: "UTC hour", min: 0, max: 23 },
          { dim: 2, name: "Severity ×100", min: 0, max: 100 },
          { dim: 3, name: "Geo proxy", min: 0, max: 60 },
        ],
        series: [
          {
            type: "parallel",
            lineStyle: { width: 1.5, opacity: 0.65, color: ctx.accent },
            data: rows,
          },
        ],
      };
    }
    case "graph_domain_star": {
      const counts = countsByDomain(events, domains);
      const hub = "Correlated scope";
      const data: { id: string; name: string; symbolSize: number; itemStyle?: { color: string } }[] = [
        { id: hub, name: hub, symbolSize: 28, itemStyle: { color: ctx.accent } },
      ];
      const links: { source: string; target: string; value: number }[] = [];
      for (const d of domains) {
        const id = domainLabel(d);
        const n = Math.max(counts.get(d) ?? 0, 1);
        data.push({
          id,
          name: id,
          symbolSize: 12 + Math.min(n, 18),
          itemStyle: { color: domainColor(d) },
        });
        links.push({ source: hub, target: id, value: n });
      }
      return {
        ...base,
        series: [
          {
            type: "graph",
            layout: "force",
            roam: true,
            draggable: true,
            data,
            links,
            force: { repulsion: 220, edgeLength: 96 },
            label: { show: true, fontSize: 9, color: textMuted },
            lineStyle: { color: "rgba(148,163,184,0.45)", curveness: 0.05 },
          },
        ],
      };
    }
    case "line_count_timeline": {
      const sorted = [...events].sort(
        (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
      );
      const bins = 16;
      const labels = Array.from({ length: bins }, (_, i) => `B${i + 1}`);
      let series = domains.map((d) => {
        const ev = sorted.filter((e) => e.domain === d);
        const step = Math.max(1, Math.ceil(ev.length / bins));
        const data = labels.map((_, i) => {
          const slice = ev.slice(i * step, (i + 1) * step);
          return slice.length;
        });
        return {
          name: domainLabel(d),
          type: "line" as const,
          smooth: 0.25,
          showSymbol: false,
          lineStyle: { width: 2, color: domainColor(d) },
          data,
        };
      });
      if (series.every((s) => s.data.every((v) => v === 0)) && series.length > 0) {
        const head = series[0];
        if (head) {
          series = [{ ...head, data: labels.map(() => 1) }, ...series.slice(1)];
        }
      }
      return {
        ...base,
        tooltip: { ...tooltipBase, trigger: "axis" },
        legend: {
          textStyle: { color: textMuted },
          top: 0,
          type: "scroll",
          selectedMode: true,
          selector: true,
          selectorLabel: { color: textMuted, fontSize: 10 },
        },
        grid: { left: 44, right: 8, top: 28, bottom: 28 },
        xAxis: {
          type: "category",
          data: labels,
          axisLabel: { color: textMuted, fontSize: 9 },
          axisLine: { lineStyle: { color: gridLine } },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: gridLine } },
          axisLabel: { color: textMuted, fontSize: 10 },
        },
        series,
      };
    }
    case "scatter_time_severity": {
      let pts = events.slice(0, 120).map((e, i) => [
        i,
        Math.round(e.severity_score * 100),
        e.ordinal % 9,
      ]) as [number, number, number][];
      if (pts.length === 0) pts = [[0, 40, 5]];
      return {
        ...base,
        tooltip: { ...tooltipBase, trigger: "item" },
        grid: { left: 44, right: 12, top: 18, bottom: 32 },
        xAxis: {
          type: "value",
          name: "Recency rank",
          nameTextStyle: { color: textMuted, fontSize: 10 },
          splitLine: { lineStyle: { color: gridLine } },
          axisLabel: { color: textMuted, fontSize: 10 },
        },
        yAxis: {
          type: "value",
          name: "Severity ×100",
          nameTextStyle: { color: textMuted, fontSize: 10 },
          splitLine: { lineStyle: { color: gridLine } },
          axisLabel: { color: textMuted, fontSize: 10 },
        },
        series: [
          {
            type: "scatter",
            symbolSize: (d: number[]) => 4 + (d[2] ?? 0),
            itemStyle: { color: ctx.accent, opacity: 0.78 },
            data: pts,
          },
        ],
      };
    }
    case "gauge_scope_risk": {
      let sum = 0;
      let n = 0;
      for (const d of domains) {
        const s = ctx.domainState[d];
        if (s) {
          sum += s.risk_index;
          n += 1;
        }
      }
      const v = n > 0 ? Math.round((sum / n) * 100) : 42;
      return {
        ...base,
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
                  [1, ctx.accent],
                ],
              },
            },
            pointer: { itemStyle: { color: ctx.accent } },
            title: { offsetCenter: [0, "70%"], color: textMuted, fontSize: 10 },
            detail: {
              offsetCenter: [0, "40%"],
              fontSize: 20,
              color: "#e4e4e7",
              formatter: "{value}",
            },
            data: [{ value: v, name: "Blended risk index" }],
          },
        ],
      };
    }
    case "bar_domain_counts": {
      const counts = countsByDomain(events, domains);
      const data = domains.map((d) => Math.max(counts.get(d) ?? 0, 0));
      return {
        ...base,
        tooltip: { ...tooltipBase, trigger: "axis" },
        grid: { left: 44, right: 12, top: 12, bottom: 28 },
        xAxis: {
          type: "value",
          splitLine: { lineStyle: { color: gridLine } },
          axisLabel: { color: textMuted, fontSize: 10 },
        },
        yAxis: {
          type: "category",
          data: domains.map((d) => domainLabel(d)),
          axisLabel: { color: textMuted, fontSize: 10 },
        },
        series: [
          {
            type: "bar",
            data: data.map((v, i) => {
              const d = domains[i]!;
              return {
                value: Math.max(v, 0.5),
                itemStyle: { color: domainColor(d) },
              };
            }),
          },
        ],
      };
    }
    case "pictorial_hour_strip": {
      const h = new Array(24).fill(0);
      for (const e of events) {
        const t = Date.parse(e.timestamp);
        if (!Number.isFinite(t)) continue;
        h[new Date(t).getUTCHours()] += 1;
      }
      const data = h.map((v) => Math.max(v, 0.15));
      return {
        ...base,
        tooltip: { ...tooltipBase, trigger: "axis" },
        grid: { left: 40, right: 8, top: 18, bottom: 36 },
        xAxis: {
          type: "category",
          data: h.map((_, i) => `${i}h`),
          axisLabel: { color: textMuted, fontSize: 9, rotate: 45 },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: gridLine } },
          axisLabel: { color: textMuted, fontSize: 10 },
        },
        series: [
          {
            type: "pictorialBar",
            symbol: "rect",
            symbolRepeat: true,
            symbolSize: [10, 4],
            symbolMargin: 1,
            itemStyle: { color: ctx.accent },
            data,
          },
        ],
      };
    }
    case "boxplot_severity_per_domain": {
      const categories: string[] = [];
      const boxData: number[][] = [];
      for (const d of domains) {
        const scores = events.filter((e) => e.domain === d).map((e) => e.severity_score);
        categories.push(domainLabel(d));
        if (scores.length === 0) {
          boxData.push([0.1, 0.25, 0.4, 0.55, 0.7]);
        } else {
          const sorted = [...scores].sort((a, b) => a - b);
          const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
          boxData.push([
            sorted[0] ?? 0,
            q(0.25),
            q(0.5),
            q(0.75),
            sorted.at(-1) ?? 0,
          ]);
        }
      }
      return {
        ...base,
        tooltip: { ...tooltipBase, trigger: "item" },
        grid: { ...gridReadability, top: 36, bottom: 32 },
        xAxis: { type: "category", data: categories, axisLabel: { color: textMuted, fontSize: 10 } },
        yAxis: {
          type: "value",
          min: 0,
          max: 1,
          splitLine: splitLineStyle,
          axisLabel: { color: textMuted, fontSize: 10 },
        },
        series: [
          {
            type: "boxplot",
            data: boxData,
            itemStyle: { color: `${ctx.accent}44`, borderColor: ctx.accent },
          },
        ],
      };
    }
    case "tree_domain_hierarchy": {
      const counts = countsByDomain(events, domains);
      const children = domains.map((id) => ({
        name: `${domainLabel(id)} (${counts.get(id) ?? 0})`,
        value: Math.max(counts.get(id) ?? 0, 1),
        itemStyle: { color: domainColor(id) },
      }));
      return {
        ...base,
        series: [
          {
            type: "tree",
            data: [{ name: "Matrix scope", children }],
            top: 10,
            bottom: 10,
            left: 12,
            right: 120,
            symbol: "roundRect",
            symbolSize: 7,
            orient: "LR",
            expandAndCollapse: true,
            label: { position: "left", color: textMuted, fontSize: 10 },
            leaves: { label: { position: "right" } },
            lineStyle: { color: "rgba(148,163,184,0.4)" },
          },
        ],
      };
    }
    case "lines2d_corridor": {
      return {
        ...base,
        grid: { left: 44, right: 12, top: 18, bottom: 32 },
        xAxis: {
          type: "value",
          min: 0,
          max: 100,
          splitLine: { lineStyle: { color: gridLine } },
          axisLabel: { color: textMuted, fontSize: 10 },
          name: "Corridor km",
          nameTextStyle: { color: textMuted, fontSize: 10 },
        },
        yAxis: {
          type: "value",
          min: 0,
          max: 20,
          splitLine: { lineStyle: { color: gridLine } },
          axisLabel: { color: textMuted, fontSize: 10 },
          name: "Load index",
          nameTextStyle: { color: textMuted, fontSize: 10 },
        },
        series: [
          {
            type: "lines",
            coordinateSystem: "cartesian2d",
            polyline: true,
            data: [
              { coords: [[0, 3], [25, 9], [55, 6], [88, 14]] as [number, number][] },
              { coords: [[5, 12], [40, 8], [70, 11], [95, 5]] as [number, number][] },
            ],
            lineStyle: { width: 2, curveness: 0.12, color: chartPalette[1] },
            effect: { show: true, period: 6, symbol: "pin", symbolSize: 5, color: ctx.accent },
          },
        ],
      };
    }
    case "effectScatter_flashpoints": {
      let pts = events.slice(0, 40).map((e) => ({
        name: `#${e.ordinal}`,
        value: [
          (Date.parse(e.timestamp) / 1e10) % 100,
          Math.round(e.severity_score * 100),
          e.severity_score * 40 + 8,
        ],
      }));
      if (pts.length === 0) {
        pts.push({ name: "—", value: [50, 45, 20] });
      }
      return {
        ...base,
        tooltip: { ...tooltipBase, trigger: "item" },
        grid: { left: 44, right: 12, top: 18, bottom: 32 },
        xAxis: {
          type: "value",
          splitLine: { lineStyle: { color: gridLine } },
          axisLabel: { color: textMuted, fontSize: 10 },
          name: "Time phase",
          nameTextStyle: { color: textMuted, fontSize: 10 },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: gridLine } },
          axisLabel: { color: textMuted, fontSize: 10 },
          name: "Severity ×100",
          nameTextStyle: { color: textMuted, fontSize: 10 },
        },
        series: [
          {
            type: "effectScatter",
            rippleEffect: { brushType: "stroke", scale: 3 },
            symbolSize: (val: number[]) => val[2] ?? 16,
            itemStyle: { color: ctx.accent, shadowBlur: 10 },
            data: pts,
          },
        ],
      };
    }
    default:
      return matrixChartOption("bar_domain_counts", ctx);
  }
}


export const MATRIX_TAB_CHARTS: Readonly<
  Record<
    string,
    { overview: MatrixChartKind; telemetry: MatrixChartKind; incidents: MatrixChartKind }
  >
> = {
  threat: {
    overview: "sunburst_domain_severity",
    telemetry: "heatmap_hour_domain",
    incidents: "funnel_severity_pipeline",
  },
  economic: {
    overview: "treemap_domain_volume",
    telemetry: "themeRiver_recent",
    incidents: "sankey_domain_band",
  },
  health: {
    overview: "radar_domain_load",
    telemetry: "lines2d_corridor",
    incidents: "boxplot_severity_per_domain",
  },
  transport: {
    overview: "parallel_event_vectors",
    telemetry: "line_count_timeline",
    incidents: "scatter_time_severity",
  },
  cyber: {
    overview: "gauge_scope_risk",
    telemetry: "heatmap_hour_domain",
    incidents: "graph_domain_star",
  },
  resource: {
    overview: "pictorial_hour_strip",
    telemetry: "bar_domain_counts",
    incidents: "rose_domain_share",
  },
  demographics: {
    overview: "pie_domain_share",
    telemetry: "tree_domain_hierarchy",
    incidents: "funnel_severity_pipeline",
  },
  compute: {
    overview: "sunburst_domain_severity",
    telemetry: "line_count_timeline",
    incidents: "effectScatter_flashpoints",
  },
};

export function matrixChartKindForTab(
  matrixId: string,
  tab: "overview" | "telemetry" | "incidents",
): MatrixChartKind {
  const row = MATRIX_TAB_CHARTS[matrixId];
  if (!row) return tab === "overview" ? "pie_domain_share" : tab === "telemetry" ? "line_count_timeline" : "bar_domain_counts";
  return row[tab];
}
