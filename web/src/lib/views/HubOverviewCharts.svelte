<script lang="ts">
  import EChartsPanel from "../viz/EChartsPanel.svelte";
  import { memoHubHeatmap, memoHubRiskBars } from "../chart-cache";
  import { dashboardData } from "../dashboard-revision.svelte";
  import { dashboard } from "../state.svelte";
  import { hubActivityHeatmap, hubDomainRiskBars } from "./hub-charts";

  const riskOption = $derived.by(() => {
    void dashboardData.domainsRevision;
    return memoHubRiskBars(dashboard.domainState, () =>
      hubDomainRiskBars(dashboard.domainState),
    );
  });
  const heatOption = $derived.by(() => {
    void dashboardData.revision;
    return memoHubHeatmap(dashboard.events, () =>
      hubActivityHeatmap(dashboard.events),
    );
  });
  const hasEvents = $derived(dashboard.events.length > 0);
</script>

<section class="hub-overview" aria-label="Cross-domain overview charts">
  <article class="hub-chart-card">
    <h2 class="hub-chart-h">Risk by domain</h2>
    <p class="hub-chart-meta">
      Live risk index from world-state — highest pressure at the top. Click a tile
      below for the domain desk.
    </p>
    <EChartsPanel option={riskOption} class="hub-echart" />
  </article>
  <article class="hub-chart-card">
    <h2 class="hub-chart-h">Activity by domain × hour (UTC)</h2>
    <p class="hub-chart-meta">
      {#if hasEvents}
        Event counts in the current dashboard buffer — darker cells mean more arrivals
        in that hour.
      {:else}
        Waiting for events — start ingest with <code>./dev.sh up</code>.
      {/if}
    </p>
    <EChartsPanel option={heatOption} class="hub-echart hub-echart-wide" />
  </article>
</section>

<style>
  .hub-overview {
    display: grid;
    grid-template-columns: minmax(14rem, 1fr) minmax(18rem, 1.4fr);
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  @media (max-width: 960px) {
    .hub-overview {
      grid-template-columns: 1fr;
    }
  }
  .hub-chart-card {
    padding: var(--space-3);
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    min-width: 0;
  }
  .hub-chart-h {
    margin: 0 0 0.25rem 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-1);
  }
  .hub-chart-meta {
    margin: 0 0 0.5rem 0;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--text-3);
  }
  .hub-chart-meta code {
    font-size: 0.68rem;
  }
  :global(.hub-echart) {
    --echarts-min-height: 220px;
    --echarts-height: 240px;
  }
  :global(.hub-echart-wide) {
    --echarts-min-height: 260px;
    --echarts-height: 280px;
  }
</style>
