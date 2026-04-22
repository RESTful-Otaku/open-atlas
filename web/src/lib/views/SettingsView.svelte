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
  import { readiness, refreshRemoteReadiness } from "../readiness.svelte";

  const llmBase =
    (import.meta.env.VITE_LLM_BASE as string | undefined)?.replace(/\/$/, "") ||
    "/api/llm";

  const stdbFromEnv = (import.meta.env.VITE_STDB_URI as string | undefined)?.trim();
  const stdbEffective = $derived(resolveStdbWebSocketUri());
  const stdbDb = import.meta.env.VITE_STDB_DB ?? "openatlas";

  onMount(() => {
    void refreshRemoteReadiness();
  });
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
        <code>VITE_STDB_URI</code> is unset; the app uses the same hostname as
        this page, port 3000 (so LAN URLs like
        <code>http://192.168.x.x:5173</code> still connect to SpacetimeDB on
        that host).
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
      The ingest process pushes simulators and optional live feeds into
      SpacetimeDB. In Vite dev, <code>GET /ready</code> proxies to the service
      on <code>127.0.0.1:8080</code>.
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
        <span class="ok">reachable</span> — Ollama is responding through the
        bridge.
      {:else}
        <span class="err">unreachable</span> — start
        <code>openatlas-llm-bridge</code> and <code>ollama serve</code>, or set
        <code>VITE_LLM_BASE</code> to a reachable URL and rebuild.
      {/if}
    </p>
  </div>

  <div class="card">
    <h3>
      <BookOpen size={14} strokeWidth={1.75} /> Public APIs &amp; live feeds
    </h3>
    <p>
      The ingest process writes into SpacetimeDB. Simulated traffic is the
      default. To use real open-data adapters (FRED, EIA, NASA, etc.) set
    </p>
    <pre class="mono-block"><code>OPENATLAS_ENABLE_LIVE_FEEDS=1</code></pre>
    <p>when starting ingest (e.g. <code>./dev.sh start</code> and choose the live
      option, or set the variable in your environment). Optional API keys
      (FRED, EIA) are listed in the repo <code>README</code>.
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
  .mono-block {
    margin: var(--space-2) 0;
    padding: var(--space-2) var(--space-3);
    background: var(--bg-2);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
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
</style>
