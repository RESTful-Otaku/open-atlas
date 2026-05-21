<!--
  Live diagnostics for Settings: ingest health, feeds, Prometheus counters,
  and a monospace client log stream (STDB + poll events).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    Activity,
    ChevronDown,
    ClipboardCopy,
    RefreshCw,
    Trash2,
  } from "@lucide/svelte";

  import { connectionErrorDisplay } from "../connection-errors";
  import { autoReconnectStatusLine } from "../connection.svelte";
  import { ingestModeLabel } from "../ingest-status";
  import type { FeedRow } from "../feed-config";
  import {
    acquireOpsPolling,
    appendOpsLog,
    clearOpsLog,
    fetchLlmHealth,
    getOpsLogLines,
    INGEST_METRIC_NAMES,
    METRIC_LABELS,
    opsLogRevision,
    opsObservability,
    refreshOpsObservability,
    subscribeOpsLog,
    type LogLine,
  } from "../ops/ops-console";
  import { dashboard } from "../state.svelte";
  import { readiness } from "../readiness.svelte";
  import CompactNumber from "./CompactNumber.svelte";

  interface Props {
    /**
     * Mobile settings drill-down: flat panel, no nested details (iOS/WebView jank),
     * defer ingest polling until after the slide transition, always show body.
     */
    mobilePanel?: boolean;
  }

  let { mobilePanel = false }: Props = $props();

  type OpsTab = "overview" | "feeds" | "metrics" | "logs";

  const displayLogMax = $derived(mobilePanel ? 80 : 400);
  const feedRowsMax = $derived(mobilePanel ? 32 : 10_000);
  type LogFilter = "all" | LogLine["level"];
  let logFilter = $state<LogFilter>("all");
  const tabs: { id: OpsTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "feeds", label: "Feeds" },
    { id: "metrics", label: "Metrics" },
    { id: "logs", label: "Logs" },
  ];

  const OPS_EXPAND_KEY = "oa.settings.ops-console-expanded";

  function readExpandedDefault(): boolean {
    if (typeof localStorage === "undefined") return true;
    const stored = localStorage.getItem(OPS_EXPAND_KEY);
    if (stored === "0" || stored === "false") return false;
    if (stored === "1" || stored === "true") return true;
    return true;
  }

  let expanded = $state(mobilePanel ? true : readExpandedDefault());

  $effect(() => {
    if (mobilePanel || typeof localStorage === "undefined") return;
    localStorage.setItem(OPS_EXPAND_KEY, expanded ? "true" : "false");
  });
  let activeTab = $state<OpsTab>("overview");
  let logRev = $state(0);
  let logNotifyRaf = 0;
  let llmProbe = $state<{
    ready: boolean;
    configured: boolean;
    base: string;
    err: string | null;
  } | null>(null);

  const snap = $derived(opsObservability.snapshot);
  const allLogLines = $derived.by(() => {
    logRev;
    return getOpsLogLines();
  });

  const logLines = $derived.by(() => {
    const filtered =
      logFilter === "all"
        ? allLogLines
        : allLogLines.filter((l) => l.level === logFilter);
    if (filtered.length <= displayLogMax) return filtered;
    return filtered.slice(filtered.length - displayLogMax);
  });

  const logStats = $derived.by(() => {
    const lines = allLogLines;
    let error = 0;
    let warn = 0;
    for (const l of lines) {
      if (l.level === "error") error += 1;
      else if (l.level === "warn") warn += 1;
    }
    return { total: lines.length, error, warn };
  });

  const feedRows = $derived((snap?.feeds?.feeds ?? []).slice(0, feedRowsMax));
  const metricCards = $derived.by(() => {
    const counters = snap?.prometheus ?? {};
    return INGEST_METRIC_NAMES.map((name) => ({
      name,
      label: METRIC_LABELS[name] ?? name,
      value: counters[name] ?? null,
    }));
  });

  const reconnectLine = $derived(autoReconnectStatusLine());
  const connErr = $derived(
    dashboard.connectionLastError
      ? connectionErrorDisplay(dashboard.connectionLastError)
      : null,
  );

  $effect(() => {
    const wantLogs = !mobilePanel || activeTab === "logs";
    if (!wantLogs) return;
    const unsubLog = subscribeOpsLog(() => {
      if (logNotifyRaf) return;
      logNotifyRaf = requestAnimationFrame(() => {
        logNotifyRaf = 0;
        logRev = opsLogRevision();
      });
    });
    return () => {
      unsubLog();
      if (logNotifyRaf) cancelAnimationFrame(logNotifyRaf);
      logNotifyRaf = 0;
    };
  });

  onMount(() => {
    if (!mobilePanel) return;
    let release: (() => void) | undefined;
    const deferPoll = setTimeout(() => {
      release = acquireOpsPolling({ verboseLogs: false });
      void probeLlm();
    }, 500);
    return () => {
      clearTimeout(deferPoll);
      release?.();
    };
  });

  $effect(() => {
    if (mobilePanel) return;
    if (!expanded) return;
    const release = acquireOpsPolling({ verboseLogs: true });
    void probeLlm();
    return release;
  });

  async function probeLlm(): Promise<void> {
    llmProbe = await fetchLlmHealth();
  }

  async function manualRefresh(): Promise<void> {
    appendOpsLog("info", "ops", "Manual refresh requested (ingest + LLM probes)");
    await Promise.all([refreshOpsObservability(true), probeLlm()]);
    if (llmProbe) {
      appendOpsLog(
        llmProbe.ready ? "ok" : llmProbe.configured ? "warn" : "info",
        "llm",
        `Manual LLM check: ${llmProbe.ready ? "ready" : "down"} @ ${llmProbe.base}${llmProbe.err ? ` — ${llmProbe.err}` : ""}`,
      );
    }
  }

  function formatTs(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return iso.slice(11, 19);
    }
  }

  function formatLogLine(line: LogLine): string {
    return `${formatTs(line.ts)} [${line.level}] ${line.source}: ${line.message}`;
  }

  async function copyLogs(): Promise<void> {
    const text = getOpsLogLines().map(formatLogLine).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  function feedStatusClass(row: FeedRow): string {
    if (row.circuit_open) return "error";
    if (row.connection === "ok") return "ok";
    if (
      row.connection === "degraded" ||
      row.connection === "idle" ||
      row.connection === "starting"
    ) {
      return "warn";
    }
    return "error";
  }
</script>

{#snippet statusHint()}
  {#if opsObservability.loading}
    polling…
  {:else if snap?.ingestReady}
    ingest ready
  {:else if snap?.ingestReachable}
    ingest degraded
  {:else}
    ingest offline
  {/if}
  · STDB {dashboard.connection}
{/snippet}

{#snippet consoleInner()}
    <div class="ops-console__toolbar">
      <div class="ops-tabs" role="tablist" aria-label="Diagnostics sections">
        {#each tabs as tab (tab.id)}
          <button
            type="button"
            role="tab"
            class="ops-tab"
            aria-selected={activeTab === tab.id}
            onclick={() => (activeTab = tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </div>
      <div class="ops-console__actions">
        <button
          type="button"
          class="ops-btn"
          title="Refresh now"
          onclick={() => void manualRefresh()}
          disabled={opsObservability.loading}
        >
          <RefreshCw size={12} aria-hidden="true" />
          Refresh
        </button>
        {#if activeTab === "logs"}
          <select
            class="ops-filter"
            aria-label="Filter log level"
            bind:value={logFilter}
          >
            <option value="all">All</option>
            <option value="info">Info</option>
            <option value="ok">OK</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <button type="button" class="ops-btn" title="Copy log" onclick={() => void copyLogs()}>
            <ClipboardCopy size={12} aria-hidden="true" />
            Copy
          </button>
          <button
            type="button"
            class="ops-btn"
            title="Clear log"
            onclick={() => clearOpsLog()}
          >
            <Trash2 size={12} aria-hidden="true" />
            Clear
          </button>
        {/if}
      </div>
    </div>

    {#if activeTab === "overview"}
      <div class="ops-grid" role="region" aria-label="Service overview">
        <article class="ops-card" data-tier={dashboard.connection === "live" ? "ok" : dashboard.connection === "connecting" ? "warn" : "error"}>
          <h4>SpacetimeDB</h4>
          <p class="ops-val">{dashboard.dataMode === "demo" ? "demo (no socket)" : dashboard.connection}</p>
          {#if reconnectLine}
            <p class="ops-meta">{reconnectLine}</p>
          {/if}
          {#if connErr}
            <p class="ops-meta ops-meta--err">{connErr.summary} — {connErr.remediation}</p>
          {/if}
        </article>

        <article
          class="ops-card"
          data-tier={snap?.ingestReady ? "ok" : snap?.ingestReachable ? "warn" : "error"}
        >
          <h4>Ingest</h4>
          <p class="ops-val">
            {#if snap === null && !opsObservability.lastPollErr}
              awaiting poll…
            {:else if snap?.ingestReady}
              ready
            {:else if snap?.ingestReachable}
              reachable (not ready)
            {:else}
              offline
            {/if}
          </p>
          {#if snap?.status}
            <p class="ops-meta">
              mode <code>{snap.status.ingest_mode}</code>
              ({ingestModeLabel(snap.status.ingest_mode)}) · uptime {snap.status.uptime_seconds}s
            </p>
            <p class="ops-meta">
              STDB {#if snap.status.stdb_reachable}
                <span class="ok">reachable</span>
              {:else}
                <span class="err">unreachable</span>
              {/if}
              {#if snap.status.stdb_event_count != null}
                · <CompactNumber value={snap.status.stdb_event_count} /> events
              {/if}
            </p>
          {:else if opsObservability.lastPollErr}
            <p class="ops-meta ops-meta--err">{opsObservability.lastPollErr}</p>
          {/if}
        </article>

        <article
          class="ops-card"
          data-tier={llmProbe?.ready ? "ok" : llmProbe === null ? "warn" : "error"}
        >
          <h4>LLM bridge</h4>
          <p class="ops-val">
            {#if llmProbe === null}
              checking…
            {:else if llmProbe.ready}
              ready
            {:else if !llmProbe.configured}
              not configured
            {:else}
              unreachable
            {/if}
          </p>
          <p class="ops-meta">
            <code>{llmProbe?.base ?? "/api/llm"}</code>
            {#if llmProbe?.err}
              — {llmProbe.err}
            {/if}
          </p>
          <p class="ops-meta">
            Settings readiness: {#if readiness.llmReady === null}
              …
            {:else if readiness.llmReady}
              <span class="ok">ping OK</span>
            {:else}
              <span class="err">ping failed</span>
            {/if}
          </p>
        </article>
      </div>
      {#if snap?.at}
        <p class="ops-foot">Last snapshot {snap.at} · poll #{opsObservability.pollCount}</p>
      {/if}
    {:else if activeTab === "feeds"}
      {#if feedRows.length === 0}
        <p class="ops-empty">
          {#if snap?.feedsErr}
            {snap.feedsErr}
          {:else if opsObservability.loading}
            Loading feed catalog…
          {:else}
            No feeds in catalog (ingest offline or mode without live feeds).
          {/if}
        </p>
      {:else}
        <div class="ops-table-wrap">
          <table class="ops-table">
            <thead>
              <tr>
                <th>Feed</th>
                <th>Status</th>
                <th>Poll</th>
                <th>Accepted</th>
                <th>Key</th>
              </tr>
            </thead>
            <tbody>
              {#each feedRows as row (row.name)}
                <tr>
                  <td>
                    <span class="ops-feed-name">{row.label || row.name}</span>
                    {#if row.circuit_open}
                      <span class="ops-badge ops-badge--err">circuit</span>
                    {/if}
                  </td>
                  <td>
                    <span class="ops-status" data-level={feedStatusClass(row)}>
                      {row.connection}
                    </span>
                  </td>
                  <td class="mono">{row.poll_interval_secs}s</td>
                  <td class="mono">
                    <CompactNumber value={row.last_events_accepted} />
                  </td>
                  <td>
                    {#if row.api_key_configured}
                      <span class="ops-key" title="API key configured (masked)">
                        {row.api_key_preview ?? "configured"}
                      </span>
                    {:else if row.requires_env}
                      <span class="muted">needs key</span>
                    {:else}
                      —
                    {/if}
                  </td>
                </tr>
                {#if row.last_error}
                  <tr class="ops-table__err">
                    <td colspan="5">{row.last_error}</td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {:else if activeTab === "metrics"}
      {#if snap?.metricsErr}
        <p class="ops-empty ops-meta--err" role="alert">{snap.metricsErr}</p>
      {:else if snap?.statusExtras?.ingest_metrics && !INGEST_METRIC_NAMES.some((n) => snap?.prometheus?.[n] != null)}
        <p class="ops-empty">No counter values yet — ingest may still be starting.</p>
      {/if}
      <div class="ops-metrics">
        {#each metricCards as card (card.name)}
          <article class="ops-metric">
            <span class="ops-metric__label">{card.label}</span>
            <span class="ops-metric__value">
              {#if card.value == null}
                —
              {:else}
                <CompactNumber value={card.value} />
              {/if}
            </span>
          </article>
        {/each}
      </div>
      {#if snap?.statusExtras?.ingest_metrics}
        <p class="ops-foot">Also mirrored in <code>/status</code> JSON.</p>
      {/if}
    {:else}
      <p class="ops-log-meta">
        {logStats.total} line(s) in buffer
        {#if logStats.error > 0}
          · <span class="err">{logStats.error} error</span>
        {/if}
        {#if logStats.warn > 0}
          · <span class="warn">{logStats.warn} warn</span>
        {/if}
        {#if logLines.length < logStats.total}
          · showing newest {logLines.length} ({logFilter})
        {/if}
      </p>
      <div
        class="ops-log"
        role="log"
        aria-live={mobilePanel ? undefined : "polite"}
        aria-relevant={mobilePanel ? undefined : "additions"}
        aria-label="Client diagnostics log"
      >
        {#if logLines.length === 0}
          <p class="ops-log__empty">
            No log lines yet — expand console to poll ingest, connect SpacetimeDB, or tap Refresh.
          </p>
        {:else}
          {#each logLines as line (line.ts + line.message + line.source + line.level)}
            <div class="ops-log__line" data-level={line.level}>
              <time datetime={line.ts}>{formatTs(line.ts)}</time>
              <span class="ops-log__src">{line.source}</span>
              <span class="ops-log__msg">{line.message}</span>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
{/snippet}

{#if mobilePanel}
  <section
    class="ops-console ops-console--panel"
    aria-label="Live diagnostics"
    data-expanded="true"
  >
    <header class="ops-console__panel-head">
      <span class="ops-console__title">
        <Activity size={14} strokeWidth={2} aria-hidden="true" />
        Live diagnostics
      </span>
      <span class="ops-console__hint">{@render statusHint()}</span>
    </header>
    <div class="ops-console__body">
      {@render consoleInner()}
    </div>
  </section>
{:else}
  <details
    class="ops-console"
    bind:open={expanded}
    data-expanded={expanded ? "true" : "false"}
  >
    <summary class="ops-console__summary">
      <span class="ops-console__title">
        <Activity size={14} strokeWidth={2} aria-hidden="true" />
        Live diagnostics
      </span>
      <span class="ops-console__hint">{@render statusHint()}</span>
      <span class="ops-console__chev" aria-hidden="true">
        <ChevronDown size={14} />
      </span>
    </summary>
    <div class="ops-console__body">
      {@render consoleInner()}
    </div>
  </details>
{/if}

<style>
  .ops-console {
    margin-top: 0;
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-glass, var(--bg-1)) 92%, transparent);
    backdrop-filter: blur(8px);
    overflow: hidden;
  }
  .ops-console--panel {
    margin-top: var(--space-3);
    backdrop-filter: none;
    background: var(--bg-1);
  }
  .ops-console__panel-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-1);
  }
  .ops-console--panel .ops-console__body {
    border-top: 0;
  }
  .ops-console--panel .ops-grid {
    grid-template-columns: 1fr;
  }
  .ops-console--panel .ops-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ops-console--panel .ops-table-wrap {
    max-height: 200px;
  }
  .ops-console__summary {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .ops-console__summary::-webkit-details-marker {
    display: none;
  }
  .ops-console__title {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 13px;
    font-weight: 600;
    color: var(--text-1);
  }
  .ops-console__hint {
    flex: 1;
    font-size: 11px;
    color: var(--text-3);
    font-family: var(--font-mono);
  }
  .ops-console__chev {
    color: var(--text-3);
    transition: transform 0.15s ease;
  }
  .ops-console[data-expanded="true"] .ops-console__chev {
    transform: rotate(180deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .ops-console__chev {
      transition: none;
    }
  }
  .ops-console__body {
    border-top: 1px solid var(--border-1);
    padding: var(--space-3) var(--space-4) var(--space-4);
  }
  .ops-console__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .ops-tabs {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
  }
  .ops-tab {
    font: inherit;
    font-size: 11px;
    font-weight: 500;
    padding: 4px 10px;
    border: 0;
    border-radius: calc(var(--radius) - 2px);
    background: transparent;
    color: var(--text-3);
    cursor: pointer;
  }
  .ops-tab[aria-selected="true"] {
    background: var(--bg-3);
    color: var(--text-1);
  }
  .ops-tab:hover {
    color: var(--text-2);
  }
  .ops-console__actions {
    display: inline-flex;
    gap: 6px;
  }
  .ops-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: inherit;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-2);
    cursor: pointer;
  }
  .ops-btn:hover:not(:disabled) {
    background: var(--bg-3);
    color: var(--text-1);
  }
  .ops-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ops-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-3);
  }
  .ops-card {
    padding: var(--space-3);
    border-radius: var(--radius);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
  }
  .ops-card[data-tier="ok"] {
    border-color: color-mix(in srgb, var(--status-ok) 35%, var(--border-1));
  }
  .ops-card[data-tier="warn"] {
    border-color: color-mix(in srgb, var(--status-warn) 35%, var(--border-1));
  }
  .ops-card[data-tier="error"] {
    border-color: color-mix(in srgb, var(--status-err) 35%, var(--border-1));
  }
  .ops-card h4 {
    margin: 0 0 6px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-3);
  }
  .ops-val {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-1);
    text-transform: capitalize;
  }
  .ops-meta {
    margin: 6px 0 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-3);
  }
  .ops-meta code {
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .ops-meta--err {
    color: #fca5a5;
  }
  .ops-foot {
    margin: var(--space-3) 0 0;
    font-size: 10px;
    color: var(--text-3);
    font-family: var(--font-mono);
  }
  .ops-empty {
    margin: 0;
    font-size: 12px;
    color: var(--text-3);
  }
  .ops-table-wrap {
    max-height: 280px;
    overflow-x: auto;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    max-width: 100%;
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
  }
  .ops-table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  .ops-table th {
    position: sticky;
    top: 0;
    text-align: left;
    padding: 6px 8px;
    background: var(--bg-3);
    color: var(--text-3);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 9px;
  }
  .ops-table td {
    padding: 6px 8px;
    border-top: 1px solid var(--border-1);
    color: var(--text-2);
  }
  .ops-table__err td {
    font-size: 10px;
    color: #fca5a5;
    background: color-mix(in srgb, var(--status-err) 8%, transparent);
  }
  .ops-feed-name {
    font-weight: 600;
    color: var(--text-1);
  }
  .ops-badge {
    margin-left: 6px;
    font-size: 9px;
    padding: 1px 5px;
    border-radius: var(--radius-xs);
    text-transform: uppercase;
  }
  .ops-badge--err {
    background: color-mix(in srgb, var(--status-err) 20%, transparent);
    color: #fecaca;
  }
  .ops-status[data-level="ok"] {
    color: var(--status-ok);
  }
  .ops-status[data-level="warn"] {
    color: var(--status-warn);
  }
  .ops-status[data-level="error"] {
    color: var(--status-err);
  }
  .ops-key {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-3);
  }
  .ops-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-2);
  }
  .ops-metric {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    background: var(--bg-2);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ops-metric__label {
    font-size: 10px;
    color: var(--text-3);
  }
  .ops-metric__value {
    font-family: var(--font-mono);
    font-size: 16px;
    font-weight: 600;
    color: var(--text-1);
    font-variant-numeric: tabular-nums;
  }
  .ops-filter {
    font: inherit;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-2);
  }
  .ops-log-meta {
    margin: 0 0 var(--space-2);
    font-size: 10px;
    color: var(--text-3);
    font-family: var(--font-mono);
  }
  .ops-log-meta .warn {
    color: var(--status-warn);
  }
  .ops-log {
    max-height: min(420px, 50vh);
    overflow-y: auto;
    padding: var(--space-2);
    border-radius: var(--radius);
    border: 1px solid var(--border-1);
    background: var(--bg-0);
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.45;
  }
  .ops-log__empty {
    margin: 0;
    color: var(--text-3);
  }
  .ops-log__line {
    display: grid;
    grid-template-columns: 4.5rem 4.25rem 1fr;
    gap: 8px;
    padding: 3px 0;
    color: var(--text-2);
    border-bottom: 1px solid color-mix(in srgb, var(--border-1) 40%, transparent);
  }
  .ops-log__msg {
    word-break: break-word;
    white-space: pre-wrap;
  }
  .ops-log__line time {
    color: var(--text-3);
  }
  .ops-log__src {
    color: var(--text-3);
    text-transform: lowercase;
  }
  .ops-log__line[data-level="ok"] .ops-log__msg {
    color: var(--status-ok);
  }
  .ops-log__line[data-level="warn"] .ops-log__msg {
    color: var(--status-warn);
  }
  .ops-log__line[data-level="error"] .ops-log__msg {
    color: var(--status-err);
  }
  .ok {
    color: var(--status-ok);
  }
  .err {
    color: var(--status-err);
  }
  .muted {
    color: var(--text-3);
  }
  .mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
</style>
