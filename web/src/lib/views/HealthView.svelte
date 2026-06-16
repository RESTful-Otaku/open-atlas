<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Database,
    Power,
    PowerOff,
    RadioTower,
    RefreshCw,
    Sparkles,
    XCircle,
  } from "@lucide/svelte";

  import { reconnectNow } from "../connection.svelte";
  import { connectionErrorDisplay } from "../connection-errors.ts";
  import {
    feedLive,
    refreshFeedLive,
    summarizeFeeds,
  } from "../feed-live.svelte";
  import { formatLastPoll, formatNextPoll } from "../feed-config";
  import { acquireOpsPolling, opsObservability } from "../observability/observability.svelte";
  import { readiness, refreshRemoteReadiness } from "../readiness.svelte";
  import { dashboard } from "../state.svelte";
  import { getOpsLogLines } from "../observability/log-stream";

  let pollingDispose: (() => void) | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let refreshing = $state(false);

  const fmtUptime = (sec: number): string => {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const connDisplay = $derived(connectionErrorDisplay(dashboard.connectionLastError));

  const feedSummary = $derived(summarizeFeeds(feedLive.catalog));

  const connPillar = $derived.by((): "live" | "degraded" | "offline" => {
    if (dashboard.dataMode === "demo") return "degraded";
    if (dashboard.connection === "live") return "live";
    if (dashboard.connection === "connecting") return "degraded";
    return "offline";
  });

  const ingestPillar = $derived.by(() => {
    if (readiness.ingestReady === null) return "unknown" as const;
    return readiness.ingestReady ? "live" as const : "offline" as const;
  });

  const llmPillar = $derived.by(() => {
    if (readiness.llmReady === null) return "unknown" as const;
    return readiness.llmReady ? "live" as const : "offline" as const;
  });

  const prometheus = $derived(opsObservability.snapshot?.prometheus ?? {});

  const recentErrors = $derived(
    getOpsLogLines()
      .filter((l) => l.level === "error" || l.level === "warn")
      .slice(-20)
      .reverse(),
  );

  async function refreshAll(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    try {
      await Promise.all([refreshRemoteReadiness(), refreshFeedLive()]);
    } finally {
      refreshing = false;
    }
  }

  function reconnect(): void {
    reconnectNow();
  }

  onMount(() => {
    pollingDispose = acquireOpsPolling({ verboseLogs: false });
    void refreshAll();
    refreshTimer = setInterval(() => void refreshAll(), 30_000);
  });

  onDestroy(() => {
    pollingDispose?.();
    if (refreshTimer) clearInterval(refreshTimer);
  });
</script>

<div class="health-view">
  <div class="header">
    <h1>System Health</h1>
    <div class="header-actions">
      <button type="button" class="btn" onclick={reconnect} disabled={dashboard.dataMode === "demo"}>
        <Power size={14} /> Reconnect STDB
      </button>
      <button type="button" class="btn" onclick={() => void refreshAll()} disabled={refreshing}>
        <span class:spin={refreshing}><RefreshCw size={14} /></span> Refresh
      </button>
    </div>
  </div>

  <div class="cards">
    <!-- STDB Connection -->
    <div class="card" class:card-border-ok={connPillar === "live"} class:card-border-warn={connPillar === "degraded"} class:card-border-err={connPillar === "offline"}>
      <div class="card-header">
        <Database size={16} />
        <h2>SpacetimeDB</h2>
        <span class="pill" data-tier={connPillar}>
          {dashboard.dataMode === "demo" ? "Preview" : connPillar === "live" ? "Live" : connPillar === "degraded" ? "Connecting" : "Offline"}
        </span>
      </div>
      <div class="card-body">
        <div class="detail-grid">
          <div class="detail">
            <span class="detail-label">Data mode</span>
            <span class="detail-value">{dashboard.dataMode}</span>
          </div>
          <div class="detail">
            <span class="detail-label">Connection</span>
            <span class="detail-value">{dashboard.connection}</span>
          </div>
          {#if dashboard.autoReconnectAttempt > 0}
            <div class="detail">
              <span class="detail-label">Reconnect attempt</span>
              <span class="detail-value">{dashboard.autoReconnectAttempt}/8</span>
            </div>
          {/if}
          {#if dashboard.autoReconnectExhausted}
            <div class="detail">
              <span class="detail-label">Auto-reconnect</span>
              <span class="detail-value error-text">Exhausted</span>
            </div>
          {/if}
        </div>
        {#if connDisplay}
          <div class="error-card">
            <AlertTriangle size={14} />
            <div>
              <strong>{connDisplay.summary}</strong>
              <p>{connDisplay.remediation}</p>
              <code>{connDisplay.raw}</code>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Ingest Service -->
    <div class="card" class:card-border-ok={ingestPillar === "live"} class:card-border-err={ingestPillar === "offline"} class:card-border-warn={ingestPillar === "unknown"}>
      <div class="card-header">
        <RadioTower size={16} />
        <h2>Ingest Service</h2>
        <span class="pill" data-tier={ingestPillar}>
          {ingestPillar === "live" ? "Up" : ingestPillar === "unknown" ? "Checking…" : "Down"}
        </span>
      </div>
      <div class="card-body">
        <div class="detail-grid">
          <div class="detail">
            <span class="detail-label">Mode</span>
            <span class="detail-value">{readiness.ingestStatus?.ingest_mode ?? "—"}</span>
          </div>
          <div class="detail">
            <span class="detail-label">Uptime</span>
            <span class="detail-value">{readiness.ingestStatus?.uptime_seconds != null ? fmtUptime(readiness.ingestStatus.uptime_seconds) : "—"}</span>
          </div>
          <div class="detail">
            <span class="detail-label">STDB reachable</span>
            <span class="detail-value">{readiness.ingestStatus?.stdb_reachable === true ? "Yes" : "No"}</span>
          </div>
          <div class="detail">
            <span class="detail-label">STDB events</span>
            <span class="detail-value">{readiness.ingestStatus?.stdb_event_count ?? "—"}</span>
          </div>
        </div>
        {#if readiness.ingestCheckErr}
          <div class="error-card">
            <AlertTriangle size={14} />
            <div>
              <code>{readiness.ingestCheckErr}</code>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- LLM Bridge -->
    <div class="card" class:card-border-ok={llmPillar === "live"} class:card-border-err={llmPillar === "offline"} class:card-border-warn={llmPillar === "unknown"}>
      <div class="card-header">
        <Sparkles size={16} />
        <h2>LLM Bridge</h2>
        <span class="pill" data-tier={llmPillar}>
          {llmPillar === "live" ? "Ready" : llmPillar === "unknown" ? "Checking…" : "Unreachable"}
        </span>
      </div>
      <div class="card-body">
        <div class="detail-grid">
          <div class="detail">
            <span class="detail-label">Status</span>
            <span class="detail-value">{readiness.llmReady === true ? "Ready" : readiness.llmReady === false ? "Not ready" : "Unknown"}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Feeds -->
  <div class="section">
    <div class="section-header">
      <Activity size={16} />
      <h2>Feed Health</h2>
      {#if feedSummary}
        <span class="summary-badge">{feedSummary.ok}/{feedSummary.total} OK</span>
      {:else if feedLive.error}
        <span class="summary-badge error-text">{feedLive.error}</span>
      {:else if feedLive.loading}
        <span class="summary-badge">Loading…</span>
      {/if}
    </div>

    {#if feedLive.catalog?.feeds?.length}
      <div class="table-wrap">
        <table class="feed-table">
          <thead>
            <tr>
              <th>Feed</th>
              <th>Status</th>
              <th>Circuit</th>
              <th>Last poll</th>
              <th>Next poll</th>
              <th>Success/Fail</th>
              <th>Last error</th>
            </tr>
          </thead>
          <tbody>
            {#each feedLive.catalog.feeds as feed (feed.name)}
              <tr>
                <td class="feed-name">{feed.label || feed.name}</td>
                <td>
                  <span class="status-pill" data-status={feed.connection}>
                    {feed.connection}
                  </span>
                </td>
                <td>
                  {#if feed.circuit_open}
                    <span class="circuit-badge open" title="Circuit breaker open — auto-recovery pending">
                      <PowerOff size={12} /> Open
                    </span>
                  {:else if feed.consecutive_failures > 0}
                    <span class="circuit-badge degraded">
                      <AlertTriangle size={12} /> {feed.consecutive_failures}x fail
                    </span>
                  {:else}
                    <span class="circuit-badge closed">
                      <CheckCircle2 size={12} /> Closed
                    </span>
                  {/if}
                  {#if feed.next_retry_ms != null}
                    <span class="retry-hint">retry in {Math.ceil(feed.next_retry_ms / 1000)}s</span>
                  {/if}
                </td>
                <td class="time">{formatLastPoll(feed.last_poll_at)}</td>
                <td class="time">{formatNextPoll(feed.next_poll_at)}</td>
                <td class="num">
                  <span class="ok-num">{feed.success_count}</span>
                  /
                  <span class="err-num">{feed.failure_count}</span>
                </td>
                <td class="err-cell">{feed.last_error ?? "—"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if feedLive.error}
      <div class="empty-state">
        <XCircle size={20} />
        <span>Failed to load feed catalog: {feedLive.error}</span>
      </div>
    {:else if !feedLive.catalog}
      <div class="empty-state">
        <Activity size={20} />
        <span>Feed catalog not available (ingest may be offline or in demo mode)</span>
      </div>
    {/if}
  </div>

  <!-- Prometheus Metrics -->
  <div class="section">
    <div class="section-header">
      <Activity size={16} />
      <h2>Ingest Metrics</h2>
    </div>
    {#if Object.keys(prometheus).length > 0}
      <div class="metric-grid">
        {#each Object.entries(prometheus) as [name, value]}
          <div class="metric-card">
            <span class="metric-label">{name}</span>
            <span class="metric-value">{value?.toLocaleString() ?? "—"}</span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty-state">
        <Activity size={20} />
        <span>No metrics available</span>
      </div>
    {/if}
  </div>

  <!-- Recent Errors -->
  <div class="section">
    <div class="section-header">
      <AlertTriangle size={16} />
      <h2>Recent Warnings &amp; Errors</h2>
    </div>
    {#if recentErrors.length > 0}
      <div class="log-list">
        {#each recentErrors as line, i (i)}
          <div class="log-line" data-level={line.level}>
            <span class="log-time">{new Date(line.ts).toLocaleTimeString()}</span>
            <span class="log-level">{line.level}</span>
            <span class="log-source">{line.source}</span>
            <span class="log-msg">{line.message}</span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty-state">
        <CheckCircle2 size={20} />
        <span>No recent warnings or errors</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .health-view {
    padding: 24px;
    max-width: 960px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .header h1 {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-1);
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .btn:hover:not(:disabled) {
    color: var(--accent);
    border-color: var(--border-2);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .card {
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .card-border-ok { border-left: 3px solid var(--status-ok, #22c55e); }
  .card-border-warn { border-left: 3px solid var(--status-warn, #f59e0b); }
  .card-border-err { border-left: 3px solid var(--status-err, #ef4444); }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border-1);
    color: var(--text-2);
  }

  .card-header h2 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-1);
    margin: 0;
    flex: 1;
  }

  .pill {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    border-radius: 999px;
  }

  .pill[data-tier="live"] { background: color-mix(in srgb, var(--status-ok, #22c55e) 15%, transparent); color: var(--status-ok, #22c55e); }
  .pill[data-tier="degraded"] { background: color-mix(in srgb, var(--status-warn, #f59e0b) 15%, transparent); color: var(--status-warn, #f59e0b); }
  .pill[data-tier="offline"] { background: color-mix(in srgb, var(--status-err, #ef4444) 15%, transparent); color: var(--status-err, #ef4444); }
  .pill[data-tier="unknown"] { background: color-mix(in srgb, var(--text-3) 15%, transparent); color: var(--text-3); }

  .card-body {
    padding: 12px 16px;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .detail {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .detail-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
  }

  .detail-value {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-1);
  }

  .error-text {
    color: var(--status-err, #ef4444) !important;
  }

  .error-card {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--status-err, #ef4444) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--status-err, #ef4444) 20%, transparent);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--text-2);
  }

  .error-card strong {
    display: block;
    margin-bottom: 4px;
    color: var(--status-err, #ef4444);
  }

  .error-card p {
    margin: 0 0 4px 0;
    line-height: 1.4;
  }

  .error-card code {
    display: block;
    font-size: 11px;
    color: var(--text-3);
    word-break: break-all;
  }

  .section {
    margin-bottom: 24px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    color: var(--text-2);
  }

  .section-header h2 {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-1);
    margin: 0;
    flex: 1;
  }

  .summary-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    color: var(--text-2);
  }

  .table-wrap {
    overflow-x: auto;
  }

  .feed-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .feed-table th {
    text-align: left;
    padding: 8px 10px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
    border-bottom: 1px solid var(--border-1);
    white-space: nowrap;
  }

  .feed-table td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-1);
    color: var(--text-2);
    vertical-align: middle;
  }

  .feed-table tr:hover td {
    background: var(--overlay);
  }

  .feed-name {
    font-weight: 600;
    color: var(--text-1);
    white-space: nowrap;
  }

  .status-pill {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: capitalize;
  }

  .status-pill[data-status="ok"] { background: color-mix(in srgb, var(--status-ok, #22c55e) 12%, transparent); color: var(--status-ok, #22c55e); }
  .status-pill[data-status="degraded"],
  .status-pill[data-status="starting"] { background: color-mix(in srgb, var(--status-warn, #f59e0b) 12%, transparent); color: var(--status-warn, #f59e0b); }
  .status-pill[data-status="error"],
  .status-pill[data-status="circuit_open"] { background: color-mix(in srgb, var(--status-err, #ef4444) 12%, transparent); color: var(--status-err, #ef4444); }
  .status-pill[data-status="idle"],
  .status-pill[data-status="disabled"],
  .status-pill[data-status="mode_off"] { background: color-mix(in srgb, var(--text-3) 12%, transparent); color: var(--text-3); }

  .circuit-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .circuit-badge.open { background: color-mix(in srgb, var(--status-err, #ef4444) 12%, transparent); color: var(--status-err, #ef4444); }
  .circuit-badge.degraded { background: color-mix(in srgb, var(--status-warn, #f59e0b) 12%, transparent); color: var(--status-warn, #f59e0b); }
  .circuit-badge.closed { background: color-mix(in srgb, var(--status-ok, #22c55e) 12%, transparent); color: var(--status-ok, #22c55e); }

  .retry-hint {
    display: block;
    font-size: 10px;
    color: var(--text-3);
    margin-top: 2px;
  }

  .time {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .num {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .ok-num { color: var(--status-ok, #22c55e); }
  .err-num { color: var(--status-err, #ef4444); }

  .err-cell {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-3);
    font-size: 11px;
  }

  .empty-state {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 24px;
    color: var(--text-3);
    font-size: 13px;
    justify-content: center;
  }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
  }

  .metric-card {
    padding: 10px 12px;
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .metric-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
  }

  .metric-value {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-1);
    font-variant-numeric: tabular-nums;
  }

  .log-list {
    border: 1px solid var(--border-1);
    border-radius: var(--radius-sm);
    overflow: hidden;
    font-family: ui-monospace, monospace;
    font-size: 11px;
  }

  .log-line {
    display: grid;
    grid-template-columns: 70px 48px 60px 1fr;
    gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border-1);
    align-items: start;
  }

  .log-line:last-child {
    border-bottom: none;
  }

  .log-line[data-level="error"] { background: color-mix(in srgb, var(--status-err, #ef4444) 6%, transparent); }
  .log-line[data-level="warn"] { background: color-mix(in srgb, var(--status-warn, #f59e0b) 6%, transparent); }

  .log-time { color: var(--text-3); }
  .log-level {
    font-weight: 600;
    text-transform: uppercase;
  }
  .log-line[data-level="error"] .log-level { color: var(--status-err, #ef4444); }
  .log-line[data-level="warn"] .log-level { color: var(--status-warn, #f59e0b); }
  .log-source { color: var(--text-3); }
  .log-msg {
    color: var(--text-2);
    word-break: break-word;
  }

  .spin {
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 720px) {
    .health-view { padding: 16px; }
    .cards { grid-template-columns: 1fr; }
    .feed-table { font-size: 11px; }
    .feed-table th, .feed-table td { padding: 6px 8px; }
    .log-line { grid-template-columns: 60px 40px 50px 1fr; }
  }
</style>
