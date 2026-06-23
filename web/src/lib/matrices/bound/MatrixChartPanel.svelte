<script lang="ts">
  import { memoMatrixChart } from "../../chart-cache";
  import { dashboardData } from "../../dashboard-revision.svelte";
  import { dashboard } from "../../state.svelte";
  import { domainColor } from "../../colors";
  import FullscreenChartShell from "../../viz/FullscreenChartShell.svelte";
  import { setSelectedDomain } from "../../state.svelte";
  import { resolveDomainFromChartClick } from "../chart-click";
  import {
    matrixChartOption,
    type MatrixChartKind,
  } from "../matrix-charts";

  interface Props {
    domains: readonly string[];
    kind: MatrixChartKind;
    /** Domain id used for accent chrome (defaults to first scoped domain). */
    accentDomain?: string;
  }

  const {
    domains,
    kind,
    accentDomain = domains[0] ?? "geopolitics",
  }: Props = $props();

  const accent = $derived(domainColor(accentDomain));
  const fullscreenTitle = $derived(
    `Matrix · ${kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`,
  );
  const option = $derived.by(() => {
    void dashboardData.revision;
    void dashboardData.domainsRevision;
    return memoMatrixChart(
      `${kind}:${[...domains].sort().join(",")}`,
      () =>
        matrixChartOption(kind, {
        events: dashboard.events,
        domainState: dashboard.domainState,
        domains,
        accent,
      }),
    );
  });

  function handleChartClick(raw: unknown): void {
    const id = resolveDomainFromChartClick(domains, raw);
    if (id) setSelectedDomain(id);
  }
</script>

<FullscreenChartShell
  title={fullscreenTitle}
  {option}
  embedClass="matrix-echart"
  onChartClick={handleChartClick}
/>

<style>
  :global(.matrix-echart) {
    --echarts-min-height: 200px;
    --echarts-height: 300px;
  }
</style>
