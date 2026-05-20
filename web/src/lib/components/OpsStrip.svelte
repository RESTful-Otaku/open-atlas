<!--
  Unified operator strip for map/globe routes: STDB connection, ingest feeds,
  and simulated UTC + solar phase.
-->
<script lang="ts">
  import { Activity, Clock, Database, RadioTower } from "@lucide/svelte";

  import { feedLive, summarizeFeeds } from "../feed-live.svelte";
  import { dashboard } from "../state.svelte";
  import { autoReconnectStatusLine } from "../connection.svelte";
  import { connectionErrorHint } from "../connection-errors";
  import { nlFilter } from "../nl-filter-intent";
  import {
    connectionOpsLabel,
    connectionOpsTier,
    feedOpsHint,
    feedOpsTier,
    simOpsLine,
  } from "./ops-strip";
  import type { SimMinOfDay } from "../map/solar-time-scrub";

  interface Props {
    simUtcLabel?: string;
    simMinOfDay?: SimMinOfDay;
    /** When false, hide the sim-time segment (e.g. embedded overview map). */
    showSimTime?: boolean;
    /** Flush into map command bar (no outer chrome). */
    embeddedInCommandBar?: boolean;
  }

  let {
    simUtcLabel = "",
    simMinOfDay = 0,
    showSimTime = true,
    embeddedInCommandBar = false,
  }: Props = $props();

  const connTier = $derived(
    connectionOpsTier(dashboard.dataMode, dashboard.connection),
  );
  const connLabel = $derived(
    connectionOpsLabel(
      dashboard.dataMode,
      dashboard.connection,
      dashboard.autoReconnectAttempt,
      dashboard.autoReconnectExhausted,
    ),
  );
  const reconnectLine = $derived(autoReconnectStatusLine());
  const feedSummary = $derived(summarizeFeeds(feedLive.catalog));
  const feedsTier = $derived(
    feedOpsTier(feedSummary, feedLive.loading, feedLive.error),
  );
  const feedsHint = $derived(
    feedOpsHint(feedSummary, feedLive.loading, feedLive.error),
  );
  const simLine = $derived(
    showSimTime && simUtcLabel ? simOpsLine(simUtcLabel, simMinOfDay) : null,
  );
  const nlLine = $derived(nlFilter.intent?.label ?? null);
  const connHint = $derived(
    dashboard.dataMode === "demo"
      ? "Preview data — no live SpacetimeDB stream"
      : [
          reconnectLine,
          connectionErrorHint(dashboard.connectionLastError),
        ]
          .filter(Boolean)
          .join(" — ") || "SpacetimeDB connection and data mode",
  );
  const connAria = $derived(
    dashboard.dataMode === "demo"
      ? "Data: preview mode"
      : `Data: ${connLabel}, SpacetimeDB ${dashboard.connection}`,
  );
</script>

<div
  class="ops-strip"
  class:ops-strip--command={embeddedInCommandBar}
  role="status"
  aria-label="Operations context"
>
  <a
    class="ops-pill"
    data-tier={connTier}
    href="#/settings"
    title={connHint}
    aria-label={connAria}
  >
    <Database size={12} strokeWidth={2.25} aria-hidden="true" />
    <span class="ops-k">Data</span>
    <span class="ops-v">{connLabel}</span>
  </a>

  <span class="ops-sep" aria-hidden="true"></span>

  <a class="ops-pill" data-tier={feedsTier} href="#/settings" title={feedsHint}>
    <RadioTower size={12} strokeWidth={2.25} aria-hidden="true" />
    <span class="ops-k">Feeds</span>
    <span class="ops-v">
      {#if feedSummary}
        {feedSummary.error > 0
          ? `${feedSummary.ok}/${feedSummary.total}`
          : `${feedSummary.ok} OK`}
      {:else if feedLive.loading}
        …
      {:else}
        —
      {/if}
    </span>
  </a>

  {#if simLine}
    <span class="ops-sep" aria-hidden="true"></span>
    <span class="ops-pill ops-pill-sim" data-tier="live" title="{simUtcLabel} UTC — {simLine.phase}">
      <Clock size={12} strokeWidth={2.25} aria-hidden="true" />
      <span class="ops-k">Sim</span>
      <span class="ops-v mono">{simLine.clock}</span>
      <span class="ops-phase">{simLine.phase}</span>
    </span>
  {/if}

  {#if nlLine}
    <span class="ops-sep" aria-hidden="true"></span>
    <span
      class="ops-pill ops-pill-nl"
      data-tier="degraded"
      title="Natural-language filter (operator bar). Recency hint is client-only for now."
    >
      <span class="ops-k">Filter</span>
      <span class="ops-v">{nlLine}</span>
    </span>
  {/if}

  <span class="ops-live" title="Map instrument room">
    <Activity size={11} strokeWidth={2} aria-hidden="true" />
    <span>Ops</span>
  </span>
</div>

<style>
  .ops-strip {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    padding: 4px 8px;
    border-radius: var(--radius);
    border: 1px solid var(--border-1);
    background: color-mix(in srgb, var(--bg-2) 88%, transparent);
    font-size: 11px;
    line-height: 1.2;
  }
  .ops-strip--command {
    border: 0;
    background: transparent;
    padding: 0;
  }
  .ops-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 4px;
    border-radius: calc(var(--radius) - 2px);
    color: var(--text-2);
    text-decoration: none;
    transition: color 0.15s ease;
  }
  a.ops-pill:hover {
    color: var(--text-0);
  }
  .ops-pill-sim {
    cursor: default;
  }
  .ops-k {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-3);
  }
  .ops-v {
    font-weight: 600;
    color: var(--text-1);
  }
  .ops-phase {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
    padding-left: 2px;
    border-left: 1px solid var(--border-1);
    margin-left: 2px;
    padding-left: 6px;
  }
  .ops-sep {
    width: 1px;
    height: 14px;
    background: var(--border-1);
  }
  .ops-live {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 2px;
    padding: 2px 6px;
    border-radius: calc(var(--radius) - 2px);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--text-2);
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .ops-pill[data-tier="live"] .ops-v {
    color: var(--status-ok, #4ade80);
  }
  .ops-pill[data-tier="degraded"] .ops-v {
    color: var(--status-warn, #fbbf24);
  }
  .ops-pill[data-tier="offline"] .ops-v {
    color: var(--status-error, #f87171);
  }
  .mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
</style>
