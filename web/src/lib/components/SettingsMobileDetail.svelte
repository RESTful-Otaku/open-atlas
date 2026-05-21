<!--
  Settings section body (mobile drill-down detail pane). Parent track handles slide motion.
-->
<script lang="ts">
  import { ArrowLeft } from "@lucide/svelte";
  import type { Component } from "svelte";

  interface Props {
    title: string;
    icon?: Component;
    onBack: () => void;
    children?: import("svelte").Snippet;
  }

  let { title, icon: Icon, onBack, children }: Props = $props();

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      onBack();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="settings-mobile-detail"
  role="region"
  aria-label={title}
  tabindex="-1"
  onkeydown={onKeydown}
>
  <header class="settings-mobile-detail-head">
    <button type="button" class="settings-mobile-back" onclick={onBack}>
      <ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
      <span>Settings</span>
    </button>
    <div class="settings-mobile-detail-title">
      {#if Icon}
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      {/if}
      <h2>{title}</h2>
    </div>
  </header>
  <div class="settings-mobile-detail-body">
    {@render children?.()}
  </div>
</div>

<style>
  .settings-mobile-detail {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    background: var(--bg-0);
    overflow: hidden;
  }

  .settings-mobile-detail-head {
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-1);
    background: var(--bg-1);
  }

  .settings-mobile-back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: var(--mobile-tap-min, 44px);
    padding: 10px var(--space-4);
    border: 0;
    background: transparent;
    color: var(--accent);
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    touch-action: manipulation;
  }

  .settings-mobile-back:active {
    opacity: 0.75;
  }

  .settings-mobile-detail-title {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 var(--space-4) var(--space-3);
  }

  .settings-mobile-detail-title h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text-1);
  }

  .settings-mobile-detail-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: var(--space-4);
    padding-bottom: calc(var(--space-4) + var(--mobile-nav-height, 68px));
  }

  .settings-mobile-detail-body :global(p) {
    margin-top: var(--space-2);
    color: var(--text-2);
    line-height: 1.55;
  }

  .settings-mobile-detail-body :global(p:first-child) {
    margin-top: 0;
  }

  .settings-mobile-detail-body :global(.settings-actions) {
    margin-top: var(--space-3) !important;
  }

  .settings-mobile-detail-body :global(.settings-sub) {
    margin-top: var(--space-3) !important;
  }

  .settings-mobile-detail-body :global(.btn) {
    min-height: var(--mobile-tap-min, 44px);
    padding: 10px 16px;
    font-size: 14px;
  }

  .settings-mobile-detail-body :global(.theme-grid) {
    grid-template-columns: 1fr;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  .settings-mobile-detail-body :global(.theme-card) {
    min-height: var(--mobile-tap-min, 44px);
    padding: var(--space-4);
  }
</style>
