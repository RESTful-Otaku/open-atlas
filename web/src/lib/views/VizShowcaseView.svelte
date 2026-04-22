<!--
  Development gallery: ECharts series families + MapLibre geo overlays. Uses
  static `showcase-datasets` only — no SpacetimeDB traffic.
-->
<script lang="ts">
  import { ChartSpline } from "@lucide/svelte";

  import GeoVizMap from "../viz/GeoVizMap.svelte";
  import ShowcaseChartCard from "../viz/ShowcaseChartCard.svelte";
  import { SHOWCASE_ECHARTS } from "../viz/showcase-options";
</script>

<div class="viz-page">
  <header class="viz-hero">
    <div class="viz-hero-text">
      <div class="viz-kicker">
        <ChartSpline size={14} strokeWidth={1.75} aria-hidden="true" />
        Visualization system
      </div>
      <h1 class="viz-h1">Charts, graphs, and maps</h1>
      <p class="viz-lead">
        This page registers modular EChart types (bars, pies, treemaps, Sankey, graphs, …) and
        MapLibre layers (heat, points, line routes) on a dark basemap, with realistic dummy logistics /
        traffic data. Use it to verify rendering without live APIs.
      </p>
    </div>
  </header>

  <div class="viz-body">
    <section
      class="viz-section viz-section-geo"
      id="geo"
      aria-labelledby="geo-heading"
    >
      <h2 id="geo-heading" class="viz-h2">Geo · globe / map overlays</h2>
      <p class="viz-section-desc">
        MapLibre GL 3D globe and CARTO dark vector (WebGL, not a three.js model). Heat cluster, circles, routes,
        and a pink dashed synthetic LEO track. Same stack as the main dashboard map.
      </p>
      <GeoVizMap class="viz-geo-map" />
    </section>

    <section class="viz-section" id="charts" aria-labelledby="charts-heading">
      <h2 id="charts-heading" class="viz-h2">ECharts gallery</h2>
      <p class="viz-section-desc">
        Each card is a self-contained <code>option</code> you can lift into a matrix panel or dashboard tile.
      </p>
      <div class="viz-grid">
        {#each SHOWCASE_ECHARTS as entry (entry.id)}
          <ShowcaseChartCard {entry} />
        {/each}
      </div>
    </section>
  </div>
</div>

<style>
  .viz-page {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    gap: var(--space-6);
    padding: var(--space-5) var(--space-5) var(--space-8);
  }
  .viz-hero {
    flex: 0 0 auto;
    border-bottom: 1px solid var(--border-1);
    padding-bottom: var(--space-5);
  }
  .viz-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--space-6);
    min-width: 0;
    min-height: 0;
    width: 100%;
    align-items: stretch;
  }
  .viz-body > :global(.viz-section) {
    width: 100%;
    min-width: 0;
  }
  .viz-section-geo {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    width: 100%;
  }
  :global(.viz-geo-map) {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }
  .viz-kicker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-3);
    margin: 0 0 var(--space-2);
  }
  .viz-h1 {
    margin: 0 0 var(--space-2);
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text-1);
  }
  .viz-lead {
    margin: 0;
    max-width: min(70ch, 100%);
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-2);
  }
  .viz-section-desc {
    margin: 0 0 var(--space-4);
    max-width: min(78ch, 100%);
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-3);
  }
  .viz-h2 {
    margin: 0 0 var(--space-1);
    font-size: 16px;
    font-weight: 600;
    color: var(--text-1);
  }
  .viz-section-desc code,
  .viz-lead :global(code) {
    font-family: var(--font-mono);
    font-size: 0.92em;
    color: var(--text-2);
  }
  /**
   * Wide column minimums + generous gap so chart toolbars, sliders, and
   * legends do not collide; `min-width: 0` keeps tracks shrinkable in flex.
   */
  .viz-grid {
    display: grid;
    width: 100%;
    min-width: 0;
    grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
    gap: var(--space-5);
    align-items: stretch;
  }
  .viz-grid > :global(*) {
    min-width: 0;
  }
  @media (min-width: 1100px) {
    .viz-grid {
      grid-template-columns: repeat(auto-fill, minmax(26rem, 1fr));
      gap: var(--space-6);
    }
  }
  @media (min-width: 1600px) {
    .viz-grid {
      grid-template-columns: repeat(auto-fill, minmax(28rem, 1fr));
    }
  }
</style>
