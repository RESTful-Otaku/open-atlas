<!--
  Client-facing integration notes: SpacetimeDB (status also in the top bar),
  optional LLM bridge, and how operators enable live public APIs for ingest.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { Settings as SettingsIcon } from "@lucide/svelte";

  import { connectionErrorDisplay } from "../connection-errors";
  import { autoReconnectStatusLine, reconnectNow } from "../connection.svelte";
  import { installDemoData } from "../demo-install.svelte";
  import { resolveStdbWebSocketUri } from "../stdb-endpoint";
  import { dashboard } from "../state.svelte";
  import { enableDemoModeAndReload, exitDemoModeAndReload } from "../demo-mode";
  import { ingestModeLabel } from "../ingest-status";
  import { buildLlmSnapshot } from "../llm-snapshot";
  import { requestLlmInsight } from "../llm";
  import { ensureLlmReady, readiness, refreshRemoteReadiness } from "../readiness.svelte";
  import FeedApisPanel from "../components/FeedApisPanel.svelte";
  import SettingsCollapsibleSection from "../components/SettingsCollapsibleSection.svelte";
  import SettingsInnerFold from "../components/SettingsInnerFold.svelte";
  import SettingsMobileDetail from "../components/SettingsMobileDetail.svelte";
  import SettingsSectionRow from "../components/SettingsSectionRow.svelte";
  import LlmProvidersSettings from "./settings/LlmProvidersSettings.svelte";
  import MobileDeploymentSettings from "./settings/MobileDeploymentSettings.svelte";
  import { deploymentConfigEnabled } from "../mobile-runtime-config";
  import {
    SETTINGS_SECTIONS,
    type SettingsSectionId,
  } from "./settings/settings-sections";
  import { shouldProbeIngest } from "../native-config";
  import { isCompactLayout, subscribeMobileLayout } from "../mobile-layout";
  import { settingsSwipeBack } from "../settings-mobile-gestures";
  import CompactNumber from "../components/CompactNumber.svelte";
  import OpsConsole from "../components/OpsConsole.svelte";
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

  let useMobileDrilldown = $state(isCompactLayout());
  let activeSection = $state<SettingsSectionId | null>(null);
  /** Drives track slide; kept true until exit transition ends so detail content stays mounted. */
  let detailTrackOpen = $state(false);
  let detailPaneEl: HTMLDivElement | undefined = $state();
  /** Defer heavy OpsConsole until after the mobile slide (avoids WebView crash). */
  let opsConsoleReady = $state(false);

  const visibleSections = $derived(
    SETTINGS_SECTIONS.filter(
      (s) => s.id !== "deployment" || deploymentConfigEnabled(),
    ),
  );

  const activeMeta = $derived(
    activeSection
      ? visibleSections.find((s) => s.id === activeSection) ??
          SETTINGS_SECTIONS.find((s) => s.id === activeSection) ??
          null
      : null,
  );

  const swipe = settingsSwipeBack(
    () => detailTrackOpen,
    () => closeSection(),
  );

  onMount(() => {
    void refreshRemoteReadiness();
    const unsubLayout = subscribeMobileLayout(() => {
      useMobileDrilldown = isCompactLayout();
      if (!useMobileDrilldown) {
        activeSection = null;
        detailTrackOpen = false;
      }
    });
    return () => {
      unsubLayout();
    };
  });

  const sectionTimers: number[] = [];

  function clearSectionTimers() {
    for (const t of sectionTimers) {
      clearTimeout(t);
    }
    sectionTimers.length = 0;
  }

  function setTimeoutId(fn: () => void, ms: number): void {
    sectionTimers.push(window.setTimeout(fn, ms));
  }

  function openSection(id: SettingsSectionId): void {
    activeSection = id;
    opsConsoleReady = id !== "ops";
    detailTrackOpen = false;
    requestAnimationFrame(() => {
      detailTrackOpen = true;
      if (id === "ops") {
        setTimeoutId(() => {
          opsConsoleReady = true;
        }, 480);
      }
    });
  }

  function closeSection(): void {
    if (!detailTrackOpen) return;
    clearSectionTimers();
    opsConsoleReady = false;
    detailTrackOpen = false;
    if (typeof window === "undefined") {
      activeSection = null;
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      activeSection = null;
      return;
    }
    const el = detailPaneEl;
    if (!el) {
      activeSection = null;
      return;
    }
    const onEnd = (e: TransitionEvent): void => {
      if (e.target !== el || e.propertyName !== "transform") return;
      el.removeEventListener("transitionend", onEnd);
      if (!detailTrackOpen) activeSection = null;
    };
    el.addEventListener("transitionend", onEnd);
    setTimeoutId(() => {
      el.removeEventListener("transitionend", onEnd);
      if (!detailTrackOpen) activeSection = null;
    }, 400);
  }

  async function testLlmPipeline(): Promise<void> {
    llmTestRunning = true;
    llmTestResult = null;
    try {
      const ready = await ensureLlmReady(true);
      if (!ready) {
        llmTestResult =
          "Bridge or Ollama not ready (ping or model smoke test failed). Run: ollama serve && ollama pull llama3.2 && ./dev.sh llm:start";
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

{#snippet deploymentBody()}
  <MobileDeploymentSettings />
{/snippet}

{#snippet stdbBody()}
  <p>
    State: <strong>{dashboard.connection}</strong>{#if dashboard.dataMode === "demo"} (not used in demo; preview label only).{:else}.{/if} The
    UI subscribes to <code>event</code>, <code>world_state</code>, <code>signal</code>, and
    related tables when not in demo mode.
  </p>
  {#if dashboard.dataMode !== "demo"}
    {@const reconnectNote = autoReconnectStatusLine()}
    {#if reconnectNote}
      <p class="settings-sub" role="status">{reconnectNote}</p>
    {/if}
  {/if}
  {#if dashboard.dataMode !== "demo" && dashboard.connectionLastError}
    {@const err = connectionErrorDisplay(dashboard.connectionLastError)}
    <p class="err-block" role="alert">
      {#if err}
        <strong>{err.summary}</strong> — {err.remediation}
        <span class="err-raw">({err.raw})</span>
      {:else}
        <strong>Last error</strong> — {dashboard.connectionLastError}
      {/if}
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
{/snippet}

{#snippet opsBody()}
  <p>
    Live operator view: SpacetimeDB connection events, ingest health, feed polls,
    and Prometheus counters. Polls <code>/status</code>, <code>/feeds</code>, and
    <code>/metrics</code> every ~8s while expanded (Vite dev proxies to
    <code>127.0.0.1:8080</code>).
  </p>
  {#if !useMobileDrilldown || opsConsoleReady}
    <OpsConsole mobilePanel={useMobileDrilldown} />
  {:else}
    <p class="settings-sub" role="status">Loading live diagnostics…</p>
  {/if}
{/snippet}

{#snippet appearanceBody()}
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
{/snippet}

{#snippet demoBody()}
  <p>
    Load a large deterministic synthetic dataset (hundreds of geo-located
    events, signals, world state, and insights) to validate maps and matrices
    without SpacetimeDB, ingest, or external APIs. Uses the same dashboard
    types as production.
  </p>
  <p class="row">
    Status: {#if dashboard.dataMode === "demo"}
      <span class="ok">demo mode active</span> —
      <CompactNumber value={dashboard.events.length} /> events
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
{/snippet}

{#snippet ingestBody()}
  <p>
    The ingest process pushes events into SpacetimeDB. The UI never reads
    ingest directly — only the database WebSocket. In Vite dev,
    <code>GET /ready</code>, <code>GET /status</code>, and <code>GET /metrics</code>
    proxy to <code>127.0.0.1:8080</code>. Use the <strong>Operations console</strong>
    section for auto-refreshing health, feeds, and Prometheus counters.
  </p>
  {#if !shouldProbeIngest()}
    <p class="settings-sub">
      This build uses <strong>Maincloud SpacetimeDB</strong> only. Third-party APIs are
      polled by ingest on a server — not from the phone. Map and hub data update when STDB
      is connected. Optional: set <code>VITE_INGEST_BASE</code> at build time to a public
      ingest URL for operator health checks.
    </p>
  {/if}
  <p class="row">
    Readiness: {#if !shouldProbeIngest()}
      <span class="muted">not configured on this build</span> — use SpacetimeDB status above.
    {:else if readiness.ingestReady === null}
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
    {#if useMobileDrilldown}
      <button type="button" class="btn btn-link" onclick={() => openSection("ops")}>
        Open console
      </button>
    {:else}
      <a class="btn btn-link" href="#ops-console">Open console</a>
    {/if}
  </p>
{/snippet}

{#snippet llmBody()}
  <LlmProvidersSettings />
  <SettingsInnerFold summary="Local Ollama bridge (desktop)">
    <p>
      The hub &ldquo;AI analysis&rdquo; button calls
      <code>POST {llmBase}/v1/insight</code> when using the bridge provider. In
      <code>vite</code> dev, that path proxies to <code>http://127.0.0.1:3847</code>.
    </p>
    <p class="settings-actions">
      <button
        type="button"
        class="btn"
        disabled={llmTestRunning}
        onclick={() => void testLlmPipeline()}
      >
        {llmTestRunning ? "Testing LLM…" : "Test bridge pipeline"}
      </button>
    </p>
    <p class="settings-sub">
      <span class="lbl">CUDA / GTX 10xx</span> — if analysis fails with
      <code>architectural feature absent from the device</code>, use CPU-only Ollama
      (<code>./scripts/ollama-serve-cpu.sh</code>).
    </p>
    {#if llmTestResult}
      <p class="settings-sub" role="status">{llmTestResult}</p>
    {/if}
  </SettingsInnerFold>
{/snippet}

{#snippet feedsBody()}
  <FeedApisPanel />
  <p class="settings-sub">
    <span class="lbl">Ingest mode</span> — set when starting ingest:
    <code>OPENATLAS_INGEST_MODE=hybrid|live|sim|static</code> (see
    <code>./dev.sh up</code>). Keys saved here are written to
    <code>.dev/feed-secrets.json</code> (gitignored). See
    <code>docs/CONFIG.md</code> for all local config paths.
  </p>
{/snippet}

<section
  class="settings-page"
  class:settings-page--mobile={useMobileDrilldown}
  class:settings-page--desktop={!useMobileDrilldown}
>
  {#if useMobileDrilldown}
    <div
      class="settings-mobile-stack"
      class:is-detail={detailTrackOpen}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="settings-mobile-pane settings-mobile-pane--list"
        data-settings-menu
        ontouchstart={swipe.ontouchstart}
        ontouchend={swipe.ontouchend}
        ontouchcancel={swipe.ontouchcancel}
      >
        <header class="settings-mobile-list-head">
          <div class="settings-title">
            <SettingsIcon size={18} strokeWidth={1.75} />
            <span>Settings</span>
          </div>
          <p class="settings-mobile-lead">
            SpacetimeDB, appearance, ingest, and API keys for operators.
          </p>
        </header>
        <nav class="settings-mobile-nav" aria-label="Settings sections">
          {#each visibleSections as section (section.id)}
            <SettingsSectionRow
              title={section.title}
              icon={section.icon}
              onSelect={() => openSection(section.id)}
            />
          {/each}
        </nav>
      </div>

      {#if activeSection || detailTrackOpen}
        <div
          class="settings-mobile-pane settings-mobile-pane--detail"
          class:is-open={detailTrackOpen}
          bind:this={detailPaneEl}
          ontouchstart={swipe.ontouchstart}
          ontouchend={swipe.ontouchend}
          ontouchcancel={swipe.ontouchcancel}
          aria-hidden={!detailTrackOpen}
        >
          {#if activeSection && activeMeta}
            <SettingsMobileDetail
              title={activeMeta.title}
              icon={activeMeta.icon}
              onBack={closeSection}
            >
              {#if activeSection === "deployment"}
                {@render deploymentBody()}
              {:else if activeSection === "stdb"}
                {@render stdbBody()}
              {:else if activeSection === "ops"}
                {@render opsBody()}
              {:else if activeSection === "appearance"}
                {@render appearanceBody()}
              {:else if activeSection === "demo"}
                {@render demoBody()}
              {:else if activeSection === "ingest"}
                {@render ingestBody()}
              {:else if activeSection === "llm"}
                {@render llmBody()}
              {:else if activeSection === "feeds"}
                {@render feedsBody()}
              {/if}
            </SettingsMobileDetail>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
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

      {#if deploymentConfigEnabled()}
        <SettingsCollapsibleSection
          title="Deployment (cloud / live / demo)"
          icon={SETTINGS_SECTIONS[0].icon}
          class="settings-group"
        >
          {@render deploymentBody()}
        </SettingsCollapsibleSection>
      {/if}

      <SettingsCollapsibleSection
        title="SpacetimeDB stream"
        icon={SETTINGS_SECTIONS.find((s) => s.id === "stdb")!.icon}
        id="stdb"
        class="settings-group"
      >
        {@render stdbBody()}
      </SettingsCollapsibleSection>

      <SettingsCollapsibleSection
        title="Operations console"
        icon={SETTINGS_SECTIONS.find((s) => s.id === "ops")!.icon}
        id="ops-console"
        class="card--wide card--ops settings-group"
      >
        {@render opsBody()}
      </SettingsCollapsibleSection>

      <SettingsCollapsibleSection
        title="Appearance"
        icon={SETTINGS_SECTIONS.find((s) => s.id === "appearance")!.icon}
        class="settings-group"
      >
        {@render appearanceBody()}
      </SettingsCollapsibleSection>

      <SettingsCollapsibleSection
        title="Demo / test data (no backend)"
        icon={SETTINGS_SECTIONS.find((s) => s.id === "demo")!.icon}
      >
        {@render demoBody()}
      </SettingsCollapsibleSection>

      <SettingsCollapsibleSection
        title="Ingest service"
        icon={SETTINGS_SECTIONS.find((s) => s.id === "ingest")!.icon}
      >
        {@render ingestBody()}
      </SettingsCollapsibleSection>

      <SettingsCollapsibleSection
        title="LLM providers"
        icon={SETTINGS_SECTIONS.find((s) => s.id === "llm")!.icon}
        class="settings-group"
      >
        {@render llmBody()}
      </SettingsCollapsibleSection>

      <SettingsCollapsibleSection
        title="Public APIs & live feeds"
        icon={SETTINGS_SECTIONS.find((s) => s.id === "feeds")!.icon}
      >
        {@render feedsBody()}
      </SettingsCollapsibleSection>
    </section>
  {/if}
</section>

<style>
  .settings-page {
    padding: var(--space-8) var(--space-6);
    max-width: 960px;
    box-sizing: border-box;
  }

  /* Desktop/web: grow with content; #shell-main scrolls when sections expand. */
  .settings-page--desktop {
    flex: 0 0 auto;
    min-height: 0;
    height: auto;
    overflow: visible;
  }

  .settings-page--mobile {
    padding: 0;
    max-width: none;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .settings-mobile-stack {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    background: var(--bg-0);
    touch-action: manipulation;
  }

  .settings-mobile-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    background: var(--bg-0);
  }

  .settings-mobile-pane--list {
    flex: 1 1 auto;
    width: 100%;
  }

  .settings-mobile-stack.is-detail .settings-mobile-pane--list {
    visibility: hidden;
    pointer-events: none;
  }

  .settings-mobile-pane--detail {
    position: absolute;
    inset: 0;
    z-index: 2;
    width: 100%;
    transform: translate3d(100%, 0, 0);
    transition: transform 320ms cubic-bezier(0.34, 1.28, 0.64, 1);
    touch-action: pan-y;
  }

  .settings-mobile-pane--detail.is-open {
    transform: translate3d(0, 0, 0);
  }

  .settings-mobile-list-head {
    flex-shrink: 0;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-1);
    background: var(--bg-1);
  }

  .settings-mobile-lead {
    margin: var(--space-2) 0 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--text-2);
  }

  .settings-mobile-nav {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    /* Scroll end clears fixed bottom nav (nav is position:fixed over the shell). */
    padding: 0 0 var(--mobile-nav-height, 68px);
  }

  .settings-mobile-nav :global(.settings-mobile-row) {
    flex: 0 0 auto;
    min-height: var(--mobile-tap-min, 52px);
    border-bottom: 1px solid var(--border-1);
  }

  .settings-mobile-nav :global(.settings-mobile-row:last-child) {
    border-bottom: 0;
  }

  .settings {
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

  .settings-page--mobile .settings-title {
    font-size: 22px;
  }

  .settings p {
    margin-top: var(--space-2);
    color: var(--text-2);
    line-height: 1.55;
  }

  .settings p.row {
    margin-top: var(--space-3);
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

  .err-raw {
    display: block;
    margin-top: 6px;
    font-size: 11px;
    font-family: var(--font-mono, ui-monospace, monospace);
    color: var(--text-3);
    word-break: break-word;
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

  :global(html[data-mobile-layout]) .settings-page:not(.settings-page--mobile) {
    padding: 0;
    max-width: none;
  }

  :global(html[data-mobile-layout]) .settings {
    max-width: none;
  }

  :global(html[data-mobile-layout]) .settings > header {
    padding: var(--space-4) var(--space-4) var(--space-3);
    border-bottom: 1px solid var(--border-1);
    background: var(--bg-1);
  }

  :global(html[data-mobile-layout]) .settings .theme-card {
    min-height: var(--mobile-tap-min, 44px);
    padding: var(--space-4);
  }

  :global(html[data-mobile-layout]) .settings .theme-grid {
    grid-template-columns: 1fr;
  }

  @media (prefers-reduced-motion: reduce) {
    .settings-mobile-pane--detail {
      transition: none;
    }
  }
</style>
