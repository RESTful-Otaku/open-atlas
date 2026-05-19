<!--
  Client-facing integration notes: SpacetimeDB (status also in the top bar),
  optional LLM bridge, and how operators enable live public APIs for ingest.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { Settings as SettingsIcon, Cpu, Radio, BookOpen, FlaskConical } from "@lucide/svelte";

  import { reconnectNow } from "../connection.svelte";
  import { installDemoData } from "../demo-install.svelte";
  import { resolveStdbWebSocketUri } from "../stdb-endpoint";
  import { dashboard } from "../state.svelte";
  import { enableDemoModeAndReload, exitDemoModeAndReload } from "../demo-mode";
  import { ingestModeLabel } from "../ingest-status";
  import { buildLlmSnapshot } from "../llm-snapshot";
  import { requestLlmInsight } from "../llm";
  import { readiness, refreshRemoteReadiness } from "../readiness.svelte";
  import FeedApisPanel from "../components/FeedApisPanel.svelte";
  import {
    readStoredTheme,
    setTheme,
    THEME_OPTIONS,
    type ThemeId,
  } from "../theme.svelte";

  const llmBase =
    (import.meta.env.VITE_LLM_BASE as string | undefined)?.replace(/\/$/, "") ||
    "/api/llm";

  const stdbFromEnv = (import.meta.env.VITE_STDB_URI as string | undefined)?.trim();
  const stdbEffective = $derived(resolveStdbWebSocketUri());
  const stdbDb = import.meta.env.VITE_STDB_DB ?? "openatlas";

  let theme = $state<ThemeId>(readStoredTheme());
  let llmTestRunning = $state(false);
  let llmTestResult = $state<string | null>(null);

  onMount(() => {
    void refreshRemoteReadiness();
  });

  async function testLlmPipeline(): Promise<void> {
    llmTestRunning = true;
    llmTestResult = null;
    try {
      await refreshRemoteReadiness();
      if (!readiness.llmReady) {
        llmTestResult =
          "Bridge or Ollama not ready. Run: ollama serve && ollama pull llama3.2 && ./dev.sh llm:start";
        return;
      }
      const snapshot = buildLlmSnapshot({
        events: dashboard.events,
        recentSignals: dashboard.recentSignals,
        domainState: dashboard.domainState,
        domainInsights: dashboard.domainInsights,
        recentCausalEdges: dashboard.recentCausalEdges,
        eventNarratives: dashboard.eventNarratives,
        capturedAt: new Date().toISOString(),
      });
      const r = await requestLlmInsight(snapshot, "Reply with one short sentence confirming you received telemetry.");
      llmTestResult = `OK — model ${r.model} returned ${r.text.length} characters.`;
    } catch (e) {
      llmTestResult = e instanceof Error ? e.message : String(e);
    } finally {
      llmTestRunning = false;
    }
  }

  function pickTheme(next: ThemeId): void {
    theme = next;
    setTheme(next);
  }
</script>

