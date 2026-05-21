<!--
  Global market ticker (informational chrome, non-interactive).

  Values are derived from per-domain `world_state` rows. The ticker is
  only shown on views that opt in (`showTicker={true}` on the Shell).
  Everything is read-only and updates reactively via the `dashboard`
  store — no timers, no wall-clock reads.
-->
<script lang="ts">
  import { dashboardData } from "../dashboard-revision.svelte";
  import { dashboard, setSelectedDomain } from "../state.svelte";
  import { domainLabel } from "../colors";

  interface Props {
    /** Shorter ticker strip on mobile layout. */
    compact?: boolean;
  }
  const { compact = false }: Props = $props();

  interface TickerEntry {
    readonly label: string;
    readonly value: string;
    readonly delta: number;
    /** Domain id for filtering the dashboard when the row is activated. */
    readonly domain: string;
  }

  const entries = $derived.by((): readonly TickerEntry[] => {
    void dashboardData.domainsRevision;
    return buildEntries();
  });

  function buildEntries(): readonly TickerEntry[] {
    const rows = Object.values(dashboard.domainState).sort((a, b) =>
      a.domain.localeCompare(b.domain),
    );
    return rows.map((row) => ({
      label: domainLabel(row.domain),
      value: row.risk_index.toFixed(2),
      delta: deltaForDomain(row.domain),
      domain: row.domain,
    }));
  }

  /**
   * Approximate "change" as the signed difference between the most
   * recent severity sample and the mean of the history ring. This is
   * deterministic given the reactive inputs — no wall clock involved.
   */
  function deltaForDomain(domain: string): number {
    const history = dashboard.domainSeverityHistory[domain];
    if (!history || history.length < 2) return 0;
    const last = history[history.length - 1];
    const mean =
      history.slice(0, -1).reduce((acc, v) => acc + v, 0) /
      (history.length - 1);
    return last - mean;
  }

  function deltaClass(delta: number): string {
    if (delta > 0.02) return "up";
    if (delta < -0.02) return "down";
    return "flat";
  }

  function formatDelta(delta: number): string {
    const pct = Math.round(delta * 100);
    const sign = pct > 0 ? "+" : "";
    return `${sign}${pct}%`;
  }

  function pickDomain(domain: string): void {
    setSelectedDomain(
      dashboard.selectedDomain === domain ? null : domain,
    );
  }
</script>

<div class="ticker" class:ticker--compact={compact} role="marquee" aria-live="off">
  <div class="ticker-track">
    {#each entries as entry (entry.label + entry.domain)}
      <button
        type="button"
        class="ticker-entry"
        data-trend={deltaClass(entry.delta)}
        data-active={dashboard.selectedDomain === entry.domain
          ? "true"
          : undefined}
        title="Click to filter the dashboard to {entry.label}. Click again to clear."
        onclick={() => pickDomain(entry.domain)}
      >
        <span class="ticker-label">{entry.label}</span>
        <span class="ticker-value mono">{entry.value}</span>
        <span class="ticker-delta mono">{formatDelta(entry.delta)}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .ticker--compact {
    height: 22px;
    font-size: 10px;
  }
  .ticker--compact .ticker-label {
    display: none;
  }
  .ticker--compact .ticker-value {
    font-size: 11px;
  }

  .ticker {
    grid-area: ticker;
    overflow: hidden;
    height: 28px;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border-1);
    font-size: 11px;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  .ticker-track {
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    padding: 0 var(--space-5);
    height: 100%;
    white-space: nowrap;
    animation: ticker-scroll 60s linear infinite;
  }

  .ticker-entry {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    border-radius: var(--radius-xs);
  }
  .ticker-entry:hover {
    background: var(--overlay-weak, rgba(255, 255, 255, 0.04));
  }
  .ticker-entry[data-active="true"] {
    box-shadow: 0 0 0 1px var(--accent);
  }
  .ticker-label {
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 10px;
  }
  .ticker-value {
    color: var(--text-1);
    font-size: 12px;
  }
  .ticker-delta {
    font-size: 11px;
  }
  .ticker-entry[data-trend="up"] .ticker-delta {
    color: var(--sev-low);
  }
  .ticker-entry[data-trend="down"] .ticker-delta {
    color: var(--sev-high);
  }
  .ticker-entry[data-trend="flat"] .ticker-delta {
    color: var(--text-3);
  }

  @keyframes ticker-scroll {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(-50%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ticker-track {
      animation: none;
    }
  }
</style>
