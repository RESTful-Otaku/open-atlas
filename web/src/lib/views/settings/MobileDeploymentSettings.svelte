<script lang="ts">
  import { reconnectNow } from "../../connection.svelte";
  import {
    enableDemoModeAndReload,
    exitDemoModeAndReload,
  } from "../../demo-mode";
  import {
    configForProfile,
    DEPLOYMENT_PROFILES,
    devIngestCommandForProfile,
    loadMobileRuntimeConfig,
    mobileRuntimeConfigEnabled,
    profileUsesLanIngest,
    resolveIngestBaseFromConfig,
    resolveLlmBaseFromConfig,
    resolveStdbUriFromConfig,
    saveMobileRuntimeConfig,
    type DeploymentProfileId,
    type MobileRuntimeConfig,
  } from "../../mobile-runtime-config";
  import { ingestModeLabel } from "../../ingest-status";
  import { readiness, refreshRemoteReadiness } from "../../readiness.svelte";
  import { dashboard } from "../../state.svelte";

  let draft = $state<MobileRuntimeConfig>(loadMobileRuntimeConfig());
  let saved = $state(loadMobileRuntimeConfig());
  let applying = $state(false);

  const effectiveStdb = $derived(resolveStdbUriFromConfig(draft) ?? "(demo — no socket)");
  const effectiveIngest = $derived(resolveIngestBaseFromConfig(draft) || "(not probed)");
  const effectiveLlm = $derived(resolveLlmBaseFromConfig(draft) || "(Gemini / Settings)");

  const needsLan = $derived(
    profileUsesLanIngest(draft.profile) ||
      (draft.profile === "custom" && !draft.ingestBaseCustom),
  );
  const devCmd = $derived(devIngestCommandForProfile(draft.profile));

  function pickProfile(id: DeploymentProfileId): void {
    draft = configForProfile(id, draft);
  }

  function applyDeployment(): void {
    applying = true;
    saveMobileRuntimeConfig(draft);
    saved = { ...draft };

    if (draft.profile === "demo") {
      enableDemoModeAndReload();
      return;
    }

    const wasDemo = dashboard.dataMode === "demo";
    try {
      localStorage.removeItem("openatlas-demo-mode");
    } catch {
      /* */
    }

    if (wasDemo) {
      exitDemoModeAndReload();
      return;
    }

    reconnectNow();
    void refreshRemoteReadiness();
    applying = false;
  }

  function resetDraft(): void {
    draft = { ...saved };
  }
</script>

{#if mobileRuntimeConfigEnabled()}
  <div class="deploy-panel">
    <p class="deploy-lead">
      Switch <strong>demo</strong>, <strong>Maincloud live</strong>, <strong>LAN ingest</strong>
      (sim / live / hybrid is whatever your dev machine runs), or <strong>local STDB</strong>
      without reinstalling the APK.
    </p>

    <fieldset class="deploy-profiles">
      <legend class="deploy-legend">Deployment profile</legend>
      {#each DEPLOYMENT_PROFILES as p (p.id)}
        <label class="deploy-option">
          <input
            type="radio"
            name="deploy-profile"
            value={p.id}
            checked={draft.profile === p.id}
            onchange={() => pickProfile(p.id)}
          />
          <span class="deploy-option-text">
            <span class="deploy-option-label">{p.label}</span>
            <span class="deploy-option-desc">{p.description}</span>
          </span>
        </label>
      {/each}
    </fieldset>

    {#if needsLan}
      <p class="deploy-field">
        <label class="lbl" for="deploy-lan-host">Dev machine LAN IP</label>
        <input
          id="deploy-lan-host"
          class="deploy-input mono"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="192.168.1.97"
          bind:value={draft.lanHost}
        />
      </p>
    {/if}

    {#if draft.profile === "custom"}
      <p class="deploy-field">
        <label class="lbl" for="deploy-stdb-uri">STDB WebSocket</label>
        <input
          id="deploy-stdb-uri"
          class="deploy-input mono"
          type="url"
          bind:value={draft.stdbUriCustom}
        />
      </p>
      <p class="deploy-field">
        <label class="lbl" for="deploy-ingest">Ingest base (optional)</label>
        <input
          id="deploy-ingest"
          class="deploy-input mono"
          type="url"
          placeholder="http://192.168.1.97:8080"
          bind:value={draft.ingestBaseCustom}
        />
      </p>
      <p class="deploy-field">
        <label class="lbl" for="deploy-llm">LLM bridge base (optional)</label>
        <input
          id="deploy-llm"
          class="deploy-input mono"
          type="url"
          placeholder="http://192.168.1.97:3847"
          bind:value={draft.llmBaseCustom}
        />
      </p>
    {/if}

    <dl class="deploy-effective">
      <div>
        <dt>STDB</dt>
        <dd><code>{effectiveStdb}</code></dd>
      </div>
      <div>
        <dt>Ingest</dt>
        <dd><code>{effectiveIngest}</code></dd>
      </div>
      <div>
        <dt>LLM bridge</dt>
        <dd><code>{effectiveLlm}</code></dd>
      </div>
      {#if readiness.ingestStatus && draft.profile !== "demo"}
        <div>
          <dt>Ingest server mode</dt>
          <dd>
            <code>{readiness.ingestStatus.ingest_mode}</code>
            ({ingestModeLabel(readiness.ingestStatus.ingest_mode)}) — set on host via
            <code>./dev.sh start:*:sim|live|hybrid</code>
          </dd>
        </div>
      {/if}
    </dl>

    <p class="deploy-actions">
      <button
        type="button"
        class="btn btn--primary"
        disabled={applying}
        onclick={() => applyDeployment()}
      >
        {draft.profile === "demo" ? "Apply & reload (demo)" : "Apply & reconnect"}
      </button>
      <button type="button" class="btn" onclick={resetDraft}>Reset</button>
    </p>

    {#if devCmd}
      <p class="deploy-hint settings-sub">
        On your dev machine (same Wi‑Fi): <code>{devCmd}</code>
      </p>
    {/if}
  </div>
{/if}

<style>
  .deploy-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .deploy-lead {
    margin: 0;
    color: var(--text-2);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .deploy-profiles {
    margin: 0;
    padding: 0;
    border: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .deploy-legend {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-3);
    margin-bottom: var(--space-2);
  }

  .deploy-option {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    cursor: pointer;
  }

  .deploy-option:has(input:checked) {
    border-color: color-mix(in srgb, var(--accent, #38bdf8) 45%, var(--border-1));
    background: color-mix(in srgb, var(--accent, #38bdf8) 8%, var(--bg-2));
  }

  .deploy-option input {
    margin-top: 3px;
    flex-shrink: 0;
  }

  .deploy-option-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .deploy-option-label {
    font-weight: 600;
    color: var(--text-1);
    font-size: 0.9rem;
  }

  .deploy-option-desc {
    font-size: 0.8rem;
    color: var(--text-3);
    line-height: 1.35;
  }

  .deploy-field {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .deploy-input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
    background: var(--bg-1);
    color: var(--text-1);
    font-size: 0.85rem;
  }

  .deploy-effective {
    margin: 0;
    display: grid;
    gap: var(--space-2);
    font-size: 0.82rem;
  }

  .deploy-effective dt {
    color: var(--text-3);
    font-weight: 500;
  }

  .deploy-effective dd {
    margin: 0;
    color: var(--text-2);
    word-break: break-all;
  }

  .deploy-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin: 0;
  }

  .btn--primary {
    border-color: color-mix(in srgb, var(--accent, #38bdf8) 50%, var(--border-1));
  }

  .deploy-hint {
    margin: 0;
  }
</style>
