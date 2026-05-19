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
  let chart: ECharts | null = $state(null);
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

  /** Mount once per container; theme changes re-init without reading `mergedOption`. */
  $effect(() => {
    const node = el;
    const theme = chartTheme;
    if (!node) return;

    chart?.off("click");
    chart?.off("brushSelected");
    chart?.off("datazoom");
    chart?.dispose();

    const c = mountChart(node, theme);
    chart = c;
    if (latestOption) {
      c.setOption(latestOption, { notMerge: false, lazyUpdate: true });
    }

    const ro = new ResizeObserver(() => c.resize());
    ro.observe(node);

    return () => {
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
    if (!c || !opt) return;
    c.setOption(opt, {
      notMerge: false,
      lazyUpdate: true,
    });
  });

  $effect(() => {
    latestOption = mergedOption;
    applyChartOption();
  });
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
