<script lang="ts">
  import { Sparkles } from "@lucide/svelte";

  import BriefingMarkdown from "./BriefingMarkdown.svelte";
  import { buildDeterministicBriefing } from "../briefing-fallback";
  import { buildDeskChartStats } from "../llm-snapshot";
  import {
    domainBriefingPrompt,
    llmBlockedReason,
    llmCanRun,
    llmSnapshotForDomain,
    runDashboardLlm,
  } from "../llm-analysis";
  import { ensureLlmReady, readiness, refreshRemoteReadiness } from "../readiness.svelte";
  import { dashboard } from "../state.svelte";
  import { navigate } from "../router.svelte";
  import type { UiCausalEdge, UiEvent } from "../types";

  interface Props {
    domainId: string;
    domainEvents: readonly UiEvent[];
    relatedEdges: readonly UiCausalEdge[];
  }

  const { domainId, domainEvents, relatedEdges }: Props = $props();

  let loading = $state(false);
  let error = $state<string | null>(null);
  let llmText = $state<string | null>(null);
  let llmModel = $state<string | null>(null);
  let usedFallback = $state(false);

  const llmCtx = $derived({
    dataMode: dashboard.dataMode,
    connection: dashboard.connection,
    snapshot: llmSnapshotForDomain(
      {
        events: dashboard.events,
        recentSignals: dashboard.recentSignals,
        domainState: dashboard.domainState,
        domainInsights: dashboard.domainInsights,
        recentCausalEdges: dashboard.recentCausalEdges,
        eventNarratives: dashboard.eventNarratives,
      },
      domainId,
    ),
  });

  const deskStats = $derived(
    buildDeskChartStats(domainId, domainEvents, relatedEdges),
  );

  const blocked = $derived(llmBlockedReason(llmCtx, readiness.llmReady));

  const sourceLabel = $derived(
    loading
      ? "Generating…"
      : llmText && !usedFallback
        ? `Ollama${llmModel ? ` · ${llmModel}` : ""}`
        : usedFallback
          ? "Template (LLM unavailable)"
          : "Not generated",
  );

  const displayText = $derived(
    llmText ??
      (usedFallback
        ? buildDeterministicBriefing(llmCtx.snapshot)
        : null),
  );

  async function regenerate(): Promise<void> {
    loading = true;
    error = null;
    usedFallback = false;
    try {
      await refreshRemoteReadiness();
      await ensureLlmReady(false);
      if (!llmCanRun(llmCtx, readiness.llmReady)) {
        usedFallback = true;
        llmText = buildDeterministicBriefing(llmCtx.snapshot);
        error =
          llmBlockedReason(llmCtx, readiness.llmReady) ??
          "LLM unavailable — showing template briefing.";
        return;
      }
      const r = await runDashboardLlm(llmCtx, domainBriefingPrompt(domainId));
      llmText = r.text.trim();
      llmModel = r.model;
      if (!llmText) {
        usedFallback = true;
        llmText = buildDeterministicBriefing(llmCtx.snapshot);
        error = "Ollama returned empty text — showing template briefing.";
      }
    } catch (e) {
      usedFallback = true;
      llmText = buildDeterministicBriefing(llmCtx.snapshot);
      llmModel = null;
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }
</script>

<section class="domain-analyst" aria-label="AI domain analysis" aria-busy={loading}>
  <div class="domain-analyst-head">
    <h2 class="domain-analyst-title">AI analysis</h2>
    <p class="domain-analyst-meta">
      {sourceLabel} · {deskStats.event_count} events · {deskStats.causal_inbound}↓
      {deskStats.causal_outbound}↑ causal
    </p>
    <button
      type="button"
      class="domain-analyst-btn"
      disabled={loading}
      title={blocked ?? "Regenerate domain insight"}
      onclick={() => void regenerate()}
    >
      <Sparkles size={14} strokeWidth={1.75} />
      <span>{loading ? "Working…" : "Regenerate insight"}</span>
    </button>
  </div>
  {#if error}
    <p class="domain-analyst-err" role="alert">
      {error}
      <button
        type="button"
        class="domain-analyst-link"
        onclick={() => navigate("/settings")}>Settings → LLM</button
      >
    </p>
  {/if}
  {#if loading}
    <p class="domain-analyst-wait">
      Calling Ollama… typically 30–120s on CPU ({deskStats.event_count} scoped events).
    </p>
  {:else if displayText}
    <BriefingMarkdown source={displayText} />
  {:else}
    <p class="domain-analyst-wait muted">
      Click Regenerate to run domain-scoped analysis (Ollama or template fallback).
    </p>
  {/if}
</section>

<style>
  .domain-analyst {
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .domain-analyst-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
  }
  .domain-analyst-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-1);
    margin: 0;
  }
  .domain-analyst-meta {
    flex: 1;
    margin: 0;
    font-size: 11px;
    color: var(--text-3);
    min-width: 12rem;
  }
  .domain-analyst-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 6px 10px;
    border-radius: var(--radius);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-1);
    font-size: 11px;
    cursor: pointer;
  }
  .domain-analyst-btn:hover:not(:disabled) {
    border-color: var(--accent-violet);
    color: var(--accent-violet);
  }
  .domain-analyst-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .domain-analyst-err {
    margin: 0;
    font-size: 11px;
    color: var(--sev-high);
    line-height: 1.45;
  }
  .domain-analyst-link {
    font: inherit;
    font-size: inherit;
    padding: 0;
    margin-left: var(--space-2);
    border: 0;
    background: none;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
  }
  .domain-analyst-wait {
    margin: 0;
    font-size: 12px;
    color: var(--text-2);
  }
  .domain-analyst-wait.muted {
    color: var(--text-3);
  }
</style>
