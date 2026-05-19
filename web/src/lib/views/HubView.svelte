<!--
  Executive Summary Hub — the landing page of OpenAtlas.

  Three regions:
    1. Page header: kicker, title, subtitle on the left; global threat
       index + "Generate Daily Briefing" on the right.
    2. Domain tile grid: one tile per domain, ordered by risk descending.
    3. Optional briefing panel that materialises below the grid when the
       operator clicks Generate Daily Briefing.
-->
<script lang="ts">
  import { Download, FileText, Sparkles } from "@lucide/svelte";

  import { useNarrativeSubscription } from "../narrative-subscription";
  import { dashboard } from "../state.svelte";

  useNarrativeSubscription();
  import { buildHubTiles, computeThreatIndex } from "../hub";
  import { buildLlmSnapshot, llmSnapshotCounts } from "../llm-snapshot";
  import { requestLlmInsight } from "../llm";
  import { readiness, refreshRemoteReadiness } from "../readiness.svelte";
  import { NumericIndexBadge } from "../primitives";
  import { META_ICONS } from "../domain-icons";
  import { domainLabel } from "../colors";
  import { navigate } from "../router.svelte";

  import HubTile from "./HubTile.svelte";
  import HubOverviewCharts from "./HubOverviewCharts.svelte";
  import DataPipelineBanner from "../components/DataPipelineBanner.svelte";

  const tiles = $derived(
    buildHubTiles(
      dashboard.domainState,
      dashboard.domainInsights,
      dashboard.recentSignals,
    ),
  );

  const threatIndex = $derived(computeThreatIndex(dashboard.domainState));

  // The threat index tone scales alongside its value — the severity
  // bucket boundaries mirror `bucketRisk` so visual language stays
  // consistent across the hub and the tiles.
  const threatTone = $derived<"neutral" | "warn" | "danger">(
    threatIndex >= 7 ? "danger" : threatIndex >= 4 ? "warn" : "neutral",
  );

  let briefingOpen = $state(false);
  let llmOpen = $state(false);
  let llmLoading = $state(false);
  let llmError = $state<string | null>(null);
  let llmText = $state<string | null>(null);
  let llmModel = $state<string | null>(null);
  let llmUserPrompt = $state("");

  const llmCounts = $derived(
    llmSnapshotCounts({
      events: dashboard.events,
      recentSignals: dashboard.recentSignals,
      domainState: dashboard.domainState,
      domainInsights: dashboard.domainInsights,
      recentCausalEdges: dashboard.recentCausalEdges,
      eventNarratives: dashboard.eventNarratives,
      capturedAt: "",
    }),
  );

  const llmCanRun = $derived(
    readiness.llmReady === true &&
      dashboard.dataMode === "live" &&
      dashboard.connection === "live" &&
      llmCounts.events > 0,
  );

  const llmBlockedReason = $derived.by((): string | null => {
    if (dashboard.dataMode === "demo") {
      return "LLM analysis uses live SpacetimeDB telemetry. Exit demo mode in Settings or run ./dev.sh web without ?demo=1.";
    }
    if (dashboard.connection !== "live") {
      return "Connect to SpacetimeDB first (status bar). Run ./dev.sh up then ./dev.sh web.";
    }
    if (llmCounts.events === 0) {
      return "No events in the dashboard buffer yet. Start ingest with ./dev.sh up (hybrid fills all domains).";
    }
    if (readiness.llmReady === false) {
      return "LLM bridge or Ollama is not ready. Run ollama serve, ollama pull llama3.2, then ./dev.sh llm:start.";
    }
    if (readiness.llmReady === null) {
      return "Checking LLM bridge…";
    }
    return null;
  });

  $effect(() => {
    if (llmOpen) void refreshRemoteReadiness();
  });

  function toggleBriefing(): void {
    briefingOpen = !briefingOpen;
  }

  function toggleLlm(): void {
    llmOpen = !llmOpen;
  }

  /**
   * Calls the local Ollama-backed bridge; requires `openatlas-llm-bridge`
   * and `ollama serve` (see crate README in `crates/openatlas-llm-bridge`).
   */
  async function runLlmAnalysis(): Promise<void> {
    if (!llmCanRun) {
      llmError = llmBlockedReason ?? "Cannot run LLM analysis yet.";
      return;
    }
    llmLoading = true;
    llmError = null;
    llmText = null;
    llmModel = null;
    try {
      const snapshot = buildLlmSnapshot({
        events: dashboard.events,
        recentSignals: dashboard.recentSignals,
        domainState: dashboard.domainState,
        domainInsights: dashboard.domainInsights,
        recentCausalEdges: dashboard.recentCausalEdges,
        eventNarratives: dashboard.eventNarratives,
        capturedAt: new Date().toISOString(),
      });
      const r = await requestLlmInsight(
        snapshot,
        llmUserPrompt || undefined,
      );
      llmText = r.text;
      llmModel = r.model;
    } catch (e) {
      llmError = e instanceof Error ? e.message : String(e);
    } finally {
      llmLoading = false;
    }
  }

  /**
   * Compose a deterministic markdown briefing from the existing domain
   * insights. Pure string assembly — no wall clock, no model calls. If
   * we later want richer prose, we swap the implementation without
   * changing the contract.
   */
  const briefingMarkdown = $derived(buildBriefingMarkdown());

  function buildBriefingMarkdown(): string {
    const lines: string[] = [];
    lines.push("# OpenAtlas Daily Briefing");
    lines.push("");
    lines.push(
      `Global threat index: **${threatIndex.toFixed(1)} / 10** across ${tiles.length} domains.`,
    );
    lines.push("");
    lines.push("## Domain outlook");
    for (const tile of tiles) {
      lines.push(`- **${tile.title}** — ${tile.headline} (${tile.subMetric}).`);
    }
    lines.push("");
    if (tiles.length > 0) {
      lines.push("## Top pressure points");
      for (const tile of tiles.slice(0, 3)) {
        lines.push(
          `- ${tile.title}: risk index ${tile.riskIndex.toFixed(2)}.`,
        );
      }
    }
    return lines.join("\n");
  }

  function downloadBriefing(): void {
    const blob = new Blob([briefingMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "openatlas-briefing.md";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
</script>

<section class="hub">
  <header class="hub-header">
    <div class="hub-headline">
      <div class="hub-kicker">
        Global AI Inference Engine · Central Command
      </div>
      <h1 class="hub-title">
        <META_ICONS.radar size={22} strokeWidth={1.75} />
        <span>Executive Summary Hub</span>
      </h1>
      <p class="hub-subtitle">
        Cross-domain macroscopic analysis of {tiles.length} tracked
        domains. Tiles ordered by live risk index. Click any tile to
        drill into its matrix.
      </p>
    </div>

    <div class="hub-actions">
      <NumericIndexBadge
        label="Global Threat Index"
        value={threatIndex.toFixed(1)}
        denominator={10}
        tone={threatTone}
      />
      <button
        type="button"
        class="hub-btn is-primary"
        onclick={toggleBriefing}
        aria-pressed={briefingOpen}
      >
        <FileText size={14} strokeWidth={1.75} />
        <span>Generate Daily Briefing</span>
      </button>
      <button
        type="button"
        class="hub-btn is-accent"
        onclick={toggleLlm}
        aria-pressed={llmOpen}
        title="Requires openatlas-llm-bridge and Ollama (see project docs)"
      >
        <Sparkles size={14} strokeWidth={1.75} />
        <span>LLM deep analysis</span>
      </button>
    </div>
  </header>

  <DataPipelineBanner />

  <HubOverviewCharts />

  <div class="hub-grid">
    {#each tiles as tile (tile.id)}
      <HubTile {tile} />
    {/each}
  </div>

  {#if briefingOpen}
    <aside class="hub-briefing" aria-label="Daily briefing">
      <div class="hub-briefing-head">
        <h2>Daily Briefing</h2>
        <button
          type="button"
          class="hub-btn"
          onclick={downloadBriefing}
          aria-label="Download briefing as markdown"
        >
          <Download size={14} strokeWidth={1.75} />
          <span>Download .md</span>
        </button>
      </div>
      <pre class="hub-briefing-body mono">{briefingMarkdown}</pre>
      <footer class="hub-briefing-foot">
        Briefings are composed deterministically from the current
        world-state snapshot and the {Object.keys(dashboard.domainInsights)
          .length} active domain insights. No model calls; no randomness.
        Re-open to refresh.
      </footer>
    </aside>
  {/if}

  {#if llmOpen}
    <aside class="hub-llm" aria-label="LLM deep analysis">
      <div class="hub-llm-head">
        <h2>LLM deep analysis</h2>
        <span class="hub-llm-hint"
          >Self-hosted via Ollama — not part of the SpacetimeDB log.</span
        >
      </div>
      <p class="hub-llm-lead">
        Sends a bounded snapshot of live telemetry to the local bridge, which
        calls your <code>ollama</code> model. With the full stack running,
        use <code>./dev.sh up</code> then <code>./dev.sh web</code> — ingest and
        the LLM bridge start automatically when Ollama is available.
      </p>
      <p class="hub-llm-stats mono" aria-live="polite">
        Snapshot source:
        {llmCounts.events} events · {llmCounts.domains} domains ·
        {llmCounts.signals} signals · {llmCounts.insights} insights ·
        {llmCounts.causalEdges} causal edges
      </p>
      <p class="hub-llm-ready">
        Bridge:
        {#if readiness.llmReady === null}
          <span class="muted">checking…</span>
        {:else if readiness.llmReady}
          <span class="ok">ready</span>
        {:else}
          <span class="warn">not ready</span> — see Settings → LLM
        {/if}
      </p>
      <label class="hub-llm-label" for="llm-prompt"
        >Optional focus (e.g. &ldquo;transport vs energy coupling&rdquo;)</label
      >
      <textarea
        id="llm-prompt"
        class="hub-llm-textarea"
        rows={2}
        bind:value={llmUserPrompt}
        placeholder="Leave blank for a full cross-domain readout."
        disabled={llmLoading}
      ></textarea>
      <div class="hub-llm-actions">
        <button
          type="button"
          class="hub-btn is-primary"
          onclick={() => void runLlmAnalysis()}
          disabled={llmLoading || !llmCanRun}
          title={llmBlockedReason ?? "Run cross-domain LLM analysis"}
        >
          <Sparkles size={14} strokeWidth={1.75} />
          <span>{llmLoading ? "Running model…" : "Run analysis"}</span>
        </button>
      </div>
      {#if llmBlockedReason && !llmLoading && !llmText && !llmError}
        <p class="hub-llm-blocked" role="status">{llmBlockedReason}</p>
      {/if}
      {#if llmError}
        <div class="hub-llm-error" role="alert">
          <p class="hub-llm-err-txt">{llmError}</p>
          <button
            type="button"
            class="hub-llm-err-link"
            onclick={() => navigate("/settings")}>Open settings &amp; integration</button
          >
        </div>
      {/if}
      {#if llmText}
        <div class="hub-llm-out">
          <div class="hub-llm-out-meta">
            {#if llmModel}
              <span class="mono">model: {llmModel}</span>
            {/if}
          </div>
          <pre class="hub-llm-body">{llmText}</pre>
        </div>
      {/if}
    </aside>
  {/if}

  {#if tiles.length === 0}
    <div class="hub-empty">
      <span>Waiting for the first event ring…</span>
      <small>The hub populates as soon as {domainLabel("energy")} and peers report in.</small>
    </div>
  {/if}
</section>

<style>
  .hub {
    max-width: 1560px;
    margin: 0 auto;
    padding: var(--space-6) var(--space-5) var(--space-10);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .hub-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-5);
    flex-wrap: wrap;
  }

  .hub-kicker {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: var(--space-2);
  }
  .hub-title {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text-1);
  }
  .hub-title :global(svg) {
    color: var(--sev-high);
  }
  .hub-subtitle {
    margin-top: var(--space-2);
    color: var(--text-2);
    max-width: 64ch;
  }

  .hub-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .hub-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 7px 12px;
    border-radius: var(--radius);
    background: var(--bg-2);
    color: var(--text-1);
    border: 1px solid var(--border-1);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease),
      border-color var(--motion-fast) var(--ease);
  }
  .hub-btn:hover {
    background: var(--bg-3);
    border-color: var(--border-2);
  }
  .hub-btn.is-primary {
    background: linear-gradient(
      135deg,
      var(--accent) 0%,
      var(--accent-violet) 100%
    );
    color: #0b0b0f;
    border-color: transparent;
    font-weight: 600;
  }
  .hub-btn.is-primary:hover {
    filter: brightness(1.05);
  }
  .hub-btn.is-accent {
    background: var(--bg-2);
    border-color: var(--accent-violet);
    color: var(--accent-violet);
  }
  .hub-btn.is-accent:hover {
    background: color-mix(in srgb, var(--accent-violet) 12%, var(--bg-2));
  }

  .hub-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .hub-briefing {
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .hub-briefing-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .hub-briefing-head h2 {
    font-size: 14px;
    letter-spacing: 0.02em;
    color: var(--text-1);
  }
  .hub-briefing-body {
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    padding: var(--space-3) var(--space-4);
    font-size: 12px;
    line-height: 1.55;
    color: var(--text-1);
    white-space: pre-wrap;
    overflow-x: auto;
  }
  .hub-briefing-foot {
    font-size: 11px;
    color: var(--text-3);
  }

  .hub-llm {
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .hub-llm-head {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }
  .hub-llm-head h2 {
    font-size: 14px;
    letter-spacing: 0.02em;
    color: var(--text-1);
    margin: 0;
  }
  .hub-llm-hint {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-3);
  }
  .hub-llm-lead {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-2);
  }
  .hub-llm-lead code {
    font-family: var(--font-mono);
    font-size: 10px;
    background: var(--bg-2);
    padding: 0 4px;
    border-radius: var(--radius-xs);
  }
  .hub-llm-stats {
    margin: 0;
    font-size: 11px;
    color: var(--text-3);
  }
  .hub-llm-ready {
    margin: 0;
    font-size: 12px;
    color: var(--text-2);
  }
  .hub-llm-ready .ok {
    color: var(--status-ok);
    font-weight: 600;
  }
  .hub-llm-ready .warn {
    color: var(--status-warn);
    font-weight: 600;
  }
  .hub-llm-ready .muted {
    color: var(--text-3);
  }
  .hub-llm-blocked {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
    border: 1px dashed var(--border-2);
    background: var(--bg-2);
  }
  .hub-llm-label {
    font-size: 11px;
    color: var(--text-2);
  }
  .hub-llm-textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--font-sans, inherit);
    font-size: 12px;
    line-height: 1.4;
    padding: var(--space-3);
    border-radius: var(--radius);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-1);
    resize: vertical;
    min-height: 3rem;
  }
  .hub-llm-textarea:disabled {
    opacity: 0.6;
  }
  .hub-llm-actions {
    display: flex;
    gap: var(--space-2);
  }
  .hub-llm-error {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    font-size: 12px;
    color: var(--sev-high);
    padding: var(--space-2) var(--space-3);
    border: 1px solid color-mix(in srgb, var(--sev-high) 40%, var(--border-1));
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--sev-high) 8%, var(--bg-2));
  }
  .hub-llm-err-txt {
    margin: 0;
    line-height: 1.45;
  }
  .hub-llm-err-link {
    font: inherit;
    font-size: 11px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
  }
  .hub-llm-err-link:hover {
    color: var(--text-1);
  }
  .hub-llm-out {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .hub-llm-out-meta {
    font-size: 10px;
    color: var(--text-3);
  }
  .hub-llm-body {
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    padding: var(--space-3) var(--space-4);
    font-family: var(--font-sans, system-ui, sans-serif);
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-1);
    white-space: pre-wrap;
    margin: 0;
    overflow-x: auto;
  }
  .mono {
    font-family: var(--font-mono);
  }

  .hub-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-10);
    border: 1px dashed var(--border-2);
    border-radius: var(--radius-lg);
    color: var(--text-2);
  }
  .hub-empty small {
    color: var(--text-3);
  }

  @media (max-width: 1200px) {
    .hub-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (max-width: 800px) {
    .hub-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 520px) {
    .hub-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .hub-header {
      flex-direction: column;
    }
  }
</style>
