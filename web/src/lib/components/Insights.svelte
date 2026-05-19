<script lang="ts">
  import { dashboard, matchesSelectedDomain } from "../state.svelte";
  import { domainColor, domainLabel } from "../colors";
  import { trendLabel } from "../format";

  import Panel from "./Panel.svelte";

  const { span = 4 }: { span?: number } = $props();

  const insights = $derived(
    Object.values(dashboard.domainInsights)
      .filter((entry) => matchesSelectedDomain(entry.domain))
      .sort((a, b) => b.anomaly_count_recent - a.anomaly_count_recent),
  );
</script>

<Panel title="Generated insights" {span} scroll>
  {#snippet header()}
    <span>{insights.length} domains</span>
  {/snippet}

  {#if insights.length === 0}
    <div class="empty-state">
      <strong>No insights yet</strong>
      Domain narratives appear after ingest pushes events into SpacetimeDB
      (try <code>./dev.sh up</code> or demo mode in Settings).
    </div>
  {:else}
    <div class="insight-list">
      {#each insights as insight (insight.domain)}
        {@const color = domainColor(insight.domain)}
        <article class="insight" style="--card-accent: {color}">
          <header class="insight-head">
            <span class="insight-domain">
              <span
                class="domain-dot"
                aria-hidden="true"
                style="background: {color}"
              ></span>
              {domainLabel(insight.domain)}
            </span>
            <span class="trend-chip" data-trend={insight.trend}>
              {trendLabel(insight.trend)}
            </span>
          </header>
          <p class="insight-narrative">{insight.narrative}</p>
          <footer class="insight-meta">
            <span>{insight.anomaly_count_recent} anomaly events</span>
            <span class="dot" aria-hidden="true"></span>
            {#if insight.dominant_source}
              <span>
                Source
                {#if insight.source_link}
                  <a
                    href={insight.source_link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >{insight.dominant_source}</a>
                {:else}
                  {insight.dominant_source}
                {/if}
              </span>
            {/if}
            <span class="spacer"></span>
            <span class="mono">{insight.updated_at}</span>
          </footer>
        </article>
      {/each}
    </div>
  {/if}
</Panel>

<style>
  .insight-list {
    display: grid;
    gap: var(--space-3);
  }

  .insight {
    padding: var(--space-4);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
  }

  .insight-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .insight-domain {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-1);
  }

  .domain-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
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

  .insight-narrative {
    color: var(--text-1);
    font-size: 13.5px;
    line-height: 1.55;
  }

  .insight-meta {
    margin-top: var(--space-3);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    font-size: 11px;
    color: var(--text-3);
  }
  .insight-meta .dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--text-muted);
    margin: 0 2px;
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
