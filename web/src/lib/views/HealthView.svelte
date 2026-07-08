<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    Activity,
    AlertTriangle,
    BarChart3,
    CheckCircle2,
    Clock,
    Database,
    GripVertical,
    Eye,
    EyeOff,
    Power,
    PowerOff,
    RadioTower,
    RefreshCw,
    Search,
    Settings2,
    Sparkles,
    XCircle,
    Filter,
    X,
  } from "@lucide/svelte";

  import FullscreenChartShell from "../viz/FullscreenChartShell.svelte";
  import type { EChartsOption } from "echarts";

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
  import { getOpsLogLines, type LogLevel } from "../observability/log-stream";
  import {
    loadLayout,
    saveLayout,
    defaultLayout,
    type HealthViewLayout,
  } from "./health-view-layout";
  import {
    pushSnapshot,
    getHistory,
    clearHistory,
    STATUS_COLORS,
  } from "./health-view-history";
  import {
    updateInterval,
    getUpdateIntervalMs,
  } from "../update-interval.svelte";

  let pollingDispose: (() => void) | null = null;
  let refreshing = $state(false);
  let snapPushGen = $state(0);

  function pushHealthSnapshot(): void {
    pushSnapshot({
      at: new Date().toISOString(),
      connPillar,
      ingestPillar,
      llmPillar,
      prometheus: { ...prometheus },
    });
    snapPushGen++;
  }
  let logSearch = $state("");
  let logLevelFilter = $state<LogLevel | "all">("all");
  let logSourceFilter = $state("all");
  let expandedLogIdx = $state<number | null>(null);
  let editMode = $state(false);
  let layout = $state<HealthViewLayout>(loadLayout());
  let draggedWidgetId = $state<string | null>(null);
  let dragOverWidgetId = $state<string | null>(null);

  const escapeHtml = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

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
  const allLogLines = $derived(getOpsLogLines().slice().reverse());
  const loading = $derived(feedLive.loading && !feedLive.catalog);

  const logSources = $derived.by<string[]>(() => {
    const s = new Set<string>();
    for (const l of allLogLines) s.add(l.source);
    return [...s].sort();
  });

  const filteredLogs = $derived(
    allLogLines.filter((l) => {
      if (logLevelFilter !== "all" && l.level !== logLevelFilter) return false;
      if (logSourceFilter !== "all" && l.source !== logSourceFilter) return false;
      if (logSearch) {
        const q = logSearch.toLowerCase();
        if (!l.message.toLowerCase().includes(q) && !l.source.toLowerCase().includes(q) && !l.level.toLowerCase().includes(q)) return false;
      }
      return true;
    }).slice(0, 200),
  );

  const logLevelCounts = $derived.by(() => {
    let err = 0, warn = 0, info = 0, ok = 0;
    for (const l of allLogLines) { if (l.level === "error") err++; else if (l.level === "warn") warn++; else if (l.level === "info") info++; else if (l.level === "ok") ok++; }
    return { err, warn, info, ok };
  });

  const sortedWidgets = $derived(
    layout.widgets.filter((w) => editMode || w.visible).sort((a, b) => a.order - b.order),
  );

  const history = $derived.by(() => {
    snapPushGen;
    return getHistory();
  });

  const timelineRows = $derived.by(() => {
    const h = history;
    if (!h.length) return [];
    const svcs: { id: string; label: string; key: "connPillar" | "ingestPillar" | "llmPillar" }[] = [
      { id: "stdb", label: "STDB", key: "connPillar" },
      { id: "ingest", label: "Ingest", key: "ingestPillar" },
      { id: "llm", label: "LLM", key: "llmPillar" },
    ];
    return svcs.map((svc) => ({
      ...svc,
      blocks: h.map((s) => STATUS_COLORS[s[svc.key]] ?? STATUS_COLORS.unknown),
    }));
  });

  const lastUpdatedLabel = $derived(
    history.length > 0 ? new Date(history[history.length - 1].at).toLocaleTimeString() : new Date().toLocaleTimeString(),
  );

  interface TrafficSeriesDatum {
    name: string;
    data: [string, number][];
    _color: string;
  }

  const trafficRateOption = $derived.by((): EChartsOption | null => {
    const h = history;
    if (h.length < 2) return null;
    const seriesData: TrafficSeriesDatum[] = [];
    const keys = [
      "openatlas_ingest_events_accepted_total",
      "openatlas_ingest_events_fetched_total",
      "openatlas_ingest_events_rejected_total",
      "openatlas_ingest_events_transport_error_total",
    ] as const;
    const palette = ["#22c55e", "#22d3ee", "#a78bfa", "#ef4444"];
    let hasData = false;
    keys.forEach((key, ki) => {
      const points: [string, number][] = [];
      for (let i = 1; i < h.length; i++) {
        const prev = h[i - 1].prometheus[key];
        const cur = h[i].prometheus[key];
        if (prev == null || cur == null || cur < prev) continue;
        const delta = cur - prev;
        const dt = (new Date(h[i].at).getTime() - new Date(h[i - 1].at).getTime()) / 1000;
        const rate = dt > 0 ? delta / dt : 0;
        points.push([h[i].at, Math.round(rate * 100) / 100]);
      }
      if (points.length > 0) {
        hasData = true;
        seriesData.push({
          name: key.replace(/^openatlas_ingest_/, "").replace(/_total$/, "").replace(/_/g, " "),
          data: points,
          _color: palette[ki],
        });
      }
    });
    if (!hasData) return null;
    return {
      tooltip: { trigger: "axis", valueFormatter: (v: unknown) => `${Number(v as number).toFixed(2)}/s` },
      legend: { show: true, bottom: 0, textStyle: { fontSize: 10 }, itemWidth: 10, itemHeight: 8 },
      grid: { left: 50, right: 16, top: 8, bottom: 32, containLabel: true },
      xAxis: { type: "time", axisLabel: { fontSize: 10, hideOverlap: true } },
      yAxis: { type: "value", axisLabel: { fontSize: 10 }, min: 0 },
      series: seriesData.map((s) => ({
        type: "line",
        name: s.name,
        data: s.data,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2 },
        itemStyle: { color: s._color },
        areaStyle: { opacity: 0.08 },
      })),
    };
  });

  const feedDonutOption = $derived.by((): EChartsOption | null => {
    if (!feedSummary) return null;
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      series: [{
        type: "pie",
        radius: ["55%", "80%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: "transparent", borderWidth: 0 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: "bold" }, itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.4)" } },
        data: [
          { value: feedSummary.ok, name: "OK", itemStyle: { color: "#22c55e" } },
          { value: feedSummary.degraded, name: "Degraded", itemStyle: { color: "#f59e0b" } },
          { value: feedSummary.error, name: "Error", itemStyle: { color: "#ef4444" } },
          { value: feedSummary.idle, name: "Idle", itemStyle: { color: "#71717a" } },
        ],
      }],
    };
  });

  const circuitChartOption = $derived.by((): EChartsOption | null => {
    const feeds = feedLive.catalog?.feeds;
    if (!feeds?.length) return null;
    const open = feeds.filter((f) => f.circuit_open).length;
    const degraded = feeds.filter((f) => !f.circuit_open && f.consecutive_failures > 0).length;
    const closed = feeds.filter((f) => !f.circuit_open && f.consecutive_failures === 0).length;
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 60, right: 20, top: 6, bottom: 6, containLabel: true },
      xAxis: { type: "value", show: false },
      yAxis: { type: "category", data: [""], axisLabel: { show: false }, axisTick: { show: false }, axisLine: { show: false }, splitLine: { show: false } },
      series: [
        { type: "bar", stack: "total", barWidth: 20, data: [{ value: closed, itemStyle: { color: "#22c55e" } }], label: { show: true, position: "inside", formatter: `Closed: ${closed}`, color: "#fff", fontSize: 11 } },
        { type: "bar", stack: "total", barWidth: 20, data: [{ value: degraded, itemStyle: { color: "#f59e0b" } }], label: { show: true, position: "inside", formatter: `Degraded: ${degraded}`, color: "#fff", fontSize: 11 } },
        { type: "bar", stack: "total", barWidth: 20, data: [{ value: open, itemStyle: { color: "#ef4444" } }], label: { show: true, position: "inside", formatter: `Open: ${open}`, color: "#fff", fontSize: 11 } },
      ],
    };
  });

  const pipelineOption = $derived.by((): EChartsOption | null => {
    const p = prometheus;
    if (!Object.keys(p).length) return null;
    const accepted = p.openatlas_ingest_events_accepted_total ?? 0;
    const fetched = p.openatlas_ingest_events_fetched_total ?? 0;
    const duplicate = p.openatlas_ingest_events_duplicate_total ?? 0;
    const rejected = p.openatlas_ingest_events_rejected_total ?? 0;
    const transportErr = p.openatlas_ingest_events_transport_error_total ?? 0;
    const batch = p.openatlas_ingest_batch_calls_total ?? 0;
    const batchFallback = p.openatlas_ingest_batch_fallback_calls_total ?? 0;
    const maxVal = Math.max(accepted, fetched, duplicate, rejected, transportErr, batch, batchFallback, 1);
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 100, right: 50, top: 10, bottom: 10, containLabel: true },
      xAxis: { type: "value", max: maxVal * 1.15, axisLabel: { fontSize: 10, hideOverlap: true } },
      yAxis: { type: "category", data: ["Accepted", "Fetched", "Duplicate", "Rejected", "Transport Err", "Batch Calls", "Batch Fallback"], axisLabel: { fontSize: 10 } },
      series: [{
        type: "bar", barWidth: 14,
        label: { show: true, position: "right", fontSize: 10, fontWeight: 600, formatter: (p: { value: unknown }) => { const v = Number(p.value); return v > 0 ? v.toLocaleString() : "" } },
        data: [
          { value: accepted, itemStyle: { color: "#22c55e" } },
          { value: fetched, itemStyle: { color: "#22d3ee" } },
          { value: duplicate, itemStyle: { color: "#f59e0b" } },
          { value: rejected, itemStyle: { color: "#a78bfa" } },
          { value: transportErr, itemStyle: { color: "#ef4444" } },
          { value: batch, itemStyle: { color: "#60a5fa" } },
          { value: batchFallback, itemStyle: { color: "#f472b6" } },
        ],
      }],
    };
  });

  const metricsBarOption = $derived.by((): EChartsOption | null => {
    const entries = Object.entries(prometheus).filter(([, v]) => v != null && v > 0);
    if (!entries.length) return null;
    const labels = entries.map(([k]) => k.replace(/^openatlas_ingest_/, "").replace(/_total$/, "").replace(/_/g, " "));
    const values = entries.map(([, v]) => v!);
    const maxVal = Math.max(...values, 1);
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 110, right: 50, top: 10, bottom: 10, containLabel: true },
      xAxis: { type: "value", max: maxVal * 1.15, axisLabel: { fontSize: 10, hideOverlap: true } },
      yAxis: { type: "category", data: labels, axisLabel: { fontSize: 10 } },
      series: [{ type: "bar", barWidth: 14, label: { show: true, position: "right", fontSize: 10, fontWeight: 600, formatter: (p: { value: unknown }) => Number(p.value).toLocaleString() }, data: values.map((v) => ({ value: v, itemStyle: { color: "#22d3ee" } })) }],
    };
  });

  function reorderWidgets(fromId: string, toId: string): void {
    const widgets = [...layout.widgets];
    const fromIdx = widgets.findIndex((w) => w.id === fromId);
    const toIdx = widgets.findIndex((w) => w.id === toId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const [moved] = widgets.splice(fromIdx, 1);
    widgets.splice(toIdx, 0, moved);
    layout = { widgets: widgets.map((w, i) => ({ ...w, order: i })) };
    saveLayout(layout);
  }

  function handleDragStart(e: DragEvent, id: string): void {
    draggedWidgetId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    }
  }

  function handleDragOver(e: DragEvent, id: string): void {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    dragOverWidgetId = id;
  }

  function handleDragLeave(): void {
    dragOverWidgetId = null;
  }

  function handleDrop(e: DragEvent, id: string): void {
    e.preventDefault();
    const fromId = e.dataTransfer?.getData("text/plain") || draggedWidgetId;
    if (fromId) reorderWidgets(fromId, id);
    draggedWidgetId = null;
    dragOverWidgetId = null;
  }

  function handleDragEnd(): void {
    draggedWidgetId = null;
    dragOverWidgetId = null;
  }

  function toggleWidget(id: string): void {
    const widgets = layout.widgets.map((w) => w.id === id ? { ...w, visible: !w.visible } : w);
    layout = { widgets };
    saveLayout(layout);
  }

  function toggleEditMode(): void { editMode = !editMode; }

  function resetLayout(): void { layout = defaultLayout(); saveLayout(layout); }

  let refreshStartedAt = 0;

  async function refreshAll(): Promise<void> {
    if (refreshing) {
      if (Date.now() - refreshStartedAt < 30_000) return;
    }
    refreshStartedAt = Date.now();
    refreshing = true;
    try {
      await Promise.all([refreshRemoteReadiness(), refreshFeedLive()]);
      pushHealthSnapshot();
    } finally {
      refreshing = false;
    }
  }

  function reconnect(): void { reconnectNow(); }

  function clearFilters(): void { logSearch = ""; logLevelFilter = "all"; logSourceFilter = "all"; }

  onMount(() => {
    pollingDispose = acquireOpsPolling({ verboseLogs: false });
    clearHistory();
    pushHealthSnapshot();
    void refreshAll();
  });

  onDestroy(() => {
    pollingDispose?.();
  });

  // $effect(() => {
  //   updateInterval.id;
  //   const ms = Math.max(1_000, getUpdateIntervalMs());
  //   const timer = setInterval(() => void refreshAll(), ms);
  //   return () => clearInterval(timer);
  // });
  $effect(() => {
    updateInterval.id;
    const ms = Math.max(1_000, getUpdateIntervalMs());
    const timer = setInterval(() => void refreshAll(), ms);
    return () => clearInterval(timer);
  });


