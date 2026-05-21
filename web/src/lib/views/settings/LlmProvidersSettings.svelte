<script lang="ts">
  import { Sparkles } from "@lucide/svelte";

  import { buildLlmSnapshot } from "../../llm-snapshot";
  import { requestLlmInsight } from "../../llm";
  import { readiness, refreshRemoteReadiness } from "../../readiness.svelte";
  import { dashboard } from "../../state.svelte";
  import {
    activeLlmProviderLabel,
    checkLlmProviderReady,
    loadLlmProviderSettings,
    saveLlmProviderSettings,
    type LlmProviderId,
    type LlmProviderSettings,
    llmProviderStatusLine,
  } from "../../llm/llm-providers";
  import { isNativeApp } from "../../mobile-layout";

  let settings = $state<LlmProviderSettings>(loadLlmProviderSettings());
  let testRunning = $state(false);
  let testResult = $state<string | null>(null);

  function persist(): void {
    saveLlmProviderSettings(settings);
    void refreshRemoteReadiness();
  }

  function setProvider(id: LlmProviderId): void {
    settings = { ...settings, provider: id };
    persist();
  }

  async function runTest(): Promise<void> {
    testRunning = true;
    testResult = null;
    try {
      const ready = await checkLlmProviderReady(settings);
      if (!ready) {
        testResult = "Provider not ready — check API key or bridge URL.";
        return;
      }
      const snap = buildLlmSnapshot({
        events: dashboard.events,
        recentSignals: dashboard.recentSignals,
        domainState: dashboard.domainState,
        domainInsights: dashboard.domainInsights,
        recentCausalEdges: dashboard.recentCausalEdges,
        eventNarratives: dashboard.eventNarratives,
        capturedAt: new Date().toISOString(),
      });
      const res = await requestLlmInsight(snap, "Reply with one short sentence confirming connectivity.");
      testResult = `OK — ${res.model}: ${res.text.slice(0, 120)}${res.text.length > 120 ? "…" : ""}`;
    } catch (e) {
      testResult = e instanceof Error ? e.message : String(e);
    } finally {
      testRunning = false;
    }
  }
</script>

<div class="llm-providers">
  <p class="settings-sub">
    {#if isNativeApp()}
      On mobile, use <strong>Google Gemini</strong> (API key) or an OpenAI-compatible endpoint — no
      local Ollama required. Data still comes from SpacetimeDB; LLM is only for narrative analysis.
    {:else}
      Choose bridge (local Ollama), Gemini, or any OpenAI-compatible API. Keys stay in this browser only.
    {/if}
  </p>

  <div class="provider-tabs" role="radiogroup" aria-label="LLM provider">
    {#each ["bridge", "gemini", "openai_compat"] as id (id)}
      <button
        type="button"
        role="radio"
        aria-checked={settings.provider === id}
        class:is-active={settings.provider === id}
        onclick={() => setProvider(id as LlmProviderId)}
      >
        {activeLlmProviderLabel(id as LlmProviderId)}
      </button>
    {/each}
  </div>

  <p class="row">
    <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" />
    Active: <strong>{llmProviderStatusLine(settings)}</strong>
    {#if readiness.llmReady === null}
      <span class="muted"> · checking…</span>
    {:else if readiness.llmReady}
      <span class="ok"> · ready</span>
    {:else}
      <span class="err"> · not ready</span>
    {/if}
  </p>

  {#if settings.provider === "gemini"}
    <label class="field">
      <span class="lbl">Gemini API key</span>
      <input
        type="password"
        class="inp"
        autocomplete="off"
        placeholder="AIza…"
        bind:value={settings.geminiApiKey}
        onchange={persist}
      />
    </label>
    <label class="field">
      <span class="lbl">Model</span>
      <input
        type="text"
        class="inp"
        bind:value={settings.geminiModel}
        onchange={persist}
        placeholder="gemini-2.0-flash"
      />
    </label>
    <p class="settings-sub">
      Create a key in
      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
        >Google AI Studio</a
      >. Restrict by app package / referrer for production use.
    </p>
  {:else if settings.provider === "openai_compat"}
    <label class="field">
      <span class="lbl">Base URL</span>
      <input
        type="url"
        class="inp"
        bind:value={settings.openaiBaseUrl}
        onchange={persist}
        placeholder="https://api.openai.com/v1"
      />
    </label>
    <label class="field">
      <span class="lbl">API key</span>
      <input
        type="password"
        class="inp"
        bind:value={settings.openaiApiKey}
        onchange={persist}
      />
    </label>
    <label class="field">
      <span class="lbl">Model</span>
      <input type="text" class="inp" bind:value={settings.openaiModel} onchange={persist} />
    </label>
  {:else}
    <p class="settings-sub">
      Uses <code>{import.meta.env.VITE_LLM_BASE || "/api/llm"}</code> → local
      <code>openatlas-llm-bridge</code> and Ollama on your machine.
    </p>
  {/if}

  <p class="settings-actions">
    <button type="button" class="btn" disabled={testRunning} onclick={() => void runTest()}>
      {testRunning ? "Testing…" : "Test LLM connection"}
    </button>
    <button type="button" class="btn" onclick={() => void refreshRemoteReadiness()}>
      Refresh status
    </button>
  </p>
  {#if testResult}
    <p class="settings-sub" role="status">{testResult}</p>
  {/if}
</div>

<style>
  .provider-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: var(--space-3) 0;
  }
  .provider-tabs button {
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-2);
    cursor: pointer;
  }
  .provider-tabs button.is-active {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--bg-2));
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: var(--space-3);
  }
  .inp {
    padding: 8px 10px;
    font-size: 13px;
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    background: var(--bg-2);
    color: var(--text-1);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
</style>
