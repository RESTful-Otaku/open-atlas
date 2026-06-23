import * as echarts from "echarts/core";
import {
  BarChart,
  BoxplotChart,
  CandlestickChart,
  CustomChart,
  EffectScatterChart,
  FunnelChart,
  GaugeChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  LinesChart,
  MapChart,
  ParallelChart,
  PictorialBarChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  ThemeRiverChart,
  TreeChart,
  TreemapChart,
} from "echarts/charts";
import {
  AxisPointerComponent,
  BrushComponent,
  CalendarComponent,
  DataZoomComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  DatasetComponent,
  GeoComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  ParallelComponent,
  PolarComponent,
  RadarComponent,
  SingleAxisComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

import { resolveEchartsTheme } from "./viz/chart-theme";

let registered = false;

function ensureRegistered(): void {
  if (registered) return;
  echarts.use([
    BarChart,
    BoxplotChart,
    CandlestickChart,
    CustomChart,
    EffectScatterChart,
    FunnelChart,
    GaugeChart,
    GraphChart,
    HeatmapChart,
    LineChart,
    LinesChart,
    MapChart,
    ParallelChart,
    PictorialBarChart,
    PieChart,
    RadarChart,
    SankeyChart,
    ScatterChart,
    SunburstChart,
    ThemeRiverChart,
    TreeChart,
    TreemapChart,
    GridComponent,
    PolarComponent,
    RadarComponent,
    GeoComponent,
    LegendComponent,
    TooltipComponent,
    TitleComponent,
    DataZoomComponent,
    DataZoomInsideComponent,
    DataZoomSliderComponent,
    VisualMapComponent,
    MarkLineComponent,
    MarkPointComponent,
    MarkAreaComponent,
    ToolboxComponent,
    GraphicComponent,
    DatasetComponent,
    AxisPointerComponent,
    SingleAxisComponent,
    ParallelComponent,
    CalendarComponent,
    BrushComponent,
    CanvasRenderer,
  ]);
  registered = true;
}

export function initChart(
  container: HTMLElement,
  theme?: string | object | null,
): echarts.ECharts {
  ensureRegistered();
  const resolved =
    theme === undefined || theme === null ? resolveEchartsTheme() : theme;
  return echarts.init(container, resolved, {
    renderer: "canvas",
  });
}

export { echarts };
export type { ECharts } from "echarts/core";
export type { EChartsOption } from "echarts";
export type {
  BarSeriesOption,
  BoxplotSeriesOption,
  CandlestickSeriesOption,
  FunnelSeriesOption,
  GaugeSeriesOption,
  GraphSeriesOption,
  HeatmapSeriesOption,
  LineSeriesOption,
  MapSeriesOption,
  ParallelSeriesOption,
  PieSeriesOption,
  PictorialBarSeriesOption,
  RadarSeriesOption,
  SankeySeriesOption,
  ScatterSeriesOption,
  SunburstSeriesOption,
  ThemeRiverSeriesOption,
  TreeSeriesOption,
  TreemapSeriesOption,
} from "echarts/charts";
