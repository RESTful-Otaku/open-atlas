<!--
  Compact data / ingest / LLM readiness for the shell — live, degraded,
  or offline with subtle motion. Retry refreshes HTTP checks and optionally
  reconnects SpacetimeDB when the feed is down.
-->
<script lang="ts">
  import {
    Activity,
    Database,
    RadioTower,
    RefreshCw,
    Sparkles,
  } from "@lucide/svelte";

  import { reconnectNow } from "../connection.svelte";
  import {
    feedLive,
    feedSummaryTier,
    refreshFeedLive,
    summarizeFeeds,
  } from "../feed-live.svelte";
  import { readiness, refreshRemoteReadiness } from "../readiness.svelte";
  import { dashboard } from "../state.svelte";
  import type { ConnectionState } from "../types";

  type Pillar = "live" | "degraded" | "unknown" | "offline";

  function feedPillar(
    dataMode: typeof dashboard.dataMode,
    c: ConnectionState,
  ): Pillar {
    if (dataMode === "demo") return "degraded";
    if (c === "live") return "live";
    if (c === "connecting") return "degraded";
    return "offline";
  }

  function boolPillar(v: boolean | null): Pillar {
    if (v === null) return "unknown";
    return v ? "live" : "offline";
  }

  const feed = $derived.by(() => feedPillar(dashboard.dataMode, dashboard.connection));
  const ingest = $derived(boolPillar(readiness.ingestReady));
  const llm = $derived(boolPillar(readiness.llmReady));
  const feedSummary = $derived(summarizeFeeds(feedLive.catalog));
  const feedsPillar = $derived(feedSummaryTier(feedSummary));

  const feedsTitle = $derived(
    feedSummary
      ? `${feedSummary.ok}/${feedSummary.total} feeds OK · ${feedLive.catalog?.retention_hours ?? 24}h STDB retention`
      : feedLive.error
        ? `Feed status: ${feedLive.error}`
        : "Open-data feed poll health",
  );
  const feedsLabel = $derived(
    feedSummary
      ? feedSummary.error > 0
        ? `${feedSummary.ok}/${feedSummary.total}`
        : `${feedSummary.ok} OK`
      : feedLive.loading
        ? "…"
        : "—",
  );

  const feedTitle = $derived(
    dashboard.dataMode === "demo"
      ? "Demo / preview data — not connected to SpacetimeDB. Settings to switch to live."
      : dashboard.connectionLastError
        ? `SpacetimeDB: ${dashboard.connectionLastError}. Settings for URI.`
        : "SpacetimeDB WebSocket and subscriptions",
  );

  async function onRetry(): Promise<void> {
    await Promise.all([refreshRemoteReadiness(), refreshFeedLive()]);
    if (dashboard.dataMode !== "demo" && dashboard.connection === "offline") {
      reconnectNow();
    }
  }

  function onDemoReset(): void {
    reconnectNow();
  }
</script>

