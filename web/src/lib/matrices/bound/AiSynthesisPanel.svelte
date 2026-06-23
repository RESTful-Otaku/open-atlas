<script lang="ts">
  import { onMount } from "svelte";

  import { dashboard } from "../../state.svelte";
  import {
    ensureLlmReady,
    readiness,
    refreshRemoteReadiness,
  } from "../../readiness.svelte";
  import {
    llmBlockedReason,
    llmCanRun,
    llmSnapshotFromDashboard,
    matrixSynthesisPrompt,
    runDashboardLlm,
  } from "../../llm-analysis";
  import { synthesizeMatrix } from "../ai-synthesis";
  import AiSynthesisCard from "../panels/AiSynthesisCard.svelte";

  interface Props {
    matrixId: string;
    scope: readonly string[];
    title: string;
    kicker?: string;
    accent?: "accent" | "violet" | "rose" | "amber";
  }

  const { matrixId, scope, title, kicker, accent = "accent" }: Props =
    $props();

  const deterministic = $derived(
    synthesizeMatrix(matrixId, scope, {
      domainState: dashboard.domainState,
      insights: dashboard.domainInsights,
      events: dashboard.events,
      signals: dashboard.recentSignals,
    }),
  );

  const llmCtx = $derived({
    dataMode: dashboard.dataMode,
    connection: dashboard.connection,
    snapshot: llmSnapshotFromDashboard({
      events: dashboard.events,
      recentSignals: dashboard.recentSignals,
      domainState: dashboard.domainState,
      domainInsights: dashboard.domainInsights,
      recentCausalEdges: dashboard.recentCausalEdges,
      eventNarratives: dashboard.eventNarratives,
    }),
  });

  const canRun = $derived(llmCanRun(llmCtx, readiness.llmReady));
  const blocked = $derived(llmBlockedReason(llmCtx, readiness.llmReady));

  let llmLoading = $state(false);
  let llmError = $state<string | null>(null);
  let llmBody = $state<string | null>(null);
  let llmModel = $state<string | null>(null);
  /** Stable per matrix visit — do not tie to live event counts (re-triggers every ingest tick). */
  const autoRunKey = $derived(`${matrixId}:${scope.join(",")}`);
  let lastAutoRunKey = $state("");

  const displayBody = $derived(llmBody ?? deterministic.body);
  const displayCitations = $derived(
    llmBody ? deterministic.citations : deterministic.citations,
  );
  const sourceLabel = $derived(
    llmLoading
      ? "Ollama"
      : llmBody
        ? "Ollama"
        : "Rules",
  );

  async function runLlm(force = false): Promise<void> {
    if (!force && lastAutoRunKey === autoRunKey && llmBody) return;
    llmLoading = true;
    llmError = null;
    try {
      await ensureLlmReady(false);
      if (!llmCanRun(llmCtx, readiness.llmReady)) {
        llmError =
          llmBlockedReason(llmCtx, readiness.llmReady) ??
          "LLM is not ready (bridge, Ollama, or dashboard data).";
        llmBody = null;
        lastAutoRunKey = autoRunKey;
        return;
      }
      const r = await runDashboardLlm(
        llmCtx,
        matrixSynthesisPrompt(matrixId, scope),
      );
      llmBody = r.text.trim();
      llmModel = r.model;
      lastAutoRunKey = autoRunKey;
    } catch (e) {
      llmError = e instanceof Error ? e.message : String(e);
      llmBody = null;
      lastAutoRunKey = autoRunKey;
    } finally {
      llmLoading = false;
    }
  }

  onMount(() => {
    void refreshRemoteReadiness();
  });

  $effect(() => {
    const key = autoRunKey;
    if (lastAutoRunKey === key) return;
    void runLlm(false);
  });
</script>

<AiSynthesisCard
  {title}
  {kicker}
  {accent}
  body={displayBody}
  citations={displayCitations}
  loading={llmLoading}
  source={sourceLabel}
  model={llmModel}
  error={llmError}
  blocked={blocked}
  canRegenerate={canRun}
  onregenerate={() => void runLlm(true)}
/>