</script>

<div class="health-view" class:edit-mode={editMode}>
  <div class="header">
    <div class="header-left">
      <h1>System Health</h1>
      <span class="last-updated" title="Refreshes at update interval">
        <RefreshCw size={11} />
        {lastUpdatedLabel}
      </span>
    </div>
    <div class="header-actions">
      <button type="button" class="btn" class:btn--active={editMode} onclick={toggleEditMode}>
        <Settings2 size={14} /> Customize
      </button>
      <button type="button" class="btn" onclick={reconnect} disabled={dashboard.dataMode === "demo"}>
        <Power size={14} /> Reconnect
      </button>
      <button type="button" class="btn" onclick={() => void refreshAll()} disabled={refreshing}>
        <span class:spin={refreshing}><RefreshCw size={14} /></span> Refresh
      </button>
    </div>
  </div>

  {#if editMode}
    <div class="edit-panel">
      <div class="edit-panel-header">
        <Settings2 size={14} />
        <span>Customize Dashboard</span>
        <button type="button" class="btn btn--sm" onclick={resetLayout}><RefreshCw size={11} /> Reset to defaults</button>
      </div>
      <div class="edit-panel-body">
        {#each [...layout.widgets].sort((a, b) => a.order - b.order) as widget (widget.id)}
          <div
            class="edit-row"
            class:edit-row--hidden={!widget.visible}
            class:edit-row--dragover={dragOverWidgetId === widget.id}
            class:edit-row--dragging={draggedWidgetId === widget.id}
            draggable="true"
            ondragstart={(e) => handleDragStart(e, widget.id)}
            ondragover={(e) => handleDragOver(e, widget.id)}
            ondragleave={handleDragLeave}
            ondrop={(e) => handleDrop(e, widget.id)}
            ondragend={handleDragEnd}
            role="listitem"
          >
            <span class="edit-row-grip"><GripVertical size={14} /></span>
            <span class="edit-row-label">{widget.label}</span>
            <div class="edit-row-actions">
              <button type="button" class="edit-row-btn" title={widget.visible ? "Hide" : "Show"} onclick={() => toggleWidget(widget.id)}>
                {#if widget.visible}<Eye size={14} />{:else}<EyeOff size={14} />{/if}
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#each sortedWidgets as widget (widget.id)}
    {#if widget.id === "service-cards"}
      <div class="cards">
        <div class="card" data-tier={connPillar}>
          <div class="card-header"><Database size={16} /><h2>SpacetimeDB</h2><span class="pill" data-tier={connPillar}>{dashboard.dataMode === "demo" ? "Preview" : connPillar === "live" ? "Live" : connPillar === "degraded" ? "Connecting" : "Offline"}</span></div>
          <div class="card-body">
            <div class="detail-grid">
              <div class="detail"><span class="detail-label">Data mode</span><span class="detail-value">{dashboard.dataMode}</span></div>
              <div class="detail"><span class="detail-label">Connection</span><span class="detail-value">{dashboard.connection}</span></div>
              {#if dashboard.autoReconnectAttempt > 0}<div class="detail"><span class="detail-label">Reconnect attempt</span><span class="detail-value">{dashboard.autoReconnectAttempt}/8</span></div>{/if}
              {#if dashboard.autoReconnectExhausted}<div class="detail"><span class="detail-label">Auto-reconnect</span><span class="detail-value error-text">Exhausted</span></div>{/if}
            </div>
            {#if connDisplay}
              <div class="error-card"><AlertTriangle size={14} /><div><strong>{connDisplay.summary}</strong><p>{connDisplay.remediation}</p><code>{escapeHtml(connDisplay.raw)}</code></div></div>
            {/if}
          </div>
        </div>
        <div class="card" data-tier={ingestPillar}>
          <div class="card-header"><RadioTower size={16} /><h2>Ingest Service</h2><span class="pill" data-tier={ingestPillar}>{ingestPillar === "live" ? "Up" : ingestPillar === "unknown" ? "Checking\u2026" : "Down"}</span></div>
          <div class="card-body">
            <div class="detail-grid">
              <div class="detail"><span class="detail-label">Mode</span><span class="detail-value">{readiness.ingestStatus?.ingest_mode ?? "\u2014"}</span></div>
              <div class="detail"><span class="detail-label">Uptime</span><span class="detail-value">{readiness.ingestStatus?.uptime_seconds != null ? fmtUptime(readiness.ingestStatus.uptime_seconds) : "\u2014"}</span></div>
              <div class="detail"><span class="detail-label">STDB reachable</span><span class="detail-value"><span class="live-dot" data-live={readiness.ingestStatus?.stdb_reachable ?? false}></span>{readiness.ingestStatus?.stdb_reachable === true ? "Yes" : "No"}</span></div>
              <div class="detail"><span class="detail-label">STDB events</span><span class="detail-value">{readiness.ingestStatus?.stdb_event_count ?? "\u2014"}</span></div>
            </div>
            {#if readiness.ingestCheckErr}<div class="error-card"><AlertTriangle size={14} /><div><code>{escapeHtml(readiness.ingestCheckErr)}</code></div></div>{/if}
          </div>
        </div>
        <div class="card" data-tier={llmPillar}>
          <div class="card-header"><Sparkles size={16} /><h2>LLM Bridge</h2><span class="pill" data-tier={llmPillar}>{llmPillar === "live" ? "Ready" : llmPillar === "unknown" ? "Checking\u2026" : "Unreachable"}</span></div>
          <div class="card-body">
            <div class="detail-grid">
              <div class="detail"><span class="detail-label">Status</span><span class="detail-value"><span class="live-dot" data-live={readiness.llmReady === true}></span>{readiness.llmReady === true ? "Ready" : readiness.llmReady === false ? "Not ready" : "Unknown"}</span></div>
            </div>
          </div>
        </div>
      </div>

    {:else if widget.id === "service-history"}
      <div class="section">
        <div class="section-header">
          <Clock size={16} />
          <h2>Service Status Timeline</h2>
          {#if history.length > 0}
            <span class="summary-badge">{history.length} samples</span>
          {/if}
        </div>
        {#if timelineRows.length > 0}
          <div class="timeline-grid">
            {#each timelineRows as row}
              <div class="timeline-row">
                <span class="timeline-label">{row.label}</span>
                <div class="timeline-bar" title={`${row.label}: last ${history.length} polls (~${history.length * 0.5}min)`}>
                  {#each row.blocks as color}
                    <span class="timeline-block" style="background:{color}"></span>
                  {/each}
                </div>
              </div>
            {/each}
            <div class="timeline-legend">
              <span class="timeline-legend-item"><span class="legend-dot" style="background:#22c55e"></span> Live</span>
              <span class="timeline-legend-item"><span class="legend-dot" style="background:#f59e0b"></span> Degraded</span>
              <span class="timeline-legend-item"><span class="legend-dot" style="background:#ef4444"></span> Offline</span>
              <span class="timeline-legend-item"><span class="legend-dot" style="background:#71717a"></span> Unknown</span>
            </div>
          </div>
        {:else}
          <div class="empty-state"><Clock size={20} /><span>Collecting status samples\u2026</span></div>
        {/if}
      </div>

    {:else if widget.id === "feed-charts"}
      {#if feedSummary && feedDonutOption}
        <div class="viz-row">
          <div class="viz-card">
            <div class="viz-card-header"><Activity size={14} /><span>Feed Status</span><span class="summary-badge">{feedSummary.ok}/{feedSummary.total} OK</span></div>
            <div class="viz-card-body"><FullscreenChartShell title="Feed Status" option={feedDonutOption} embedClass="health-chart" embedInteractive={false} /></div>
            <div class="viz-card-footer">
              {#each [{ label: "OK", count: feedSummary.ok, cls: "ok" }, { label: "Degraded", count: feedSummary.degraded, cls: "warn" }, { label: "Error", count: feedSummary.error, cls: "err" }, { label: "Idle", count: feedSummary.idle, cls: "muted" }] as item}
                {#if item.count > 0}<span class="legend-dot" style="background:{item.cls === 'ok' ? '#22c55e' : item.cls === 'warn' ? '#f59e0b' : item.cls === 'err' ? '#ef4444' : '#71717a'}"></span><span class="legend-label">{item.label}</span><span class="legend-value">{item.count}</span>{/if}
              {/each}
            </div>
          </div>
          {#if circuitChartOption}
            <div class="viz-card">
              <div class="viz-card-header"><PowerOff size={14} /><span>Circuit Breakers</span></div>
              <div class="viz-card-body"><FullscreenChartShell title="Circuit Breakers" option={circuitChartOption} embedClass="health-chart health-chart--short" embedInteractive={false} /></div>
            </div>
          {/if}
        </div>
      {/if}

    {:else if widget.id === "pipeline-charts"}
      {#if pipelineOption}
        <div class="section">
          <div class="section-header"><Activity size={16} /><h2>Ingest Pipeline</h2></div>
          <div class="viz-row">
            <div class="viz-card">
              <div class="viz-card-header"><Activity size={14} /><span>Pipeline Flow</span></div>
              <div class="viz-card-body"><FullscreenChartShell title="Pipeline Flow" option={pipelineOption} embedClass="health-chart health-chart--pipeline" embedInteractive={false} /></div>
            </div>
            {#if metricsBarOption}
              <div class="viz-card">
                <div class="viz-card-header"><BarChart3 size={14} /><span>All Metrics</span></div>
                <div class="viz-card-body"><FullscreenChartShell title="All Metrics" option={metricsBarOption} embedClass="health-chart health-chart--pipeline" embedInteractive={false} /></div>
              </div>
            {/if}
          </div>
        </div>
      {/if}

    {:else if widget.id === "traffic-charts"}
      {#if trafficRateOption}
        <div class="section">
          <div class="section-header"><Activity size={16} /><h2>Event Rate &amp; Traffic</h2><span class="summary-badge">{history.length} samples</span></div>
          <div class="viz-card">
            <div class="viz-card-header"><BarChart3 size={14} /><span>Events per Second</span></div>
            <div class="viz-card-body"><FullscreenChartShell title="Events per Second" option={trafficRateOption} embedClass="health-chart health-chart--traffic" embedInteractive={false} /></div>
          </div>
        </div>
      {:else if history.length < 2}
        <div class="section">
          <div class="section-header"><Activity size={16} /><h2>Event Rate &amp; Traffic</h2></div>
          <div class="empty-state"><BarChart3 size={20} /><span>Collecting data\u2026 need at least 2 samples ({history.length}/2)</span></div>
        </div>
      {/if}

    {:else if widget.id === "feed-table"}
      <div class="section">
        <div class="section-header"><Activity size={16} /><h2>Feed Details</h2>{#if feedSummary}<span class="summary-badge">{feedSummary.ok}/{feedSummary.total} OK</span>{:else if feedLive.error}<span class="summary-badge error-text">{escapeHtml(feedLive.error)}</span>{:else if feedLive.loading}<span class="summary-badge">Loading\u2026</span>{/if}</div>
        {#if feedLive.catalog?.feeds?.length}
          <div class="table-wrap">
            <table class="feed-table">
              <thead><tr><th>Feed</th><th>Status</th><th>Circuit</th><th>Last poll</th><th>Next poll</th><th class="num-col">S/F</th><th>Ratio</th><th>Last error</th></tr></thead>
              <tbody>
                {#each feedLive.catalog.feeds as feed (feed.name)}
                  <tr>
                    <td class="feed-name">{feed.label || feed.name}</td>
                    <td><span class="status-pill" data-status={feed.connection}>{feed.connection}</span></td>
                    <td>
                      {#if feed.circuit_open}<span class="circuit-badge open" title="Circuit breaker open"><PowerOff size={12} /> Open</span>
                      {:else if feed.consecutive_failures > 0}<span class="circuit-badge degraded"><AlertTriangle size={12} /> {feed.consecutive_failures}x fail</span>
                      {:else}<span class="circuit-badge closed"><CheckCircle2 size={12} /> Closed</span>{/if}
                      {#if feed.next_retry_ms != null}<span class="retry-hint">retry in {Math.ceil(feed.next_retry_ms / 1000)}s</span>{/if}
                    </td>
                    <td class="time">{formatLastPoll(feed.last_poll_at)}</td>
                    <td class="time">{formatNextPoll(feed.next_poll_at)}</td>
                    <td class="num-col"><span class="ok-num">{feed.success_count}</span> / <span class="err-num">{feed.failure_count}</span></td>
                    <td class="ratio-cell">
                      {#if feed.success_count + feed.failure_count > 0}
                        {@const total = feed.success_count + feed.failure_count}
                        <div class="ratio-bar" title={`${feed.success_count} success / ${feed.failure_count} failure`}><div class="ratio-bar-fill" style="width: {(feed.success_count / total) * 100}%"></div></div>
                      {:else}<span class="no-data">\u2014</span>{/if}
                    </td>
                    <td class="err-cell" title={feed.last_error ? escapeHtml(feed.last_error) : undefined}>{feed.last_error ?? "\u2014"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else if loading}
          <div class="skeleton-list">{#each { length: 3 } as _, i (i)}<div class="skeleton-row"><div class="skeleton skeleton--short"></div><div class="skeleton skeleton--inline"></div><div class="skeleton skeleton--inline"></div><div class="skeleton skeleton--long"></div></div>{/each}</div>
        {:else if feedLive.error}
          <div class="empty-state"><XCircle size={20} /><span>Failed to load feed catalog: {escapeHtml(feedLive.error)}</span></div>
        {:else if !feedLive.catalog}
          <div class="empty-state"><Activity size={20} /><span>Feed catalog not available (ingest may be offline or in demo mode)</span></div>
        {/if}
      </div>

    {:else if widget.id === "ingest-metrics"}
      <div class="section">
        <div class="section-header"><Activity size={16} /><h2>Ingest Metrics</h2></div>
        {#if Object.keys(prometheus).length > 0}
          <div class="metric-grid">
            {#each Object.entries(prometheus) as [name, value]}
              <div class="metric-card"><span class="metric-label">{escapeHtml(name)}</span><span class="metric-value">{value?.toLocaleString() ?? "\u2014"}</span></div>
            {/each}
          </div>
        {:else}<div class="empty-state"><Activity size={20} /><span>No metrics available</span></div>{/if}
      </div>

    {:else if widget.id === "event-log"}
      <div class="section">
        <div class="section-header">
          <AlertTriangle size={16} />
          <h2>Event Log</h2>
          <span class="summary-badge">{filteredLogs.length}{#if logSearch || logLevelFilter !== "all" || logSourceFilter !== "all"} / {allLogLines.length}{/if}</span>
          {#if logSearch || logLevelFilter !== "all" || logSourceFilter !== "all"}<button type="button" class="btn btn--sm" onclick={clearFilters}><X size={11} /> Clear</button>{/if}
        </div>
        <div class="log-toolbar">
          <div class="log-search-wrap">
            <span class="log-search-icon"><Search size={13} /></span>
            <input type="text" class="log-search-input" placeholder="Search messages, sources, levels\u2026" bind:value={logSearch} />
            {#if logSearch}<button type="button" class="log-search-clear" onclick={() => logSearch = ""}><X size={12} /></button>{/if}
          </div>
          <div class="log-level-filters">
            <button type="button" class="log-filter-btn" class:active={logLevelFilter === "all"} onclick={() => logLevelFilter = "all"}>All ({allLogLines.length})</button>
            <button type="button" class="log-filter-btn log-filter-btn--err" class:active={logLevelFilter === "error"} onclick={() => logLevelFilter = "error"}>Error ({logLevelCounts.err})</button>
            <button type="button" class="log-filter-btn log-filter-btn--warn" class:active={logLevelFilter === "warn"} onclick={() => logLevelFilter = "warn"}>Warn ({logLevelCounts.warn})</button>
            <button type="button" class="log-filter-btn log-filter-btn--info" class:active={logLevelFilter === "info"} onclick={() => logLevelFilter = "info"}>Info ({logLevelCounts.info})</button>
            <button type="button" class="log-filter-btn log-filter-btn--ok" class:active={logLevelFilter === "ok"} onclick={() => logLevelFilter = "ok"}>OK ({logLevelCounts.ok})</button>
          </div>
          {#if logSources.length > 0}<div class="log-source-filter"><Filter size={12} /><select class="log-source-select" bind:value={logSourceFilter}><option value="all">All sources</option>{#each logSources as src}<option value={src}>{src}</option>{/each}</select></div>{/if}
        </div>
        {#if filteredLogs.length > 0}
          <div class="log-list">
            {#each filteredLogs as line, i (line.ts ?? i)}
              <div class="log-line" class:log-line--expanded={expandedLogIdx === i} data-level={line.level}
                onclick={() => expandedLogIdx = expandedLogIdx === i ? null : i}
                onkeydown={(e) => e.key === "Enter" && (expandedLogIdx = expandedLogIdx === i ? null : i)} role="button" tabindex="0"
              >
                <span class="log-time">{new Date(line.ts).toLocaleTimeString()}</span>
                <span class="log-level">{line.level}</span>
                <span class="log-source">{escapeHtml(line.source)}</span>
                <span class="log-msg {expandedLogIdx === i ? 'log-msg--full' : ''}">{escapeHtml(line.message)}</span>
              </div>
              {#if expandedLogIdx === i}
                <div class="log-detail" data-level={line.level}>
                  <div class="log-detail-row"><span class="log-detail-label">Timestamp</span><span class="log-detail-value">{new Date(line.ts).toISOString()}</span></div>
                  <div class="log-detail-row"><span class="log-detail-label">Level</span><span class="log-detail-value" data-level={line.level}>{line.level.toUpperCase()}</span></div>
                  <div class="log-detail-row"><span class="log-detail-label">Source</span><span class="log-detail-value">{escapeHtml(line.source)}</span></div>
                  <div class="log-detail-row log-detail-row--msg"><span class="log-detail-label">Message</span><span class="log-detail-value log-detail-value--msg">{escapeHtml(line.message)}</span></div>
                </div>
              {/if}
            {/each}
          </div>
          {#if allLogLines.length > 200}<div class="log-footnote">Showing {filteredLogs.length} of {allLogLines.length} lines (buffer capped at 500)</div>{/if}
        {:else}
          <div class="empty-state">
            {#if logSearch || logLevelFilter !== "all" || logSourceFilter !== "all"}<Search size={20} /><span>No log lines match the current filters</span>
            {:else}<CheckCircle2 size={20} /><span>No warnings or errors recorded</span>{/if}
          </div>
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .health-view { padding: 24px 32px; max-width: none; margin: 0; animation: fadeIn 0.2s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .header-left { display: flex; align-items: baseline; gap: 10px; }
  .header h1 { font-size: 20px; font-weight: 700; color: var(--text-1); margin: 0; letter-spacing: -0.01em; }
  .last-updated { font-size: 11px; color: var(--text-3); display: inline-flex; align-items: center; gap: 4px; }
  .header-actions { display: flex; gap: 8px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; color: var(--text-2); background: var(--bg-2); border: 1px solid var(--border-1); border-radius: var(--radius-sm); cursor: pointer; transition: color 0.15s, border-color 0.15s, background 0.15s; }
  .btn:hover:not(:disabled) { color: var(--accent); border-color: var(--accent-soft); background: var(--bg-3); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn--sm { padding: 3px 8px; font-size: 11px; }
  .btn--active { color: var(--accent); border-color: var(--accent-soft); background: var(--accent-soft); }

  .edit-panel { margin-bottom: 20px; background: var(--bg-1); border: 1px solid var(--accent-soft); border-radius: var(--radius); overflow: hidden; }
  .edit-panel-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 12px; font-weight: 600; color: var(--accent); background: color-mix(in srgb, var(--accent, #22d3ee) 6%, transparent); border-bottom: 1px solid var(--accent-soft); }
  .edit-panel-header .btn { margin-left: auto; }
  .edit-panel-body { padding: 8px; display: flex; flex-direction: column; gap: 4px; }
  .edit-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--radius-xs); transition: background 0.1s; }
  .edit-row:hover { background: var(--bg-2); }
  .edit-row--hidden { opacity: 0.45; }
  .edit-row--dragging { opacity: 0.35; background: var(--bg-2); }
  .edit-row--dragover { outline: 2px dashed var(--accent); outline-offset: -2px; background: var(--accent-soft); }
  .edit-row-grip { flex-shrink: 0; color: var(--text-3); cursor: grab; display: flex; }
  .edit-row-label { flex: 1; font-size: 12px; font-weight: 500; color: var(--text-1); }
  .edit-row-actions { display: flex; gap: 4px; }
  .edit-row-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; font-size: 9px; color: var(--text-3); background: var(--bg-2); border: 1px solid var(--border-1); border-radius: var(--radius-xs); cursor: pointer; transition: all 0.12s; padding: 0; }
  .edit-row-btn:hover:not(:disabled) { color: var(--accent); border-color: var(--accent-soft); }
  .edit-row-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; margin-bottom: 20px; }
  .card { background: var(--bg-1); border: 1px solid var(--border-1); border-radius: var(--radius); overflow: hidden; transition: box-shadow 0.2s, border-color 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  .card:hover { box-shadow: 0 4px 12px rgba(0,0,0,.18); border-color: var(--border-2); }
  .card[data-tier="live"] { border-left: 3px solid var(--status-ok, #22c55e); }
  .card[data-tier="degraded"] { border-left: 3px solid var(--status-warn, #f59e0b); }
  .card[data-tier="offline"] { border-left: 3px solid var(--status-err, #ef4444); }
  .card[data-tier="unknown"] { border-left: 3px solid var(--text-3, #71717a); }
  .card-header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: var(--bg-2); border-bottom: 1px solid var(--border-1); color: var(--text-2); }
  .card-header h2 { font-size: 13px; font-weight: 600; color: var(--text-1); margin: 0; flex: 1; }
  .pill { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 999px; }
  .pill[data-tier="live"] { background: color-mix(in srgb, var(--status-ok, #22c55e) 15%, transparent); color: var(--status-ok, #22c55e); }
  .pill[data-tier="degraded"] { background: color-mix(in srgb, var(--status-warn, #f59e0b) 15%, transparent); color: var(--status-warn, #f59e0b); }
  .pill[data-tier="offline"] { background: color-mix(in srgb, var(--status-err, #ef4444) 15%, transparent); color: var(--status-err, #ef4444); }
  .pill[data-tier="unknown"] { background: color-mix(in srgb, var(--text-3) 15%, transparent); color: var(--text-3); }
  .card-body { padding: 12px 16px; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .detail { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .detail-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); }
  .detail-value { font-size: 13px; font-weight: 600; color: var(--text-1); display: flex; align-items: center; gap: 6px; }
  .error-text { color: var(--status-err, #ef4444) !important; }
  .error-card { display: flex; gap: 8px; margin-top: 12px; padding: 10px 12px; background: color-mix(in srgb, var(--status-err, #ef4444) 8%, transparent); border: 1px solid color-mix(in srgb, var(--status-err, #ef4444) 20%, transparent); border-radius: var(--radius-sm); font-size: 12px; color: var(--text-2); }
  .error-card strong { display: block; margin-bottom: 4px; color: var(--status-err, #ef4444); }
  .error-card p { margin: 0 0 4px 0; line-height: 1.4; }
  .error-card code { display: block; font-size: 11px; color: var(--text-3); word-break: break-all; }

  .live-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .live-dot[data-live="true"] { background: var(--status-ok, #22c55e); box-shadow: 0 0 6px var(--status-ok, #22c55e); animation: pulse-dot 2s ease-in-out infinite; }
  .live-dot[data-live="false"] { background: var(--status-err, #ef4444); }
  @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

  .timeline-grid { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--border-1); border-radius: var(--radius-sm); padding: 12px; }
  .timeline-row { display: flex; align-items: center; gap: 8px; }
  .timeline-label { font-size: 10px; font-weight: 600; color: var(--text-2); width: 44px; flex-shrink: 0; text-transform: uppercase; letter-spacing: 0.04em; }
  .timeline-bar { display: flex; gap: 1px; flex: 1; overflow: hidden; }
  .timeline-block { flex: 1; min-width: 2px; height: 14px; border-radius: 1px; transition: opacity 0.15s; }
  .timeline-block:hover { opacity: 0.7; }
  .timeline-legend { display: flex; gap: 10px; justify-content: center; padding-top: 6px; border-top: 1px solid var(--border-1); margin-top: 4px; }
  .timeline-legend-item { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text-3); }
  .timeline-legend-item .legend-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }

  .viz-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .viz-card { background: var(--bg-1); border: 1px solid var(--border-1); border-radius: var(--radius); overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  .viz-card-header { display: flex; align-items: center; gap: 6px; padding: 10px 14px; font-size: 12px; font-weight: 600; color: var(--text-2); background: var(--bg-2); border-bottom: 1px solid var(--border-1); }
  .viz-card-header .summary-badge { margin-left: auto; }
  .viz-card-body { padding: 4px 8px 0; }
  .viz-card-footer { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 14px 10px; font-size: 11px; color: var(--text-2); flex-wrap: wrap; }
  .legend-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .legend-label { margin-right: 4px; }
  .legend-label::after { content: ":"; }
  .legend-value { font-weight: 700; color: var(--text-1); margin-right: 10px; }

  :global(.health-chart) { --echarts-min-height: 120px; --echarts-height: 140px; }
  :global(.health-chart--short) { --echarts-min-height: 60px; --echarts-height: 80px; }
  :global(.health-chart--pipeline) { --echarts-min-height: 140px; --echarts-height: 160px; }
  :global(.health-chart--traffic) { --echarts-min-height: 160px; --echarts-height: 200px; }

  .section { margin-bottom: 24px; }
  .section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--text-2); }
  .section-header h2 { font-size: 15px; font-weight: 600; color: var(--text-1); margin: 0; flex: 1; }
  .summary-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--bg-2); border: 1px solid var(--border-1); color: var(--text-2); white-space: nowrap; }

  .table-wrap { overflow-x: auto; border: 1px solid var(--border-1); border-radius: var(--radius-sm); }
  .feed-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .feed-table thead { background: var(--bg-2); }
  .feed-table th { text-align: left; padding: 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); border-bottom: 1px solid var(--border-1); white-space: nowrap; font-weight: 600; }
  .feed-table td { padding: 10px; border-bottom: 1px solid var(--border-1); color: var(--text-2); vertical-align: middle; }
  .feed-table tbody tr:last-child td { border-bottom: none; }
  .feed-table tbody tr { transition: background 0.12s; }
  .feed-table tbody tr:hover td { background: var(--overlay, rgba(255,255,255,.02)); }
  .feed-name { font-weight: 600; color: var(--text-1); white-space: nowrap; }
  .status-pill { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; text-transform: capitalize; white-space: nowrap; }
  .status-pill[data-status="ok"] { background: color-mix(in srgb, var(--status-ok, #22c55e) 12%, transparent); color: var(--status-ok, #22c55e); }
  .status-pill[data-status="degraded"], .status-pill[data-status="starting"] { background: color-mix(in srgb, var(--status-warn, #f59e0b) 12%, transparent); color: var(--status-warn, #f59e0b); }
  .status-pill[data-status="error"], .status-pill[data-status="circuit_open"] { background: color-mix(in srgb, var(--status-err, #ef4444) 12%, transparent); color: var(--status-err, #ef4444); }
  .status-pill[data-status="idle"], .status-pill[data-status="disabled"], .status-pill[data-status="mode_off"] { background: color-mix(in srgb, var(--text-3) 12%, transparent); color: var(--text-3); }
  .circuit-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
  .circuit-badge.open { background: color-mix(in srgb, var(--status-err, #ef4444) 12%, transparent); color: var(--status-err, #ef4444); }
  .circuit-badge.degraded { background: color-mix(in srgb, var(--status-warn, #f59e0b) 12%, transparent); color: var(--status-warn, #f59e0b); }
  .circuit-badge.closed { background: color-mix(in srgb, var(--status-ok, #22c55e) 12%, transparent); color: var(--status-ok, #22c55e); }
  .retry-hint { display: block; font-size: 10px; color: var(--text-3); margin-top: 2px; }
  .time { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .num-col { white-space: nowrap; font-variant-numeric: tabular-nums; text-align: right; }
  .ok-num { color: var(--status-ok, #22c55e); font-weight: 600; }
  .err-num { color: var(--status-err, #ef4444); font-weight: 600; }
  .ratio-cell { min-width: 48px; }
  .ratio-bar { width: 48px; height: 6px; background: color-mix(in srgb, var(--status-err, #ef4444) 30%, transparent); border-radius: 3px; overflow: hidden; }
  .ratio-bar-fill { height: 100%; background: var(--status-ok, #22c55e); border-radius: 3px; transition: width 0.3s ease; }
  .no-data { color: var(--text-3); }
  .err-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-3); font-size: 11px; }

  .skeleton-list { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--border-1); border-radius: var(--radius-sm); padding: 12px; }
  .skeleton-row { display: flex; gap: 12px; align-items: center; }
  .skeleton { height: 12px; border-radius: 4px; background: var(--bg-2); position: relative; overflow: hidden; }
  .skeleton::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.04), transparent); animation: shimmer 1.5s infinite; }
  @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
  .skeleton--short { width: 60px; }
  .skeleton--inline { width: 80px; }
  .skeleton--long { width: 120px; }

  .metric-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
  .metric-card { padding: 10px 12px; background: var(--bg-2); border: 1px solid var(--border-1); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 2px; transition: border-color 0.15s; min-width: 0; }
  .metric-card:hover { border-color: var(--border-2); }
  .metric-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .metric-value { font-size: 16px; font-weight: 700; color: var(--text-1); font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .log-toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; align-items: center; }
  .log-search-wrap { position: relative; flex: 1 1 200px; min-width: 0; }
  .log-search-icon { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: var(--text-3); pointer-events: none; display: flex; }
  .log-search-input { width: 100%; padding: 6px 28px 6px 28px; font-size: 12px; color: var(--text-1); background: var(--bg-2); border: 1px solid var(--border-1); border-radius: var(--radius-sm); outline: none; transition: border-color 0.15s; box-sizing: border-box; }
  .log-search-input:focus { border-color: var(--accent); }
  .log-search-input::placeholder { color: var(--text-3); }
  .log-search-clear { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-3); cursor: pointer; padding: 2px; display: flex; border-radius: 2px; }
  .log-search-clear:hover { color: var(--text-1); }
  .log-level-filters { display: flex; gap: 2px; }
  .log-filter-btn { font-size: 10px; font-weight: 600; padding: 4px 8px; border: 1px solid var(--border-1); border-radius: var(--radius-xs); background: var(--bg-2); color: var(--text-3); cursor: pointer; transition: all 0.12s; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; }
  .log-filter-btn:hover { color: var(--text-1); border-color: var(--border-2); }
  .log-filter-btn.active { color: var(--text-1); border-color: var(--accent); background: var(--accent-soft); }
  .log-filter-btn--err.active { border-color: var(--status-err, #ef4444); background: color-mix(in srgb, var(--status-err, #ef4444) 12%, transparent); color: var(--status-err, #ef4444); }
  .log-filter-btn--warn.active { border-color: var(--status-warn, #f59e0b); background: color-mix(in srgb, var(--status-warn, #f59e0b) 12%, transparent); color: var(--status-warn, #f59e0b); }
  .log-filter-btn--info.active { border-color: var(--accent, #22d3ee); background: color-mix(in srgb, var(--accent, #22d3ee) 12%, transparent); color: var(--accent, #22d3ee); }
  .log-filter-btn--ok.active { border-color: var(--status-ok, #22c55e); background: color-mix(in srgb, var(--status-ok, #22c55e) 12%, transparent); color: var(--status-ok, #22c55e); }
  .log-source-filter { display: flex; align-items: center; gap: 4px; color: var(--text-3); }
  .log-source-select { font-size: 11px; padding: 3px 6px; color: var(--text-1); background: var(--bg-2); border: 1px solid var(--border-1); border-radius: var(--radius-xs); outline: none; cursor: pointer; }
  .log-source-select:focus { border-color: var(--accent); }

  .log-list { border: 1px solid var(--border-1); border-radius: var(--radius-sm); overflow: hidden; font-family: ui-monospace, monospace; font-size: 11px; }
  .log-line { display: grid; grid-template-columns: 70px 48px 60px 1fr; gap: 4px; padding: 5px 8px; border-bottom: 1px solid var(--border-1); align-items: start; cursor: pointer; transition: filter 0.08s; user-select: none; }
  .log-line:hover { filter: brightness(1.08); }
  .log-line:last-child { border-bottom: none; }
  .log-line[data-level="error"] { background: color-mix(in srgb, var(--status-err, #ef4444) 6%, transparent); }
  .log-line[data-level="warn"] { background: color-mix(in srgb, var(--status-warn, #f59e0b) 5%, transparent); }
  .log-line[data-level="info"] { background: color-mix(in srgb, var(--accent, #22d3ee) 3%, transparent); }
  .log-line[data-level="ok"] { background: color-mix(in srgb, var(--status-ok, #22c55e) 3%, transparent); }
  .log-time { color: var(--text-3); white-space: nowrap; }
  .log-level { font-weight: 600; text-transform: uppercase; }
  .log-line[data-level="error"] .log-level { color: var(--status-err, #ef4444); }
  .log-line[data-level="warn"] .log-level  { color: var(--status-warn, #f59e0b); }
  .log-line[data-level="info"] .log-level  { color: var(--accent, #22d3ee); }
  .log-line[data-level="ok"] .log-level    { color: var(--status-ok, #22c55e); }
  .log-source { color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .log-msg { color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .log-msg--full { white-space: normal; overflow: visible; text-overflow: clip; }

  .log-detail { padding: 8px 8px 8px 130px; border-bottom: 1px solid var(--border-1); font-family: ui-monospace, monospace; font-size: 11px; background: var(--bg-2); }
  .log-detail[data-level="error"] { background: color-mix(in srgb, var(--status-err, #ef4444) 4%, transparent); }
  .log-detail[data-level="warn"] { background: color-mix(in srgb, var(--status-warn, #f59e0b) 3%, transparent); }
  .log-detail-row { display: grid; grid-template-columns: 64px 1fr; gap: 8px; padding: 2px 0; }
  .log-detail-label { color: var(--text-3); white-space: nowrap; }
  .log-detail-value { color: var(--text-2); word-break: break-all; }
  .log-detail-value[data-level="error"] { color: var(--status-err, #ef4444); }
  .log-detail-value[data-level="warn"] { color: var(--status-warn, #f59e0b); }
  .log-detail-value--msg { white-space: pre-wrap; line-height: 1.5; }
  .log-footnote { text-align: center; font-size: 10px; color: var(--text-3); padding: 6px; border-top: 1px solid var(--border-1); }

  .empty-state { display: flex; align-items: center; gap: 8px; padding: 24px; color: var(--text-3); font-size: 13px; justify-content: center; flex-wrap: wrap; }
  .spin { animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 720px) {
    .health-view { padding: 16px; }
    .cards { grid-template-columns: 1fr; }
    .viz-row { grid-template-columns: 1fr; }
    .feed-table { font-size: 11px; }
    .feed-table th, .feed-table td { padding: 8px; }
    .log-line { grid-template-columns: 56px 36px 44px 1fr; }
    .log-detail { padding-left: 8px; }
    .log-toolbar { flex-direction: column; align-items: stretch; }
    .metric-grid { grid-template-columns: repeat(2, 1fr); }
  }
</style>
