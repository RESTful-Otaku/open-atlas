<script lang="ts">
  import { onMount } from "svelte";
  import { initChart, type ECharts, type EChartsOption } from "../echarts";
  import { onThemeChange, readThemeFromDocument } from "../theme-events";
  import type { ThemeId } from "../theme.svelte";
  import { rafCoalesce } from "../debounce-raf";
  import { resolveEchartsTheme } from "./chart-theme";
  import { withInteractiveDefaults } from "./chart-interactivity";

  interface Props {
    option: EChartsOption;
    class?: string;
    /** When true (default), merge zoom/brush/drill chrome and use replaceMerge for stable updates. */
    interactive?: boolean;
    onChartClick?: (params: unknown) => void;
    onBrushSelected?: (params: unknown) => void;
    onDataZoom?: (params: unknown) => void;
  }

  const {
    option,
    class: className = "",
    interactive = true,
    onChartClick,
    onBrushSelected,
    onDataZoom,
  }: Props = $props();

  const mergedOption = $derived(
    interactive ? withInteractiveDefaults(option) : option,
  );

  let el: HTMLDivElement | undefined = $state();
  /** Plain let — must NOT be $state or the mount $effect loops (read + write chart). */
  let chart: ECharts | null = null;
  let chartTheme = $state<ThemeId>(readThemeFromDocument());

  const handlers = $state({
    onChartClick: undefined as Props["onChartClick"],
    onBrushSelected: undefined as Props["onBrushSelected"],
    onDataZoom: undefined as Props["onDataZoom"],
  });

  $effect(() => {
    handlers.onChartClick = onChartClick;
    handlers.onBrushSelected = onBrushSelected;
    handlers.onDataZoom = onDataZoom;
  });

  function mountChart(node: HTMLDivElement, theme: ThemeId): ECharts {
    const c = initChart(node, resolveEchartsTheme(theme));
    c.on("click", (p) => handlers.onChartClick?.(p));
    c.on("brushSelected", (p) => handlers.onBrushSelected?.(p));
    c.on("datazoom", (p) => handlers.onDataZoom?.(p));
    return c;
  }

  onMount(() => {
    const offTheme = onThemeChange((t) => {
      chartTheme = t;
    });
    return offTheme;
  });

  /** Mount once per container; theme changes re-init. Prior instance cleaned in effect return. */
  $effect(() => {
    const node = el;
    const theme = chartTheme;
    if (!node) return;

    const c = mountChart(node, theme);
    chart = c;
    if (latestOption) {
      c.setOption(latestOption, { notMerge: false, lazyUpdate: true });
    }

    let resizeRaf = 0;
    const ro = new ResizeObserver(() => {
      if (!node.isConnected) return;
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        if (node.isConnected) c.resize();
      });
    });
    ro.observe(node);

    return () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      applyChartOption.cancel();
      ro.disconnect();
      c.off("click");
      c.off("brushSelected");
      c.off("datazoom");
      c.dispose();
      if (chart === c) chart = null;
    };
  });

  let latestOption: EChartsOption | undefined;
  const applyChartOption = rafCoalesce(() => {
    const c = chart;
    const opt = latestOption;
    const node = el;
    if (!c || !opt || !node?.isConnected) return;
    c.setOption(opt, {
      notMerge: false,
      lazyUpdate: true,
    });
  });

  $effect(() => {
    latestOption = mergedOption;
    if (!el?.isConnected) return;
    applyChartOption();
  });

  /** For fullscreen shells: reset built-in zoom, brush, and toolbox drill state (data option unchanged). */
  export function resetInteractions(): void {
    const c = chart;
    if (!c) return;
    try {
      c.dispatchAction({ type: "restore" });
    } catch {
      /* no-op */
    }
    try {
      c.dispatchAction({
        type: "brush",
        command: "clear",
        areas: [],
      } as never);
    } catch {
      /* brush may be unavailable */
    }
  }

  export function getEchartsInstance(): ECharts | null {
    return chart;
  }
</script>

<div
  bind:this={el}
  class="echarts-host {className}"
  role={interactive ? "application" : "img"}
  aria-hidden={interactive ? undefined : true}
  aria-label={interactive ? "Interactive chart" : undefined}
></div>

<style>
  /**
   * Avoid `height: 100%` here: in flex/grid columns without a definite
   * block-size it resolves poorly and can fight parent overrides, causing
   * runaway vertical growth. Size with vars so callers can tune per context.
   */
  .echarts-host {
    width: 100%;
    box-sizing: border-box;
    min-height: var(--echarts-min-height, 220px);
    height: var(--echarts-height, 280px);
    flex-shrink: 0;
  }
</style>
