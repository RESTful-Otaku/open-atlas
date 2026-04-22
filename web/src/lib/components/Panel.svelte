<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    title?: string;
    span?: number;
    compact?: boolean;
    scroll?: boolean;
    flush?: boolean;
    header?: Snippet;
    children: Snippet;
  }

  let {
    title,
    span = 12,
    compact = false,
    scroll = false,
    flush = false,
    header,
    children,
  }: Props = $props();

  const safeSpan = $derived(Math.min(Math.max(span, 1), 12));
</script>

<section class="panel" data-span={safeSpan} style="--span: {safeSpan}">
  {#if title || header}
    <header class="panel-header">
      {#if title}
        <h2 class="panel-title">
          <span class="label">{title}</span>
        </h2>
      {/if}
      {#if header}
        <div class="panel-header-extra">
          {@render header()}
        </div>
      {/if}
    </header>
  {/if}

  <div
    class="panel-body"
    class:is-compact={compact}
    class:is-scroll={scroll}
    class:is-flush={flush}
  >
    {@render children()}
  </div>
</section>

<style>
  .panel {
    --span: 12;
    grid-column: span var(--span);
    display: flex;
    flex-direction: column;
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    overflow: hidden;
    min-width: 0;
    transition: border-color var(--motion-med) var(--ease);
  }
  .panel:hover {
    border-color: var(--border-2);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border-1);
  }

  .panel-title {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 12px;
    font-weight: 600;
    color: var(--text-1);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .panel-title::before {
    content: "";
    width: 3px;
    height: 14px;
    border-radius: 2px;
    background: linear-gradient(180deg, var(--accent), var(--accent-violet));
  }

  .panel-header-extra {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 11px;
    color: var(--text-3);
  }

  .panel-body {
    padding: var(--space-4) var(--space-5);
    flex: 1;
    min-width: 0;
  }
  .panel-body.is-compact {
    padding: var(--space-3) var(--space-4);
  }
  .panel-body.is-flush {
    padding: 0;
  }
  .panel-body.is-scroll {
    max-height: 480px;
    overflow-y: auto;
  }

  @media (max-width: 1100px) {
    .panel[data-span="4"],
    .panel[data-span="6"],
    .panel[data-span="8"] {
      --span: 12;
    }
  }
  @media (max-width: 680px) {
    .panel {
      --span: 12;
    }
  }
</style>