<section class="settings">
  <header>
    <div class="settings-title">
      <SettingsIcon size={16} strokeWidth={1.75} />
      <span>Settings & integration</span>
    </div>
    <p>
      The Svelte app reads live rows from <strong>SpacetimeDB</strong> in the
      browser. Ingest, LLM, and public APIs are operator-controlled outside this
      page.
    </p>
  </header>

  <div class="card">
    <h3>
      <SettingsIcon size={14} strokeWidth={1.75} /> Appearance
    </h3>
    <p>Choose a shell theme. Charts and maps follow the same surface tokens.</p>
    <div class="theme-grid" role="radiogroup" aria-label="Theme">
      {#each THEME_OPTIONS as opt (opt.id)}
        <button
          type="button"
          class="theme-card"
          class:is-active={theme === opt.id}
          role="radio"
          aria-checked={theme === opt.id}
          onclick={() => pickTheme(opt.id)}
        >
          <span class="theme-swatch" data-theme-preview={opt.id}></span>
          <span class="theme-label">{opt.label}</span>
          <span class="theme-desc">{opt.description}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="card">
    <h3>
      <FlaskConical size={14} strokeWidth={1.75} /> Demo / test data (no backend)
    </h3>
    <p>
      Load a large deterministic synthetic dataset (hundreds of geo-located
      events, signals, world state, and insights) to validate maps and matrices
      without SpacetimeDB, ingest, or external APIs. Uses the same dashboard
      types as production.
    </p>
    <p class="row">
      Status: {#if dashboard.dataMode === "demo"}
        <span class="ok">demo mode active</span> — {dashboard.events.length} events
        in buffer.
      {:else}
        <span class="muted">off — you are on live (or connecting) data.</span>
      {/if}
    </p>
    <p class="settings-actions">
      {#if dashboard.dataMode === "demo"}
        <button type="button" class="btn" onclick={() => installDemoData()}>
          Re-seed demo data
        </button>
        <button
          type="button"
          class="btn"
          onclick={() => exitDemoModeAndReload()}>Use live SpacetimeDB (reload)</button
        >
      {:else}
        <button
          type="button"
          class="btn"
          onclick={() => enableDemoModeAndReload()}>Start demo mode (reload)</button
        >
      {/if}
    </p>
    <p class="settings-sub">
      <span class="lbl">URL</span> — append <code>?demo=1</code> to this origin, or
      set <code>VITE_DEMO_DATA=1</code> at build time.
    </p>
  </div>

  <div class="card">
    <h3>
      <Radio size={14} strokeWidth={1.75} /> SpacetimeDB stream
    </h3>
    <p>
      State: <strong>{dashboard.connection}</strong>{#if dashboard.dataMode === "demo"} (not used in demo; preview label only).{:else}.{/if} The
      UI subscribes to <code>event</code>, <code>world_state</code>, <code>signal</code>, and
      related tables when not in demo mode.
    </p>
    {#if dashboard.dataMode !== "demo" && dashboard.connectionLastError}
      <p class="err-block" role="alert">
        <strong>Last error</strong> — {dashboard.connectionLastError}
      </p>
    {/if}
    {#if dashboard.dataMode !== "demo"}
      <p class="settings-actions">
        <button type="button" class="btn" onclick={() => reconnectNow()}>
          Reconnect to SpacetimeDB now
        </button>
      </p>
    {/if}
    <p class="settings-sub">
      <span class="lbl">WebSocket (effective)</span> — <code>{stdbEffective}</code>
    </p>
    <p class="settings-sub">
      <span class="lbl">Vite</span> — {#if stdbFromEnv}
        <code>VITE_STDB_URI</code> is set to <code>{stdbFromEnv}</code> (overrides
        same-host default).
      {:else}
        <code>VITE_STDB_URI</code> is unset; the app uses this page’s hostname on
        port 3000 (<code>localhost</code> / <code>::1</code> →
        <code>127.0.0.1</code> because dev SpacetimeDB binds IPv4 loopback only).
        LAN URLs like <code>http://192.168.x.x:5173</code> use
        <code>ws://192.168.x.x:3000</code> — run SpacetimeDB on
        <code>0.0.0.0:3000</code> for that to work.
      {/if}
      <code>VITE_STDB_DB</code> = <code>{stdbDb}</code>. Override in
      <code>web/.env</code> and rebuild for production.
    </p>
  </div>

  <div class="card">
    <h3>
      <Radio size={14} strokeWidth={1.75} /> Ingest service
    </h3>
    <p>
      The ingest process pushes events into SpacetimeDB. The UI never reads
      ingest directly — only the database WebSocket. In Vite dev,
      <code>GET /ready</code> and <code>GET /status</code> proxy to
      <code>127.0.0.1:8080</code>.
    </p>
    <p class="row">
      Readiness: {#if readiness.ingestReady === null}
        <span class="muted">checking…</span>
      {:else if readiness.ingestReady}
        <span class="ok">ready</span>
      {:else}
        <span class="err">not reachable</span>
        {#if readiness.ingestCheckErr}
          <span class="muted"> — {readiness.ingestCheckErr}</span>
        {/if}
      {/if}
    </p>
    {#if readiness.ingestStatus}
      <p class="settings-sub">
        <span class="lbl">Ingest mode</span> —
        <code>{readiness.ingestStatus.ingest_mode}</code>
        ({ingestModeLabel(readiness.ingestStatus.ingest_mode)}). STDB
        {#if readiness.ingestStatus.stdb_reachable}
          <span class="ok">reachable</span>
        {:else}
          <span class="err">unreachable</span>
        {/if}
        at <code>{readiness.ingestStatus.stdb_uri}</code> /
        <code>{readiness.ingestStatus.stdb_database}</code>.
      </p>
    {/if}
    <p class="settings-actions">
      <button type="button" class="btn" onclick={() => void refreshRemoteReadiness()}>
        Check again
      </button>
    </p>
  </div>

  <div class="card">
    <h3>
      <Cpu size={14} strokeWidth={1.75} /> LLM (Ollama via bridge)
    </h3>
    <p>
      The hub &ldquo;AI analysis&rdquo; button calls
      <code>POST {llmBase}/v1/insight</code>. In <code>vite</code> dev, that path
      proxies to <code>http://127.0.0.1:3847</code> (see
      <code>web/vite.config.ts</code>).
    </p>
    <p class="row">
      Bridge readiness: {#if readiness.llmReady === null}
        <span class="muted">checking…</span>
      {:else if readiness.llmReady}
        <span class="ok">reachable</span> — Ollama HTTP is up through the bridge.
        Use <strong>Test LLM pipeline</strong> to verify inference (catches CUDA/GPU issues).
      {:else}
        <span class="err">unreachable</span> — start
        <code>openatlas-llm-bridge</code> and <code>ollama serve</code>, or set
        <code>VITE_LLM_BASE</code> to a reachable URL and rebuild.
      {/if}
    </p>
    <p class="settings-actions">
      <button
        type="button"
        class="btn"
        disabled={llmTestRunning}
        onclick={() => void testLlmPipeline()}
      >
        {llmTestRunning ? "Testing LLM…" : "Test LLM pipeline"}
      </button>
      <button type="button" class="btn" onclick={() => void refreshRemoteReadiness()}>
        Check bridge only
      </button>
    </p>
    <p class="settings-sub">
      <span class="lbl">CUDA / GTX 10xx</span> — if analysis fails with
      <code>architectural feature absent from the device</code>, stop
      <code>ollama serve</code> and run
      <code>./scripts/ollama-serve-cpu.sh</code> (or
      <code>./dev.sh ollama:cpu</code>), then <code>./dev.sh llm:start</code>.
    </p>
    {#if llmTestResult}
      <p class="settings-sub" role="status">{llmTestResult}</p>
    {/if}
  </div>

  <div class="card">
    <h3>
      <BookOpen size={14} strokeWidth={1.75} /> Public APIs &amp; live feeds
    </h3>
    <FeedApisPanel />
    <p class="settings-sub">
      <span class="lbl">Ingest mode</span> — set when starting ingest:
      <code>OPENATLAS_INGEST_MODE=hybrid|live|sim|static</code> (see
      <code>./dev.sh up</code>). Keys saved here are written to
      <code>.dev/feed-secrets.json</code> (gitignored). See
      <code>docs/CONFIG.md</code> for all local config paths.
    </p>
  </div>
</section>

<style>
  .settings {
    padding: var(--space-8) var(--space-6);
    max-width: 880px;
  }
  .settings-title {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 20px;
    font-weight: 600;
    color: var(--text-1);
    letter-spacing: -0.01em;
  }
  .settings p {
    margin-top: var(--space-2);
    color: var(--text-2);
    line-height: 1.55;
  }
  .settings p.row {
    margin-top: var(--space-3);
  }
  h3 {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 var(--space-2);
    font-size: 14px;
    font-weight: 600;
    color: var(--text-1);
  }
  .card {
    margin-top: var(--space-5);
    padding: var(--space-4) var(--space-4);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    background: var(--bg-1);
  }
  .card p code {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .ok {
    color: var(--accent, #22c55e);
  }
  .err {
    color: #f87171;
  }
  .muted {
    color: var(--text-3);
  }
  .settings-sub {
    margin-top: var(--space-3) !important;
  }
  .settings-actions {
    margin-top: var(--space-3) !important;
  }
  .btn {
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    padding: 6px 12px;
    border-radius: var(--radius);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-1);
    cursor: pointer;
  }
  .btn:hover {
    background: var(--bg-3);
    border-color: var(--border-2);
  }
  .err-block {
    margin-top: var(--space-2) !important;
    padding: var(--space-2) var(--space-3);
    font-size: 12px;
    line-height: 1.45;
    color: #fecaca;
    background: color-mix(in srgb, #ef4444 12%, var(--bg-2));
    border: 1px solid color-mix(in srgb, #ef4444 35%, var(--border-1));
    border-radius: var(--radius);
  }
  .lbl {
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--text-3);
  }
  .theme-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-3);
    margin-top: var(--space-3);
  }
  .theme-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-2);
    cursor: pointer;
    text-align: left;
    font: inherit;
  }
  .theme-card:hover {
    border-color: var(--border-2);
    background: var(--bg-3);
  }
  .theme-card.is-active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .theme-swatch {
    width: 100%;
    height: 28px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
  }
  .theme-swatch[data-theme-preview="dark"] {
    background: linear-gradient(90deg, #09090b, #22d3ee 40%, #101013);
  }
  .theme-swatch[data-theme-preview="dim"] {
    background: linear-gradient(90deg, #121218, #67e8f9 45%, #1a1a22);
  }
  .theme-swatch[data-theme-preview="light"] {
    background: linear-gradient(90deg, #f4f4f5, #0891b2 40%, #ffffff);
  }
  .theme-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-1);
  }
  .theme-desc {
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-3);
  }
</style>
