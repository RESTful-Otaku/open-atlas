/**
 * Merges zoom, brush, and toolbox defaults into ECharts options.
 * Interactions are scoped by coordinate system so sunburst/treemap drill
 * is not covered by cartesian chrome, and cartesian charts reserve margin
 * for controls (toolbox on the right, sliders at the bottom).
 */
import type { EChartsOption } from "echarts";

const DZ_IN_ID = "openatlas-dz-inside";
const DZ_SL_ID = "openatlas-dz-slider";
const TB_PATCHED = "openatlas-toolbox";

function normalizeSeries(s: EChartsOption["series"]): Record<string, unknown>[] {
  if (Array.isArray(s)) return s as Record<string, unknown>[];
  if (s != null) return [s as Record<string, unknown>];
  return [];
}

function normalizeDataZoom(dz: EChartsOption["dataZoom"]): unknown[] {
  if (dz == null) return [];
  return Array.isArray(dz) ? [...dz] : [dz];
}

function stripOurDataZoom(dz: EChartsOption["dataZoom"]): unknown[] {
  return normalizeDataZoom(dz).filter((z) => {
    const id = z && typeof z === "object" && "id" in z ? (z as { id?: string }).id : undefined;
    return id !== DZ_IN_ID && id !== DZ_SL_ID;
  });
}

function firstToolbox(tb: EChartsOption["toolbox"]): Record<string, unknown> {
  if (tb == null || Array.isArray(tb)) return {};
  return tb as Record<string, unknown>;
}

function hasCartesianGrid(opt: EChartsOption): boolean {
  if (opt.geo || opt.calendar || opt.radar || opt.parallelAxis || opt.polar) return false;
  if (opt.singleAxis != null && opt.xAxis == null) return false;
  return opt.xAxis != null && opt.yAxis != null;
}

function cartesianBrushableTypes(types: Set<string>): boolean {
  for (const t of types) {
    if (
      t === "line" ||
      t === "bar" ||
      t === "scatter" ||
      t === "effectScatter" ||
      t === "heatmap" ||
      t === "candlestick" ||
      t === "boxplot" ||
      t === "pictorialBar" ||
      t === "lines"
    ) {
      return true;
    }
  }
  return false;
}

function bumpGrid(
  grid: EChartsOption["grid"],
  opts: { minBottom?: number; minRight?: number },
): EChartsOption["grid"] {
  const bumpOne = (g: Record<string, unknown> | undefined) => {
    if (!g) {
      const next: Record<string, unknown> = { containLabel: true };
      if (opts.minBottom != null) next.bottom = opts.minBottom;
      if (opts.minRight != null) next.right = opts.minRight;
      return next;
    }
    const next = { ...g };
    if (opts.minBottom != null) {
      const b = next.bottom;
      if (typeof b === "number") next.bottom = Math.max(b, opts.minBottom);
      else if (b === undefined) next.bottom = opts.minBottom;
    }
    if (opts.minRight != null) {
      const r = next.right;
      if (typeof r === "number") next.right = Math.max(r, opts.minRight);
      else if (r === undefined) next.right = opts.minRight;
    }
    return next;
  };
  if (grid == null) return bumpOne(undefined);
  if (Array.isArray(grid)) return grid.map((g) => bumpOne(g as Record<string, unknown>));
  return bumpOne(grid as Record<string, unknown>);
}

/** Restore only — placed away from sunburst/treemap center and funnel necks. */
function cornerRestoreToolbox(): EChartsOption["toolbox"] {
  return {
    id: TB_PATCHED,
    right: 8,
    bottom: 8,
    orient: "horizontal",
    itemSize: 15,
    itemGap: 6,
    show: true,
    z: 10,
    iconStyle: { borderColor: "rgba(255,255,255,0.28)" },
    emphasis: { iconStyle: { borderColor: "rgba(255,255,255,0.55)" } },
    feature: { restore: {} },
  };
}

function wantsRadialOrFlowToolbox(types: Set<string>): boolean {
  return [...types].some((t) =>
    ["pie", "funnel", "gauge", "radar", "sankey", "graph", "tree"].includes(t),
  );
}

/** Sunburst / treemap: drill + roam — no cartesian zoom/brush; avoid top-left toolbox overlap. */
function isHierarchicalPartition(types: Set<string>): boolean {
  return types.has("sunburst") || types.has("treemap");
}

