<!--
  Settings section: accordion on tablet (compact, non-phone); open card on desktop.
  Mobile uses SettingsSectionRow + SettingsMobileDetail instead.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { fade, slide } from "svelte/transition";
  import { ChevronDown } from "@lucide/svelte";
  import type { Component } from "svelte";

  import { isCompactLayout, isMobileLayout, subscribeMobileLayout } from "../mobile-layout";
  import { settingsFoldTransition } from "../motion/transitions";

  interface Props {
    title: string;
    icon?: Component;
    id?: string;
    /** Extra class on the outer card / fold (e.g. card--wide card--ops). */
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

  let compact = $state(isCompactLayout());
  let mobile = $state(isMobileLayout());
  let useAccordion = $derived(compact && !mobile);
  let open = $state(defaultOpen);

  const bodyId = $derived(id ? `${id}-body` : undefined);
  const foldMotion = $derived(settingsFoldTransition());

  onMount(() =>
    subscribeMobileLayout(() => {
      compact = isCompactLayout();
      mobile = isMobileLayout();
    }),
  );

  function toggle(): void {
    open = !open;
  }
</script>

{#if useAccordion}
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
{:else}
  <div class="card settings-group {className}" {id}>
    <h3>
      {#if Icon}
        <Icon size={14} strokeWidth={1.75} />
      {/if}
      {title}
    </h3>
    {@render children?.()}
  </div>
{/if}

<style>
  .settings-fold {
    margin-top: 0;
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
    padding: 0;
    background: var(--bg-1);
    overflow: hidden;
  }

  .settings-fold-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: 0;
    background: transparent;
    cursor: pointer;
    padding: var(--space-4);
    min-height: var(--mobile-tap-min, 44px);
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
    background: color-mix(in srgb, var(--bg-2) 65%, transparent);
  }

  .settings-fold.is-open .settings-fold-summary {
    background: color-mix(in srgb, var(--bg-2) 80%, transparent);
  }

  .settings-fold-title {
    flex: 1 1 auto;
    text-align: left;
  }

  :global(.settings-fold-chev) {
    flex-shrink: 0;
    color: var(--text-3);
    transition: transform var(--motion-med, 220ms) var(--ease, ease);
  }

  .settings-fold.is-open :global(.settings-fold-chev) {
    transform: rotate(180deg);
    color: var(--text-2);
  }

  .settings-fold-body-shell {
    overflow: hidden;
  }

  .settings-fold-body {
    padding: 0 var(--space-4) var(--space-4);
    border-top: 1px solid var(--border-1);
  }

  .settings-fold-body :global(p:first-child) {
    margin-top: var(--space-3);
  }

  .card {
    margin-top: var(--space-5);
    padding: var(--space-4);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    background: var(--bg-1);
  }

  .card--wide {
    max-width: none;
  }

  .card--ops {
    scroll-margin-top: var(--space-6);
    border-color: color-mix(in srgb, var(--accent) 28%, var(--border-1));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .card h3 {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 var(--space-2);
    font-size: 14px;
    font-weight: 600;
    color: var(--text-1);
  }

  .card--ops h3 {
    color: var(--text-1);
  }

  .card :global(p code) {
    font-family: var(--font-mono);
    font-size: 12px;
  }

  :global(html[data-compact-layout]) .settings-fold,
  :global(html[data-tablet-layout]) .settings-fold {
    margin-top: 0;
  }

  :global(html[data-compact-layout]) .card.settings-group,
  :global(html[data-tablet-layout]) .card.settings-group {
    margin-top: 0;
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .settings-fold-summary,
    :global(.settings-fold-chev) {
      transition: none;
    }
  }
</style>
