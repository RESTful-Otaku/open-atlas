<!--
  The AI synthesis card pinned to the right rail of every matrix page.
  Renders a kicker, title, body markdown, and optional citation chips.

  The body is **data**, not a model call — each matrix provides a
  deterministic summary composed in its registry entry.
-->
<script lang="ts">
  import { Sparkles } from "@lucide/svelte";

  interface Props {
    kicker?: string;
    title: string;
    body: string;
    citations?: readonly string[];
    accent?: "accent" | "violet" | "rose" | "amber";
  }

  const {
    kicker,
    title,
    body,
    citations = [],
    accent = "accent",
  }: Props = $props();
</script>

<aside class="ai-card" data-accent={accent}>
  <header>
    <span class="ai-card-kicker">
      <Sparkles size={12} strokeWidth={2} />
      <span>{kicker ?? "AI Strategic Synthesis"}</span>
    </span>
    <h4>{title}</h4>
  </header>
  <p class="ai-card-body">{body}</p>
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
  }
  .ai-card h4 {
    margin: 4px 0 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-1);
    letter-spacing: -0.01em;
  }
  .ai-card-body {
    font-size: 12px;
    line-height: 1.55;
    color: var(--text-2);
    white-space: pre-wrap;
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
</style>
