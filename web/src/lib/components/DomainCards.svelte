<script lang="ts">
  import { dashboard, matchesSelectedDomain } from "../state.svelte";
  import { domainColor, domainLabel } from "../colors";
  import { computeTrend, fmtFixed, trendGlyph, trendLabel } from "../format";
  import type { UiWorldState } from "../types";

  import Panel from "./Panel.svelte";
  import Sparkline from "./Sparkline.svelte";

  const { span = 8 }: { span?: number } = $props();

  const domains = $derived(
    Object.values(dashboard.domainState)
      .filter((entry) => matchesSelectedDomain(entry.domain))
      .sort((a, b) => b.risk_index - a.risk_index),
  );

  function historyFor(domain: string): readonly number[] {
    return dashboard.domainSeverityHistory[domain] ?? [];
  }

  function trendFor(entry: UiWorldState): "up" | "down" | "flat" | "insufficient-data" {
    return computeTrend(historyFor(entry.domain));
  }
</script>

<Panel title="Domain signals" {span} compact>
  {#snippet header()}
    <span>{domains.length} tracked</span>
  {/snippet}

  {#if domains.length === 0}
    <div class="empty-state">
      <strong>Awaiting first domain update</strong>
      Aggregates populate after the first few events per domain.
    </div>
  {:else}
    <div class="domain-grid">
      {#each domains as entry (entry.domain)}
        {@const color = domainColor(entry.domain)}
        {@const trend = trendFor(entry)}
        {@const history = historyFor(entry.domain)}
        <article class="domain-card" style="--card-accent: {color}">
          <div class="domain-card-head">
            <span class="domain-card-name">
              <span class="domain-dot" aria-hidden="true"></span>
              {domainLabel(entry.domain)}
            </span>
            <span class="trend-chip" data-trend={trend}>
              {trendGlyph(trend)} {trendLabel(trend)}
            </span>
          </div>

          <div class="domain-card-metric">
            <span class="big">{fmtFixed(entry.risk_index, 2)}</span>
            <span class="unit">Risk Index</span>
          </div>

          <dl class="domain-card-subgrid">
            <dt>Events</dt>
            <dd>{entry.event_count}</dd>
            <dt>Avg severity</dt>
            <dd>{fmtFixed(entry.avg_severity, 2)}</dd>
          </dl>

          <div class="domain-spark">
            <Sparkline
              values={history}
              color={color}
              height={36}
              width={240}
            />
          </div>
        </article>
      {/each}
    </div>
  {/if}
</Panel>

<style>
  .domain-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-3);
  }

  .domain-card {
    position: relative;
    padding: var(--space-4);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    overflow: hidden;
    transition:
      border-color var(--motion-fast) var(--ease),
      transform var(--motion-fast) var(--ease);
  }
  .domain-card:hover {
    border-color: var(--border-2);
    transform: translateY(-1px);
  }
  .domain-card::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--card-accent, var(--accent));
  }

  .domain-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .domain-card-name {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-1);
  }

  .domain-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--card-accent, var(--accent));
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--card-accent) 18%, transparent);
  }

  .trend-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 500;
    padding: 2px 7px;
    border-radius: var(--radius-pill);
    background: var(--overlay);
    color: var(--text-2);
    border: 1px solid var(--border-1);
  }
  .trend-chip[data-trend="up"] {
    color: var(--sev-mid);
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.2);
  }
  .trend-chip[data-trend="down"] {
    color: var(--sev-low);
    background: rgba(34, 197, 94, 0.08);
    border-color: rgba(34, 197, 94, 0.2);
  }
  .trend-chip[data-trend="flat"] {
    color: var(--text-2);
  }

  .domain-card-metric {
    margin-top: var(--space-3);
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-variant-numeric: tabular-nums;
  }
  .domain-card-metric .big {
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text-1);
  }
  .domain-card-metric .unit {
    font-size: 11px;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .domain-card-subgrid {
    margin-top: var(--space-2);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 12px;
    font-size: 12px;
    color: var(--text-2);
  }
  .domain-card-subgrid dt {
    color: var(--text-3);
  }
  .domain-card-subgrid dd {
    margin: 0;
    color: var(--text-1);
    font-variant-numeric: tabular-nums;
  }

  .domain-spark {
    margin-top: var(--space-3);
    height: 36px;
  }

  .empty-state {
    padding: var(--space-8) var(--space-4);
    text-align: center;
    color: var(--text-3);
    font-size: 13px;
  }
  .empty-state strong {
    display: block;
    color: var(--text-2);
    font-weight: 500;
    margin-bottom: 4px;
  }
</style>
