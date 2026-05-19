/**
 * Shared ECharts look-and-feel aligned with the OpenAtlas shell
 * (dark surfaces, zinc text, domain accents in data — not in chrome).
 */
import * as echarts from "echarts/core";
import type { EChartsOption } from "echarts";

import { readThemeFromDocument } from "../theme-events";
import type { ThemeId } from "../theme.svelte";

export const chartPalette = [
  "#22d3ee",
  "#a78bfa",
  "#f59e0b",
  "#34d399",
  "#f472b6",
  "#60a5fa",
  "#fbbf24",
  "#2dd4bf",
] as const;

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

export const tooltipBase: EChartsOption["tooltip"] = {
  confine: true,
  get backgroundColor() {
    return cssVar("--chart-tooltip-bg", "#101013");
  },
  get borderColor() {
    return cssVar("--chart-tooltip-border", "rgba(255,255,255,0.1)");
  },
  textStyle: {
    get color() {
      return cssVar("--chart-tooltip-text", "#f4f4f5");
    },
    fontFamily: "Inter, sans-serif",
  },
};

export const axisLineStyle = {
  get lineStyle() {
    return { color: cssVar("--chart-axis", "rgba(148,163,184,0.35)") };
  },
};
export const splitLineStyle = {
  get lineStyle() {
    return { color: cssVar("--chart-split", "rgba(148,163,184,0.12)") };
  },
};

export const gridReadability: EChartsOption["grid"] = {
  left: 48,
  right: 24,
  top: 48,
  bottom: 40,
  containLabel: true,
};

export function withTransparentBackground<T extends EChartsOption>(opt: T): T {
  return { ...opt, backgroundColor: "transparent" } as T;
}

/** Axis / legend labels — follows `--text-2`. */
export function chartTextMuted(): string {
  return cssVar("--text-2", "#a1a1aa");
}

/** Emphasis labels — follows `--text-1`. */
export function chartTextMain(): string {
  return cssVar("--text-1", "#e4e4e7");
}

/** Grid / split lines — follows `--chart-split`. */
export function chartGridLine(): string {
  return cssVar("--chart-split", "rgba(148, 163, 184, 0.12)");
}

/** Pie / treemap item borders — follows `--chart-item-border`. */
export function chartItemBorder(): string {
  return cssVar("--chart-item-border", "#09090b");
}

let echartsThemesReady = false;

function buildOpenAtlasEchartsTheme(isLight: boolean): object {
  const text = cssVar("--text-1", isLight ? "#18181b" : "#f4f4f5");
  const muted = cssVar("--text-2", isLight ? "#52525b" : "#a1a1aa");
  const axis = cssVar("--chart-axis", "rgba(148, 163, 184, 0.35)");
  const split = cssVar("--chart-split", "rgba(148, 163, 184, 0.12)");
  return {
    color: [...chartPalette],
    backgroundColor: "transparent",
    textStyle: { color: text, fontFamily: "Inter, sans-serif" },
    title: { textStyle: { color: text } },
    legend: { textStyle: { color: muted } },
    categoryAxis: {
      axisLine: { lineStyle: { color: axis } },
      axisTick: { lineStyle: { color: axis } },
      axisLabel: { color: muted },
      splitLine: { lineStyle: { color: split } },
    },
    valueAxis: {
      axisLine: { lineStyle: { color: axis } },
      axisTick: { lineStyle: { color: axis } },
      axisLabel: { color: muted },
      splitLine: { lineStyle: { color: split } },
    },
    timeAxis: {
      axisLine: { lineStyle: { color: axis } },
      axisLabel: { color: muted },
      splitLine: { lineStyle: { color: split } },
    },
    logAxis: {
      axisLine: { lineStyle: { color: axis } },
      axisLabel: { color: muted },
      splitLine: { lineStyle: { color: split } },
    },
    toolbox: { iconStyle: { borderColor: muted } },
  };
}

/** Register `openatlas-{dark,dim,light}` ECharts themes once. */
export function ensureOpenAtlasChartThemes(): void {
  if (echartsThemesReady) return;
  echarts.registerTheme("openatlas-dark", buildOpenAtlasEchartsTheme(false));
  echarts.registerTheme("openatlas-dim", buildOpenAtlasEchartsTheme(false));
  echarts.registerTheme("openatlas-light", buildOpenAtlasEchartsTheme(true));
  echartsThemesReady = true;
}

export function resolveEchartsTheme(theme: ThemeId = readThemeFromDocument()): string {
  ensureOpenAtlasChartThemes();
  return `openatlas-${theme}`;
}
