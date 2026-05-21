<!--
  Mobile settings list row — navigates to a full-screen detail pane.
-->
<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";
  import type { Component } from "svelte";

  interface Props {
    title: string;
    icon?: Component;
    onSelect: () => void;
  }

  let { title, icon: Icon, onSelect }: Props = $props();
</script>

<button type="button" class="settings-mobile-row" onclick={onSelect}>
  {#if Icon}
    <Icon size={18} strokeWidth={1.75} class="settings-mobile-row-icon" aria-hidden="true" />
  {/if}
  <span class="settings-mobile-row-title">{title}</span>
  <ChevronRight size={18} strokeWidth={2} class="settings-mobile-row-chev" aria-hidden="true" />
</button>

<style>
  .settings-mobile-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    border: 0;
    background: var(--bg-1);
    cursor: pointer;
    padding: var(--space-4);
    min-height: var(--mobile-tap-min, 52px);
    font-size: 15px;
    font-weight: 500;
    color: var(--text-1);
    text-align: left;
    touch-action: manipulation;
    transition: background var(--motion-fast, 120ms) var(--ease, ease);
  }

  .settings-mobile-row:active {
    background: color-mix(in srgb, var(--bg-2) 85%, transparent);
  }

  :global(.settings-mobile-row-icon) {
    flex-shrink: 0;
    color: var(--text-3);
  }

  .settings-mobile-row-title {
    flex: 1 1 auto;
    min-width: 0;
  }

  :global(.settings-mobile-row-chev) {
    flex-shrink: 0;
    color: var(--text-3);
  }
</style>
