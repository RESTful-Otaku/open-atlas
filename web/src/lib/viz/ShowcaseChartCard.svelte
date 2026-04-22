<script lang="ts">
  import EChartsPanel from "./EChartsPanel.svelte";
  import type { ShowcaseEntry } from "./showcase-options";

  const { entry }: { entry: ShowcaseEntry } = $props();
  const option = $derived(entry.build());
</script>

<article class="viz-card">
  <header class="viz-card-h">
    <h3 class="viz-card-title">{entry.title}</h3>
    <p class="viz-card-sub">{entry.subtitle}</p>
    <code class="viz-card-id">{entry.id}</code>
  </header>
  <div class="viz-card-chart">
    <EChartsPanel {option} class="viz-chart" />
  </div>
</article>

<style>
  .viz-card {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 24rem;
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    background: var(--bg-2);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .viz-card-h {
    padding: var(--space-4) var(--space-4) 0;
    flex-shrink: 0;
  }
  .viz-card-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-1);
  }
  .viz-card-sub {
    margin: 4px 0 0;
    font-size: 11px;
    color: var(--text-3);
  }
  .viz-card-id {
    display: block;
    margin: var(--space-2) 0 0;
    font-size: 10px;
    color: var(--text-3);
    opacity: 0.8;
  }
  .viz-card-chart {
    flex: 1 1 auto;
    min-height: 320px;
    min-width: 0;
    padding: var(--space-3) var(--space-3) var(--space-4);
    display: flex;
    flex-direction: column;
  }
  :global(.viz-chart) {
    --echarts-min-height: 288px;
    /* Fill stretched grid row; width already 100% on host */
    --echarts-height: 100%;
    flex: 1 1 auto;
    min-height: 0;
  }
</style>