<div class="status-bar" aria-label="Service readiness">
  <a class="row" data-tier={feed} href="#/settings" title={feedTitle}>
    <span class="ico" aria-hidden="true">
      <Database size={12} strokeWidth={2.25} />
    </span>
    <span class="dot" aria-hidden="true"></span>
    <span class="lab">
      <span class="lab-k">Data</span>
      <span class="lab-v"
        >{dashboard.dataMode === "demo"
          ? "Preview"
          : dashboard.connection === "connecting"
            ? "…"
            : dashboard.connection === "live"
              ? "Live"
              : "Off"}</span
      >
    </span>
  </a>

  <span class="sep" aria-hidden="true"></span>

  <a class="row" data-tier={ingest} href="#/settings" title="Ingest service GET /ready">
    <span class="ico" aria-hidden="true">
      <RadioTower size={12} strokeWidth={2.25} />
    </span>
    <span class="dot" aria-hidden="true"></span>
    <span class="lab">
      <span class="lab-k">Ingest</span>
      <span class="lab-v"
        >{readiness.ingestReady === null
          ? "…"
          : readiness.ingestReady
            ? "Up"
            : "Down"}</span
      >
    </span>
  </a>

  {#if dashboard.dataMode !== "demo"}
    <span class="sep" aria-hidden="true"></span>

    <a class="row" data-tier={feedsPillar} href="#/settings" title={feedsTitle}>
      <span class="ico" aria-hidden="true">
        <Activity size={12} strokeWidth={2.25} />
      </span>
      <span class="dot" aria-hidden="true"></span>
      <span class="lab">
        <span class="lab-k">Feeds</span>
        <span class="lab-v">{feedsLabel}</span>
      </span>
    </a>
  {/if}

  <span class="sep" aria-hidden="true"></span>

  <a
    class="row"
    data-tier={llm}
    href="#/settings"
    title="LLM bridge GET /v1/ready (Ollama via openatlas-llm-bridge)"
  >
    <span class="ico" aria-hidden="true">
      <Sparkles size={12} strokeWidth={2.25} />
    </span>
    <span class="dot" aria-hidden="true"></span>
    <span class="lab">
      <span class="lab-k">LLM</span>
      <span class="lab-v"
        >{readiness.llmReady === null
          ? "…"
          : readiness.llmReady
            ? "Up"
            : "Down"}</span
      >
    </span>
  </a>

  {#if dashboard.dataMode === "demo"}
    <button
      type="button"
      class="retry"
      title="Re-seed the synthetic demo dataset"
      onclick={onDemoReset}
    >
      <span class="retry-txt">Reset demo</span>
    </button>
  {/if}
  <button
    type="button"
    class="retry"
    title="Re-check ingest & LLM, reconnect if SpacetimeDB is offline"
    disabled={readiness.readinessRefreshing}
    onclick={() => void onRetry()}
  >
    <span class="retry-ico" class:spinning={readiness.readinessRefreshing} aria-hidden="true"
      ><RefreshCw size={12} strokeWidth={2.25} /></span
    >
    <span class="retry-txt">Retry</span>
  </button>
</div>

<style>
  .status-bar {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px 3px 4px;
    border-radius: var(--radius-sm);
    text-decoration: none;
    color: var(--text-3);
    font-size: 10px;
    line-height: 1.2;
    border: 1px solid transparent;
    min-width: 0;
  }
  .row:hover {
    background: var(--overlay);
    border-color: var(--border-1);
    color: var(--text-2);
  }

  .ico {
    display: flex;
    color: var(--text-3);
    flex-shrink: 0;
  }
  .row:hover .ico {
    color: var(--text-2);
  }

  .lab {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    text-align: left;
  }
  .lab-k {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 8px;
    color: var(--text-3);
  }
  .lab-v {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-2);
  }
  .row[data-tier="live"] .lab-v {
    color: var(--text-1);
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--text-muted);
  }
  .row[data-tier="live"] .dot {
    background: var(--status-ok, #22c55e);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--status-ok, #22c55e) 30%, transparent);
    animation: live-glow 2s ease-in-out infinite;
  }
  .row[data-tier="degraded"] .dot {
    background: var(--status-warn, #f59e0b);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--status-warn) 32%, transparent);
    animation: live-glow 1.3s ease-in-out infinite;
  }
  .row[data-tier="unknown"] .dot {
    background: var(--text-3);
    animation: live-glow 2.2s ease-in-out infinite;
  }
  .row[data-tier="offline"] .dot {
    background: var(--status-err, #ef4444);
  }

  .sep {
    width: 1px;
    height: 14px;
    background: var(--border-1);
    flex-shrink: 0;
  }

  .retry {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 2px;
    padding: 3px 6px;
    font: inherit;
    font-size: 10px;
    font-weight: 600;
    color: var(--text-3);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .retry:hover:not(:disabled) {
    color: var(--accent);
    border-color: var(--border-2);
  }
  .retry:disabled {
    opacity: 0.55;
    cursor: wait;
  }
  .retry-ico {
    display: inline-flex;
  }
  .retry-ico.spinning {
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes live-glow {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .row[data-tier="live"] .dot,
    .row[data-tier="degraded"] .dot,
    .row[data-tier="unknown"] .dot,
    .retry-ico.spinning {
      animation: none;
    }
  }
  @media (max-width: 720px) {
    .lab-v {
      display: none;
    }
    .retry-txt {
      display: none;
    }
    .retry {
      padding: 4px 5px;
    }
  }
</style>
