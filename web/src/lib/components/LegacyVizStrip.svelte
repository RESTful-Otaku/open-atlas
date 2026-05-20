<!--
  Compact samples from the `/viz` gallery so the Legacy overview demonstrates
  additional ECharts families without navigating away.
-->
<script lang="ts">
  import EChartsPanel from "../viz/EChartsPanel.svelte";
  import { SHOWCASE_ECHARTS } from "../viz/showcase-options";

  /** Preset ids from showcase-options — gauge, funnel, donut, radar. */
  const stripIds = ["gauge", "funnel", "donut", "radar"] as const;

  const entries = stripIds
    .map((id) => SHOWCASE_ECHARTS.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => e !== undefined);
</script>

<section class="lvs" aria-label="ECharts samples">
  <header class="lvs-head">
    <h2 class="lvs-title">Visualization samples</h2>
    <p class="lvs-meta">
      Subset of the <a href="#/viz">Visualizations</a> gallery — gauge, funnel,
      donut, and radar presets.
    </p>
  </header>
  <div class="lvs-grid">
    {#each entries as entry (entry.id)}
      <article class="lvs-cell">
        <h3 class="lvs-card-title">{entry.title}</h3>
        <p class="lvs-card-sub">{entry.subtitle}</p>
        <div class="lvs-chart">
          <EChartsPanel option={entry.build()} class="lvs-echart" />
        </div>
      </article>
    {/each}
  </div>
</section>

<style>
  .lvs {
    min-width: 0;
    padding: var(--space-3);
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
  }
  .lvs-head {
    margin-bottom: var(--space-3);
  }
  .lvs-title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-1);
  }
  .lvs-meta {
    margin: 0.35rem 0 0;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--text-3);
  }
  .lvs-meta a {
    color: var(--accent);
  }
  .lvs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space-3);
    min-width: 0;
  }
  .lvs-cell {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .lvs-card-title {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-2);
  }
  .lvs-card-sub {
    margin: 0;
    font-size: 0.65rem;
    color: var(--text-3);
  }
  .lvs-chart {
    flex: 1;
    min-height: 200px;
    min-width: 0;
  }
  :global(.lvs-echart) {
    --echarts-min-height: 200px;
    --echarts-height: 220px;
    width: 100%;
  }
</style>
