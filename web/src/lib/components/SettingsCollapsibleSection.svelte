<script lang="ts">
  import { fade, slide } from "svelte/transition";
  import { ChevronDown } from "@lucide/svelte";
  import type { Component } from "svelte";

  import { settingsFoldTransition } from "../motion/transitions";

  interface Props {
    title: string;
    icon?: Component;
    id?: string;
    class?: string;
    defaultOpen?: boolean;
    children?: import("svelte").Snippet;
  }

  let {
    title,
    icon: Icon,
    id,
    class: className = "",
    defaultOpen = false,
    children,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let open = $state(defaultOpen);

  const bodyId = $derived(id ? `${id}-body` : undefined);
  const foldMotion = $derived(settingsFoldTransition({ desktop: true }));

  function toggle(): void {
    open = !open;
  }
</script>

<section
  class="settings-fold card {className}"
  class:is-open={open}
  {id}
  data-settings-fold
>
  <button
    type="button"
    class="settings-fold-summary"
    aria-expanded={open}
    aria-controls={bodyId}
    onclick={toggle}
  >
    {#if Icon}
      <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
    {/if}
    <span class="settings-fold-title">{title}</span>
    <ChevronDown size={16} strokeWidth={2} class="settings-fold-chev" aria-hidden="true" />
  </button>
  {#if open}
    <div
      class="settings-fold-body-shell"
      in:slide={foldMotion.slide}
      out:slide={foldMotion.slide}
    >
      <div
        id={bodyId}
        class="settings-fold-body"
        in:fade={foldMotion.fade}
        out:fade={foldMotion.fade}
      >
        {@render children?.()}
      </div>
    </div>
  {/if}
</section>

<style>
  .settings-fold {
    margin-top: var(--space-4);
    padding: 0;
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    background: var(--bg-1);
    overflow: hidden;
    box-shadow: 0 1px 0 color-mix(in srgb, var(--text-1) 4%, transparent);
    transition:
      border-color var(--motion-med, 220ms) var(--ease, ease),
      box-shadow var(--motion-med, 220ms) var(--ease, ease);
  }

  .settings-fold:first-child,
  :global(.settings) > .settings-fold:first-of-type {
    margin-top: var(--space-5);
  }

  .settings-fold.is-open {
    border-color: color-mix(in srgb, var(--accent) 22%, var(--border-1));
    box-shadow:
      0 1px 0 color-mix(in srgb, var(--text-1) 6%, transparent),
      0 8px 24px -12px color-mix(in srgb, var(--bg-0) 55%, transparent);
  }

  .settings-fold-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: 0;
    background: transparent;
    cursor: pointer;
    padding: var(--space-4) var(--space-5);
    min-height: 48px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-1);
    touch-action: manipulation;
    user-select: none;
    text-align: left;
    transition:
      background var(--motion-med, 220ms) var(--ease, ease),
      color var(--motion-fast, 120ms) var(--ease, ease);
  }

  .settings-fold-summary:hover {
    color: var(--text-0);
    background: color-mix(in srgb, var(--bg-2) 70%, transparent);
  }

  .settings-fold.is-open .settings-fold-summary {
    background: color-mix(in srgb, var(--bg-2) 85%, transparent);
  }

  .settings-fold-title {
    flex: 1 1 auto;
    text-align: left;
    letter-spacing: -0.01em;
  }

  :global(.settings-fold-chev) {
    flex-shrink: 0;
    color: var(--text-3);
    transition: transform 300ms cubic-bezier(0.34, 1.2, 0.64, 1);
  }

  .settings-fold.is-open :global(.settings-fold-chev) {
    transform: rotate(180deg);
    color: var(--accent);
  }

  .settings-fold-body-shell {
    overflow: hidden;
    will-change: height;
  }

  .settings-fold-body {
    padding: 0 var(--space-5) var(--space-5);
    border-top: 1px solid var(--border-1);
  }

  .settings-fold-body :global(p:first-child) {
    margin-top: var(--space-4);
  }

  .card--wide {
    max-width: none;
  }

  .card--ops {
    scroll-margin-top: var(--space-6);
  }

  .card--ops.is-open {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border-1));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--accent) 14%, transparent),
      0 10px 28px -14px color-mix(in srgb, var(--accent) 25%, transparent);
  }

  .card--ops .settings-fold-summary {
    color: var(--text-1);
  }

  .settings-fold-body :global(p code) {
    font-family: var(--font-mono);
    font-size: 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .settings-fold,
    .settings-fold-summary,
    :global(.settings-fold-chev) {
      transition: none;
    }
  }
</style>
