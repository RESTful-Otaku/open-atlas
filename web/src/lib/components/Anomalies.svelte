<script lang="ts">
  import { dashboardData } from "../dashboard-revision.svelte";
  import { dashboard, matchesSelectedDomain } from "../state.svelte";
  import { domainColor, domainLabel } from "../colors";
  import { fmtFixed, severityPercent, shortId } from "../format";

  import Panel from "./Panel.svelte";

  const { span = 6 }: { span?: number } = $props();

  const MAX_ROWS = 40;

  const rows = $derived.by(() => {
    void dashboardData.revision;
    return dashboard.recentSignals
      .filter((signal) => matchesSelectedDomain(signal.domain))
      .slice(-MAX_ROWS)
      .reverse();
  });
</script>

<Panel title="Anomaly indicators" {span} scroll flush>
  {#snippet header()}
    <span>{rows.length} active</span>
  {/snippet}

  {#if rows.length === 0}
    <div class="empty-state">
      <strong>All clear</strong>
      Anomalies appear when event severity ≥ 0.85. Simulators and hybrid ingest
      generate high-severity events over time.
    </div>
  {:else}
    <ul class="rows">
      {#each rows as signal, idx (`${signal.event_id}-${idx}`)}
        {@const color = domainColor(signal.domain)}
        {@const pct = severityPercent(signal.score)}
        <li class="row" style="--card-accent: {color}">
          <span class="row-dot" aria-hidden="true"></span>
          <span class="anomaly-score mono">{fmtFixed(signal.score, 2)}</span>
          <span class="domain-tag">{domainLabel(signal.domain)}</span>
          <span class="row-body" title={signal.reason}>{signal.reason}</span>
          <span class="row-sev">
            <span class="sev-bar" style="--sev-pct: {pct.toFixed(0)}%"></span>
            <span class="sev-label mono">
              event <code>{shortId(signal.event_id)}</code>
            </span>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</Panel>

<style>
  .rows {
    display: flex;
    flex-direction: column;
  }

  .row {
    display: grid;
    grid-template-columns: 18px 60px 90px 1fr 130px;
    gap: var(--space-3);
    align-items: center;
    padding: 8px var(--space-5);
    border-bottom: 1px solid var(--border-1);
    font-size: 12.5px;
    transition: background var(--motion-fast) var(--ease);
  }
  .row:hover {
    background: var(--overlay-weak);
  }
  .row:last-child {
    border-bottom: 0;
  }

  .row-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--card-accent, var(--text-muted));
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--card-accent) 20%, transparent);
  }

  .anomaly-score {
    font-size: 12px;
    font-weight: 600;
    color: var(--sev-high);
  }

  .domain-tag {
    display: inline-flex;
    justify-content: center;
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--card-accent) 14%, transparent);
    color: var(--card-accent);
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border: 1px solid
      color-mix(in srgb, var(--card-accent) 28%, transparent);
    white-space: nowrap;
  }

  .row-body {
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-sev {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sev-bar {
    position: relative;
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--overlay);
    overflow: hidden;
  }
  .sev-bar::after {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--sev-pct, 0%);
    background: linear-gradient(
      90deg,
      var(--sev-low),
      var(--sev-mid) 60%,
      var(--sev-high)
    );
    border-radius: inherit;
  }
  .sev-label {
    font-size: 10px;
    color: var(--text-3);
  }
  .sev-label code {
    color: var(--text-2);
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
