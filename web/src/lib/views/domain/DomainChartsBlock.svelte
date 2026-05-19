<script lang="ts">
  import EChartsPanel from "../../viz/EChartsPanel.svelte";
  import { memoDomainDeskPack } from "../../chart-cache";
  import { dashboardData } from "../../dashboard-revision.svelte";
  import type { DeskProfile } from "./domain-desk-types";
  import { deskChartPack } from "./domain-desk-charts";
  import type { DataMode } from "../../data-source-copy";
  import type { UiEvent, UiWorldState } from "../../types";

  interface Props {
    profile: DeskProfile;
    domainId: string;
    accent: string;
    events: readonly UiEvent[];
    severityHistory: readonly number[];
    state?: UiWorldState;
    dataMode?: DataMode;
  }
  const {
    profile,
    domainId,
    accent,
    events,
    severityHistory,
    state,
    dataMode = "live",
  }: Props = $props();

  const pack = $derived.by(() => {
    void dashboardData.revision;
    void dashboardData.domainsRevision;
    return memoDomainDeskPack(`${profile}:${domainId}`, () =>
      deskChartPack(profile, {
        domainId,
        accent,
        events,
        severityHistory,
        state,
        dataMode,
      }),
    );
  });
</script>

<section class="desk-charts" aria-label="Analytic charts for this domain">
  <div class="desk-charts-head">
    <h3 class="desk-charts-h">Analytic panels</h3>
    <ul class="desk-charts-notes">
      {#each pack.notes as line (line)}
        <li>{line}</li>
      {/each}
    </ul>
  </div>
  <div class="desk-charts-grid">
    <article class="chart-card">
      <h4 class="chart-card-h">{pack.primaryTitle}</h4>
      <EChartsPanel option={pack.primary} class="desk-echart" />
    </article>
    {#if pack.secondary}
      <article class="chart-card">
        <h4 class="chart-card-h">{pack.secondaryTitle ?? "Secondary"}</h4>
        <EChartsPanel option={pack.secondary} class="desk-echart" />
      </article>
    {/if}
    {#if pack.tertiary}
      <article class="chart-card">
        <h4 class="chart-card-h">{pack.tertiaryTitle ?? "Supporting view"}</h4>
        <EChartsPanel option={pack.tertiary} class="desk-echart" />
      </article>
    {/if}
  </div>
</section>

<style>
  .desk-charts {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .desk-charts-head {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .desk-charts-h {
    margin: 0;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
  .desk-charts-notes {
    margin: 0;
    padding-left: 1rem;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--text-3);
  }
  .desk-charts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: var(--space-3);
  }
  .chart-card {
    padding: var(--space-3);
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    min-width: 0;
  }
  .chart-card-h {
    margin: 0 0 0.35rem 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-2);
  }
  :global(.desk-echart) {
    --echarts-min-height: 200px;
    --echarts-height: 220px;
  }
</style>
