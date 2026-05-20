<script lang="ts">
  import { dashboardData } from "../dashboard-revision.svelte";
  import { dashboard, matchesSelectedDomain } from "../state.svelte";
  import { domainColor, domainLabel } from "../colors";
  import { fmtFixed, severityPercent, shortId, shortTime } from "../format";

  import CompactNumber from "./CompactNumber.svelte";
  import Panel from "./Panel.svelte";

  const { span = 6 }: { span?: number } = $props();

  const MAX_ROWS = 60;

  const rows = $derived.by(() => {
    void dashboardData.revision;
    return dashboard.events
      .filter((event) => matchesSelectedDomain(event.domain))
      .slice(-MAX_ROWS)
      .reverse();
  });
</script>

<Panel title="Live event stream" {span} scroll flush>
  {#snippet header()}
    <span
      ><CompactNumber value={rows.length} /> of <CompactNumber
        value={dashboard.events.length}
      /></span
    >
  {/snippet}

  {#if rows.length === 0}
    <div class="empty-state">
      <strong>No events yet</strong>
      Stream activity will appear here as ingest begins.
    </div>
  {:else}
    <ul class="rows">
      {#each rows as event (event.id)}
        {@const color = domainColor(event.domain)}
        {@const pct = severityPercent(event.severity_score)}
        <li class="row-item">
          <a
            class="row"
            href="#/events/{encodeURIComponent(event.id)}"
            style="--card-accent: {color}"
            title="Open event detail"
          >
            <span class="row-dot" aria-hidden="true"></span>
            <span class="row-time mono">
              {shortTime(event.timestamp)}
            </span>
            <span class="domain-tag">{domainLabel(event.domain)}</span>
            <span class="row-body">
              <code>{shortId(event.id)}</code>
            </span>
            <span class="row-sev">
              <span class="sev-bar" style="--sev-pct: {pct.toFixed(0)}%"></span>
              <span class="sev-label mono">{fmtFixed(event.severity_score, 2)}</span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</Panel>

<style>
  .rows {
    display: flex;
    flex-direction: column;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .row-item {
    border-bottom: 1px solid var(--border-1);
  }
  .row-item:last-child {
    border-bottom: 0;
  }

  .row {
    display: grid;
    grid-template-columns: 18px 90px 90px 1fr 90px;
    gap: var(--space-3);
    align-items: center;
    padding: 8px var(--space-5);
    font-size: 12.5px;
    transition: background var(--motion-fast) var(--ease);
    color: inherit;
    text-decoration: none;
    cursor: pointer;
  }
  .row:hover {
    background: var(--overlay-weak);
  }
  .row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .row-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--card-accent, var(--text-muted));
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--card-accent) 20%, transparent);
  }

  .row-time {
    font-size: 11px;
    color: var(--text-3);
  }

  .domain-tag {
    display: inline-flex;
    justify-content: center;
    align-items: center;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-body code {
    color: var(--text-2);
    font-size: 11px;
  }

  .row-sev {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
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
