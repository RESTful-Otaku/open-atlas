<script lang="ts">
  import FullscreenChartShell from "../viz/FullscreenChartShell.svelte";
  import {
    memoHubHeatmap,
    memoHubRiskBars,
    memoHubShare,
    memoHubTimeline,
  } from "../chart-cache";
  import { dashboardData } from "../dashboard-revision.svelte";
  import { dashboard } from "../state.svelte";
  import {
    hubActivityHeatmap,
    hubDomainRiskBars,
    hubEventSharePie,
    hubUtcHourIngestLine,
  } from "./hub-charts";

  const riskOption = $derived.by(() => {
    void dashboardData.domainsRevision;
    return memoHubRiskBars(dashboard.domainState, () =>
      hubDomainRiskBars(dashboard.domainState),
    );
  });
  const heatOption = $derived.by(() => {
    void dashboardData.revision;
    return memoHubHeatmap(dashboard.events, () =>
      hubActivityHeatmap(dashboard.events, dashboard.eventHourBuckets),
    );
  });
  const shareOption = $derived.by(() => {
    void dashboardData.revision;
    return memoHubShare(dashboard.events, () =>
      hubEventSharePie(dashboard.events),
    );
  });
  const lineOption = $derived.by(() => {
    void dashboardData.revision;
    return memoHubTimeline(dashboard.events, () =>
      hubUtcHourIngestLine(dashboard.events, dashboard.eventHourBuckets),
    );
  });
  const hasEvents = $derived.by(() => {
    void dashboardData.revision;
    return dashboard.events.length > 0;
  });
</script>

<section class="hub-overview" aria-label="Cross-domain overview charts">
  <div class="hub-grid-top">
    <article class="hub-chart-card">
      <h2 class="hub-chart-h">Risk by domain</h2>
      <p class="hub-chart-meta">
        Live risk index from world-state — highest pressure at the top. Click a tile
        below for the domain desk.
      </p>
      <FullscreenChartShell
        title="Risk by domain"
        option={riskOption}
        embedClass="hub-echart"
      />
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
      <FullscreenChartShell
        title="Activity by domain × hour (UTC)"
        option={heatOption}
        embedClass="hub-echart hub-echart-tall"
      />
    </article>
  </div>
  <div class="hub-grid-bottom">
    <article class="hub-chart-card">
      <h2 class="hub-chart-h">Event mix (buffer)</h2>
      <p class="hub-chart-meta">
        Share of events per domain in the live ring — complements risk bars above.
      </p>
      <FullscreenChartShell
        title="Event mix (buffer)"
        option={shareOption}
        embedClass="hub-echart hub-echart-pie"
      />
    </article>
    <article class="hub-chart-card">
      <h2 class="hub-chart-h">Ingest tempo by UTC hour</h2>
      <p class="hub-chart-meta">
        Events bucketed into the hour of their timestamp (current buffer only).
      </p>
      <FullscreenChartShell
        title="Ingest tempo by UTC hour"
        option={lineOption}
        embedClass="hub-echart"
      />
    </article>
  </div>
</section>

<style>
  .hub-overview {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
    min-width: 0;
  }
  .hub-grid-top,
  .hub-grid-bottom {
    display: grid;
    grid-template-columns: minmax(18rem, 1fr) minmax(22rem, 1.5fr);
    gap: var(--space-4);
    min-width: 0;
  }
  @media (max-width: 960px) {
    .hub-grid-top,
    .hub-grid-bottom {
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
  :global(.hub-echart-tall) {
    --echarts-min-height: 260px;
    --echarts-height: 280px;
  }
  :global(.hub-echart-pie) {
    --echarts-min-height: 240px;
    --echarts-height: 260px;
  }
</style>
