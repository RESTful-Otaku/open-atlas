<script lang="ts">
  import { onMount } from "svelte";
  import { initChart, type ECharts } from "../echarts";
  import { dashboard, matchesSelectedDomain } from "../state.svelte";
  import { domainColor } from "../colors";
  import { shortId } from "../format";
  import type { UiCausalEdge, UiEvent } from "../types";

  import Panel from "./Panel.svelte";

  const { span = 6 }: { span?: number } = $props();

  let container: HTMLDivElement | undefined = $state();
  let chart: ECharts | null = null;

  interface Node {
    id: string;
    name: string;
    value: number;
    symbolSize: number;
    itemStyle: { color: string };
    category: string;
  }

  interface Link {
    source: string;
    target: string;
    value: number;
    lineStyle: { width: number; opacity: number };
  }

  function buildGraph(
    events: readonly UiEvent[],
    edges: readonly UiCausalEdge[],
  ): { nodes: Node[]; links: Link[]; categories: { name: string }[] } {
    const eventById = new Map<string, UiEvent>();
    for (const event of events) {
      eventById.set(event.id, event);
    }

    const visibleEdges = edges.filter((edge) => {
      const src = eventById.get(edge.source_event_id);
      const dst = eventById.get(edge.target_event_id);
      return (
        (src !== undefined && matchesSelectedDomain(src.domain)) ||
        (dst !== undefined && matchesSelectedDomain(dst.domain))
      );
    });

    const degree = new Map<string, number>();
    for (const edge of visibleEdges) {
      degree.set(
        edge.source_event_id,
        (degree.get(edge.source_event_id) ?? 0) + 1,
      );
      degree.set(
        edge.target_event_id,
        (degree.get(edge.target_event_id) ?? 0) + 1,
      );
    }

    const categorySet = new Set<string>();
    const nodes: Node[] = [];
    for (const [id, deg] of degree) {
      const event = eventById.get(id);
      const domain = event?.domain ?? "unknown";
      categorySet.add(domain);
      nodes.push({
        id,
        name: shortId(id),
        value: deg,
        symbolSize: Math.min(8 + deg * 3, 28),
        itemStyle: { color: domainColor(domain) },
        category: domain,
      });
    }

    const links: Link[] = visibleEdges.map((edge) => ({
      source: edge.source_event_id,
      target: edge.target_event_id,
      value: edge.influence_score,
      lineStyle: {
        width: Math.max(1, edge.influence_score * 3),
        opacity: 0.45,
      },
    }));

    const categories = Array.from(categorySet)
      .sort()
      .map((name) => ({ name }));
    return { nodes, links, categories };
  }

  const graph = $derived(
    buildGraph(dashboard.events, dashboard.recentCausalEdges),
  );

  onMount(() => {
    if (!container) return;
    chart = initChart(container);
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        confine: true,
        backgroundColor: "#101013",
        borderColor: "rgba(255,255,255,0.1)",
        textStyle: { color: "#f4f4f5", fontFamily: "Inter, sans-serif" },
      },
      legend: [{ show: false }],
      animationDurationUpdate: 400,
      animationEasingUpdate: "cubicOut",
      series: [
        {
          type: "graph",
          layout: "force",
          roam: true,
          draggable: true,
          label: {
            show: false,
          },
          emphasis: {
            focus: "adjacency",
            lineStyle: { width: 3 },
          },
          force: {
            repulsion: 80,
            edgeLength: [40, 90],
            gravity: 0.08,
            layoutAnimation: true,
          },
          edgeSymbol: ["none", "arrow"],
          edgeSymbolSize: [0, 6],
          lineStyle: { color: "rgba(148,163,184,0.45)", curveness: 0.12 },
          data: [],
          links: [],
          categories: [],
        },
      ],
    });

    const resize = () => chart?.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart?.dispose();
      chart = null;
    };
  });

  $effect(() => {
    if (!chart) return;
    chart.setOption(
      {
        series: [
          {
            data: graph.nodes,
            links: graph.links,
            categories: graph.categories,
          },
        ],
      },
      { replaceMerge: ["series"] } as never,
    );
  });

  const summary = $derived({
    edges: graph.links.length,
    nodes: graph.nodes.length,
  });
</script>

<Panel title="Causal graph" {span}>
  {#snippet header()}
    <span>{summary.nodes} nodes · {summary.edges} edges</span>
  {/snippet}

  <div bind:this={container} class="chart" aria-label="Causal graph"></div>
</Panel>

<style>
  .chart {
    width: 100%;
    height: 420px;
  }
</style>
