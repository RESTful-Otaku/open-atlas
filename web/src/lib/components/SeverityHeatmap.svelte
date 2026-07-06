<script lang="ts">
  import { onMount } from "svelte";
  import { debounce } from "../debounce-raf";

  import { initChart, type ECharts } from "../echarts";
  import { onThemeChange } from "../theme-events";
  import {
    chartGridLine,
    chartTextMuted,
    tooltipBase,
  } from "../viz/chart-theme";
  import { dashboardData } from "../dashboard-revision.svelte";
  import { dashboard } from "../state.svelte";
  import { DOMAIN_CATALOG } from "../colors";
  import type { UiEvent } from "../types";

  import Panel from "./Panel.svelte";

  const { span = 6 }: { span?: number } = $props();

  const BUCKETS = 24;

  interface BucketRange {
    start: number;
    end: number;
    labels: string[];
  }

  function computeBuckets(events: readonly UiEvent[]): BucketRange {
    if (events.length === 0) {
      const now = Date.now();
      return { start: now, end: now, labels: Array(BUCKETS).fill("") };
    }
    const times = events
      .map((event) => Date.parse(event.timestamp))
      .filter((t) => Number.isFinite(t));
    if (times.length === 0) {
      const now = Date.now();
      return { start: now, end: now, labels: Array(BUCKETS).fill("") };
    }
    const start = Math.min(...times);
    const end = Math.max(...times);
    const span = Math.max(end - start, 1);
    const step = span / BUCKETS;
    const labels: string[] = [];
    for (let i = 0; i < BUCKETS; i += 1) {
      const at = new Date(start + step * i + step / 2);
      labels.push(
        at.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    }
    return { start, end, labels };
  }

  function buildGrid(
    events: readonly UiEvent[],
  ): {
    rows: string[];
    cols: string[];
    data: [number, number, number][];
  } {
    const rows = DOMAIN_CATALOG.map((d) => d.label);
    const rowIndex = new Map<string, number>(
      DOMAIN_CATALOG.map((d, i) => [d.id, i]),
    );

    const bucket = computeBuckets(events);
    const totals = Array.from({ length: DOMAIN_CATALOG.length }, () =>
      new Array<number>(BUCKETS).fill(0),
    );
    const counts = Array.from({ length: DOMAIN_CATALOG.length }, () =>
      new Array<number>(BUCKETS).fill(0),
    );

    const span = Math.max(bucket.end - bucket.start, 1);

    for (const event of events) {
      const ts = Date.parse(event.timestamp);
      if (!Number.isFinite(ts)) continue;
      const row = rowIndex.get(event.domain);
      if (row === undefined) continue;
      let col = Math.floor(((ts - bucket.start) / span) * BUCKETS);
      if (col < 0) col = 0;
      if (col >= BUCKETS) col = BUCKETS - 1;
      const tRow = totals[row];
      const cRow = counts[row];
      if (tRow) tRow[col] = (tRow[col] ?? 0) + event.severity_score;
      if (cRow) cRow[col] = (cRow[col] ?? 0) + 1;
    }

    const data: [number, number, number][] = [];
    for (let r = 0; r < DOMAIN_CATALOG.length; r += 1) {
      for (let c = 0; c < BUCKETS; c += 1) {
        const count = counts[r]?.[c] ?? 0;
        const avg = count === 0 ? 0 : (totals[r]?.[c] ?? 0) / count;
        data.push([c, r, Number(avg.toFixed(3))]);
      }
    }
    return { rows, cols: bucket.labels, data };
  }

  let container: HTMLDivElement | undefined = $state();
  let chart: ECharts | null = $state(null);

  const grid = $derived.by(() => {
    void dashboardData.revision;
    return buildGrid(dashboard.events);
  });

  onMount(() => {
    if (!container) return;
    chart = initChart(container);
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        ...tooltipBase,
        position: "top",
        formatter: (p: { value: [number, number, number]; data: [number, number, number] }) => {
          const [col, row, sev] = p.value;
          const cols = (chart?.getOption() as { xAxis?: { data: string[] }[] })
            ?.xAxis?.[0]?.data ?? [];
          const rows = (chart?.getOption() as { yAxis?: { data: string[] }[] })
            ?.yAxis?.[0]?.data ?? [];
          const colLabel = cols[col] ?? "";
          const rowLabel = rows[row] ?? "";
          return `<strong>${rowLabel}</strong><br/>${colLabel} · severity ${sev.toFixed(2)}`;
        },
      },
      grid: {
        left: 80,
        right: 24,
        top: 12,
        bottom: 48,
      },
      xAxis: {
        type: "category",
        data: [] as string[],
        splitArea: { show: false },
        axisLine: { lineStyle: { color: chartGridLine() } },
        axisTick: { show: false },
        axisLabel: {
          color: chartTextMuted(),
          fontSize: 10,
          interval: 2,
        },
      },
      yAxis: {
        type: "category",
        data: [] as string[],
        splitArea: { show: false },
        axisLine: { lineStyle: { color: chartGridLine() } },
        axisTick: { show: false },
        axisLabel: {
          color: chartTextMuted(),
          fontSize: 11,
        },
      },
      visualMap: {
        min: 0,
        max: 1,
        calculable: false,
        orient: "horizontal",
        left: "center",
        bottom: 4,
        text: ["high", "low"],
        textStyle: { color: chartTextMuted(), fontSize: 10 },
        inRange: {
          color: [
            "rgba(34, 211, 238, 0.04)",
            "rgba(34, 211, 238, 0.45)",
            "rgba(167, 139, 250, 0.65)",
            "rgba(245, 158, 11, 0.8)",
            "rgba(239, 68, 68, 0.95)",
          ],
        },
      },
      series: [
        {
          type: "heatmap",
          data: [] as [number, number, number][],
          label: { show: false },
          progressive: 1000,
          emphasis: {
            itemStyle: { shadowColor: "rgba(255,255,255,0.35)", shadowBlur: 8 },
          },
        },
      ],
    });

    const resize = () => chart?.resize();
    window.addEventListener("resize", resize);
    const offTheme = onThemeChange(() => {
      chart?.setOption({
        tooltip: { ...tooltipBase, position: "top" },
        xAxis: {
          axisLine: { lineStyle: { color: chartGridLine() } },
          axisLabel: { color: chartTextMuted(), fontSize: 10, interval: 2 },
        },
        yAxis: {
          axisLine: { lineStyle: { color: chartGridLine() } },
          axisLabel: { color: chartTextMuted(), fontSize: 11 },
        },
        visualMap: { textStyle: { color: chartTextMuted(), fontSize: 10 } },
      });
    });
    return () => {
      applyGridToChart.cancel();
      offTheme();
      window.removeEventListener("resize", resize);
      chart?.dispose();
      chart = null;
    };
  });

  const applyGridToChart = debounce(() => {
    const c = chart;
    if (!c) return;
    c.setOption({
      xAxis: { data: grid.cols },
      yAxis: { data: grid.rows },
      series: [{ type: "heatmap", data: grid.data }],
    });
  }, 250);

  $effect(() => {
    void dashboardData.revision;
    applyGridToChart();
  });
</script>

<Panel title="Severity heatmap" {span}>
  {#snippet header()}
    <span>domain × time · 24 buckets</span>
  {/snippet}
  <div bind:this={container} class="chart" aria-label="Severity heatmap"></div>
</Panel>

<style>
  .chart {
    width: 100%;
    height: 420px;
  }
</style>
