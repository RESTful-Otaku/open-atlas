<!--
  AI synthesis card for matrix right rail — shows Ollama prose when available,
  otherwise deterministic fallback from `ai-synthesis.ts`.
-->
<script lang="ts">
  import { RefreshCw, Sparkles } from "@lucide/svelte";

  interface Props {
    kicker?: string;
    title: string;
    body: string;
    citations?: readonly string[];
    accent?: "accent" | "violet" | "rose" | "amber";
    loading?: boolean;
    source?: string;
    model?: string | null;
    error?: string | null;
    blocked?: string | null;
    canRegenerate?: boolean;
    onregenerate?: () => void;
  }

  const {
    kicker,
    title,
    body,
    citations = [],
    accent = "accent",
    loading = false,
    source = "Rules",
    model = null,
    error = null,
    blocked = null,
    canRegenerate = false,
    onregenerate,
  }: Props = $props();
</script>

<aside class="ai-card" data-accent={accent} aria-busy={loading}>
  <header>
    <span class="ai-card-kicker">
      <Sparkles size={12} strokeWidth={2} />
      <span>{kicker ?? "AI Strategic Synthesis"}</span>
      <span class="ai-source">{loading ? "Running…" : source}</span>
    </span>
    <div class="ai-head-row">
      <h4>{title}</h4>
      {#if canRegenerate && onregenerate}
        <button
          type="button"
          class="ai-regen"
          onclick={onregenerate}
          disabled={loading}
          title="Regenerate with Ollama"
        >
          <RefreshCw size={12} strokeWidth={2} class={loading ? "spin" : undefined} />
        </button>
      {/if}
    </div>
  </header>
  <p class="ai-card-body">{body}</p>
  {#if model}
    <p class="ai-meta mono">model: {model}</p>
  {/if}
  {#if error}
    <p class="ai-err" role="alert">{error}</p>
  {:else if blocked && source === "Rules"}
    <p class="ai-hint" role="status">{blocked}</p>
  {/if}
  {#if citations.length > 0}
    <ul class="ai-card-citations">
      {#each citations as citation (citation)}
        <li>{citation}</li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .ai-card {
    --ai-accent: var(--accent);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    background: linear-gradient(
      180deg,
      color-mix(in oklab, var(--ai-accent) 8%, var(--bg-1)) 0%,
      var(--bg-1) 100%
    );
    border: 1px solid color-mix(in oklab, var(--ai-accent) 25%, var(--border-1));
    border-radius: var(--radius-lg);
  }
  .ai-card[data-accent="violet"] {
    --ai-accent: var(--accent-violet);
  }
  .ai-card[data-accent="rose"] {
    --ai-accent: #fb7185;
  }
  .ai-card[data-accent="amber"] {
    --ai-accent: var(--status-warn);
  }

  .ai-card-kicker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ai-accent);
    flex-wrap: wrap;
  }
  .ai-source {
    font-weight: 500;
    letter-spacing: 0.06em;
    color: var(--text-3);
    text-transform: none;
  }
  .ai-head-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: 4px;
  }
  .ai-card h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-1);
    letter-spacing: -0.01em;
  }
  .ai-regen {
    flex-shrink: 0;
    display: inline-flex;
    padding: 4px;
    border: 1px solid var(--border-1);
    border-radius: var(--radius-sm);
    background: var(--bg-2);
    color: var(--text-2);
    cursor: pointer;
  }
  .ai-regen:hover:not(:disabled) {
    color: var(--text-1);
    border-color: var(--border-2);
  }
  .ai-regen:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .ai-regen :global(.spin) {
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .ai-card-body {
    font-size: 12px;
    line-height: 1.55;
    color: var(--text-2);
    white-space: pre-wrap;
  }
  .ai-meta {
    margin: 0;
    font-size: 10px;
    color: var(--text-3);
  }
  .ai-err {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
    color: var(--sev-high);
  }
  .ai-hint {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-3);
  }
  .ai-card-citations {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .ai-card-citations li {
    font-size: 10px;
    color: var(--text-3);
    background: var(--overlay);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-pill);
    padding: 2px 8px;
  }
  .mono {
    font-family: var(--font-mono);
  }
</style>
