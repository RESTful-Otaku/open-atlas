/**
 * Shared ECharts look-and-feel aligned with the OpenAtlas shell
 * (dark surfaces, zinc text, domain accents in data — not in chrome).
 */
import type { EChartsOption } from "echarts";

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

export const tooltipBase: EChartsOption["tooltip"] = {
  confine: true,
  backgroundColor: "#101013",
  borderColor: "rgba(255,255,255,0.1)",
  textStyle: { color: "#f4f4f5", fontFamily: "Inter, sans-serif" },
};

export const axisLineStyle = { lineStyle: { color: "rgba(148,163,184,0.35)" } };
export const splitLineStyle = { lineStyle: { color: "rgba(148,163,184,0.12)" } };

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
