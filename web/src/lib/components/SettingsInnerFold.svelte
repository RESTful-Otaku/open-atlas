<!--
  Nested settings accordion (e.g. LLM bridge) — same motion as section folds on mobile.
-->
<script lang="ts">
  import { fade, slide } from "svelte/transition";
  import { ChevronDown } from "@lucide/svelte";

  import { isCompactLayout, subscribeMobileLayout } from "../mobile-layout";
  import { onMount } from "svelte";
  import { settingsFoldTransition } from "../motion/transitions";

  interface Props {
    summary: string;
    defaultOpen?: boolean;
    class?: string;
    children?: import("svelte").Snippet;
  }

  let {
    summary,
    defaultOpen = false,
    class: className = "",
    children,
  }: Props = $props();

  let compact = $state(isCompactLayout());
  let open = $state(defaultOpen);
  const foldMotion = $derived(settingsFoldTransition());

  onMount(() =>
    subscribeMobileLayout(() => {
      compact = isCompactLayout();
    }),
  );

  function toggle(): void {
    open = !open;
  }
</script>

{#if compact}
  <section class="settings-inner-fold {className}" class:is-open={open} data-settings-fold>
    <button
      type="button"
      class="settings-inner-fold-summary"
      aria-expanded={open}
      onclick={toggle}
    >
      <span class="settings-inner-fold-label">{summary}</span>
      <ChevronDown size={14} strokeWidth={2} class="settings-inner-fold-chev" aria-hidden="true" />
    </button>
    {#if open}
      <div
        class="settings-inner-fold-body-shell"
        in:slide={foldMotion.slide}
        out:slide={foldMotion.slide}
      >
        <div
          class="settings-inner-fold-body"
          in:fade={foldMotion.fade}
          out:fade={foldMotion.fade}
        >
          {@render children?.()}
        </div>
      </div>
    {/if}
  </section>
{:else}
  <details class="settings-bridge-details {className}">
    <summary>{summary}</summary>
    {@render children?.()}
  </details>
{/if}

<style>
  .settings-inner-fold {
    margin-top: var(--space-3);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--bg-2) 55%, var(--bg-1));
    overflow: hidden;
  }

  .settings-inner-fold-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: 0;
    background: transparent;
    cursor: pointer;
    padding: var(--space-3) var(--space-4);
    min-height: var(--mobile-tap-min, 44px);
    font-size: 13px;
    font-weight: 600;
    color: var(--text-2);
    touch-action: manipulation;
    text-align: left;
    transition:
      background var(--motion-med, 220ms) var(--ease, ease),
      color var(--motion-fast, 120ms) var(--ease, ease);
  }

  .settings-inner-fold-summary:hover {
    color: var(--text-1);
    background: color-mix(in srgb, var(--bg-3) 50%, transparent);
  }

  .settings-inner-fold.is-open .settings-inner-fold-summary {
    color: var(--text-1);
    border-bottom: 1px solid var(--border-1);
  }

  .settings-inner-fold-label {
    flex: 1 1 auto;
  }

  :global(.settings-inner-fold-chev) {
    flex-shrink: 0;
    color: var(--text-3);
    transition: transform var(--motion-med, 220ms) var(--ease, ease);
  }

  .settings-inner-fold.is-open :global(.settings-inner-fold-chev) {
    transform: rotate(180deg);
  }

  .settings-inner-fold-body-shell {
    overflow: hidden;
  }

  .settings-inner-fold-body {
    padding: var(--space-3) var(--space-4) var(--space-4);
  }

  .settings-inner-fold-body :global(p:first-child) {
    margin-top: 0;
  }

  :global(.settings-bridge-details) {
    margin-top: var(--space-3);
  }

  :global(.settings-bridge-details summary) {
    cursor: pointer;
    font-weight: 600;
    color: var(--text-2);
  }

  @media (prefers-reduced-motion: reduce) {
    .settings-inner-fold-summary,
    :global(.settings-inner-fold-chev) {
      transition: none;
    }
  }
</style>