/** Adds zoom/brush/toolbox and drill behaviour where the series type allows it. */
export function withInteractiveDefaults(opt: EChartsOption): EChartsOption {
  const series = normalizeSeries(opt.series);
  const types = new Set(series.map((s) => (typeof s.type === "string" ? s.type : "")));
  const builtCart = hasCartesianGrid(opt) && types.size > 0;
  const builtSingle = opt.singleAxis != null && opt.xAxis == null;
  const hierarchical =
    !builtCart && !builtSingle && opt.parallelAxis == null && isHierarchicalPartition(types);

  const out: EChartsOption = { ...opt };

  if (series.length > 0) {
    out.series = series.map((raw) => {
      const s = raw;
      const ty = typeof s.type === "string" ? s.type : "";
      if (ty === "sunburst") {
        return { ...s, nodeClick: s.nodeClick ?? "zoomToNode" };
      }
      if (ty === "treemap") {
        return {
          ...s,
          roam: s.roam !== false,
          nodeClick: s.nodeClick ?? "zoomToNode",
        };
      }
      if (ty === "tree") {
        return {
          ...s,
          roam: s.roam !== false,
          expandAndCollapse: s.expandAndCollapse !== false,
        };
      }
      if (ty === "pie") {
        return {
          ...s,
          selectedMode: (s.selectedMode as string | boolean | undefined) ?? "single",
          selectedOffset: typeof s.selectedOffset === "number" ? s.selectedOffset : 8,
        };
      }
      return raw;
    }) as EChartsOption["series"];
  }

  if (builtCart) {
    const xAxis = out.xAxis;
    const xCount = Array.isArray(xAxis) ? xAxis.length : xAxis ? 1 : 0;
    const xAxisIndex = xCount <= 1 ? 0 : (xAxis as unknown[]).map((_, i) => i);

    const dzIn = {
      id: DZ_IN_ID,
      type: "inside" as const,
      xAxisIndex,
      filterMode: "none" as const,
    };
    const dzSl = {
      id: DZ_SL_ID,
      type: "slider" as const,
      height: 22,
      bottom: 6,
      xAxisIndex,
      filterMode: "none" as const,
    };
    out.dataZoom = [
      ...stripOurDataZoom(out.dataZoom),
      dzIn,
      dzSl,
    ] as EChartsOption["dataZoom"];

    const brushable = cartesianBrushableTypes(types);
    const prevTb = firstToolbox(out.toolbox);
    const prevFeat = (prevTb.feature ?? {}) as Record<string, unknown>;
    out.toolbox = {
      ...prevTb,
      id: TB_PATCHED,
      orient: "vertical",
      right: 6,
      top: 52,
      itemSize: 15,
      itemGap: 6,
      iconStyle: { borderColor: "rgba(255,255,255,0.28)" },
      emphasis: { iconStyle: { borderColor: "rgba(255,255,255,0.55)" } },
      feature: {
        ...prevFeat,
        dataZoom: {
          xAxisIndex: "all" as const,
          yAxisIndex: false as const,
          filterMode: "none" as const,
        },
        restore: {},
        ...(brushable
          ? {
              brush: {
                type: ["rect", "clear"] as ("rect" | "clear")[],
              },
            }
          : {}),
      },
    };

    if (brushable) {
      const prevBr = typeof out.brush === "object" && out.brush ? out.brush : {};
      out.brush = {
        ...prevBr,
        toolbox: ["rect", "clear"],
        xAxisIndex: xCount <= 1 ? 0 : xAxisIndex,
        brushLink: "none",
        seriesIndex: "all",
        throttleType: "debounce",
        throttleDelay: 120,
        inBrush: { opacity: 1 },
        outOfBrush: { opacity: 0.22 },
      };
    } else {
      delete out.brush;
    }

    out.grid = bumpGrid(out.grid, { minBottom: 52, minRight: 52 });
  } else if (builtSingle) {
    out.dataZoom = [
      ...stripOurDataZoom(out.dataZoom),
      {
        id: DZ_IN_ID,
        type: "inside",
        singleAxisIndex: 0,
        filterMode: "weakFilter" as const,
      },
      {
        id: DZ_SL_ID,
        type: "slider",
        singleAxisIndex: 0,
        height: 22,
        bottom: 6,
        filterMode: "weakFilter" as const,
      },
    ] as EChartsOption["dataZoom"];
    const prevTb = firstToolbox(out.toolbox);
    const prevFeat = (prevTb.feature ?? {}) as Record<string, unknown>;
    out.toolbox = {
      ...prevTb,
      id: TB_PATCHED,
      orient: "horizontal",
      right: 10,
      bottom: 34,
      itemSize: 14,
      feature: { ...prevFeat, restore: {} },
    };
    delete out.brush;
  } else if (out.parallelAxis != null) {
    out.dataZoom = [] as EChartsOption["dataZoom"];
    const prevTb = firstToolbox(out.toolbox);
    const prevFeat = (prevTb.feature ?? {}) as Record<string, unknown>;
    out.toolbox = {
      ...prevTb,
      id: TB_PATCHED,
      orient: "vertical",
      right: 8,
      top: 48,
      itemSize: 14,
      feature: { ...prevFeat, restore: {} },
    };
    delete out.brush;
  } else if (hierarchical) {
    out.dataZoom = [] as EChartsOption["dataZoom"];
    delete out.brush;
    out.toolbox = cornerRestoreToolbox();
  } else if (types.size > 0 && wantsRadialOrFlowToolbox(types)) {
    out.dataZoom = [] as EChartsOption["dataZoom"];
    delete out.brush;
    out.toolbox = cornerRestoreToolbox();
  } else {
    const cleared = stripOurDataZoom(opt.dataZoom);
    out.dataZoom = (cleared.length > 0 ? cleared : []) as EChartsOption["dataZoom"];
  }

  if (out.tooltip == null || typeof out.tooltip === "object") {
    const t = (out.tooltip ?? {}) as Record<string, unknown>;
    const trigger = (t.trigger as "axis" | "item" | "none" | undefined) ?? (builtCart ? "axis" : "item");
    const nextTip: Record<string, unknown> = { ...t, trigger };
    if (builtCart && !t.axisPointer) {
      nextTip.axisPointer = { type: "cross" };
    } else {
      delete nextTip.axisPointer;
    }
    out.tooltip = nextTip as EChartsOption["tooltip"];
  }

  return out;
}
