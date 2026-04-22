<!--
  Shared panel header. Renders the small-caps title, optional accent
  icon, optional actions slot, and optional kebab menu slot.

  This replaces the per-panel header markup that was duplicated across
  Panel.svelte variants; callers now get consistent typography and
  spacing for free.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Icon as IconComponent } from "@lucide/svelte";

  interface Props {
    title: string;
    icon?: typeof IconComponent;
    actions?: Snippet;
    menu?: Snippet;
  }

  const { title, icon, actions, menu }: Props = $props();
</script>

<header class="panel-header">
  <h3 class="panel-header-title">
    {#if icon}
      {@const IconCmp = icon}
      <span class="panel-header-icon" aria-hidden="true">
        <IconCmp size={13} strokeWidth={1.75} />
      </span>
    {/if}
    <span>{title}</span>
  </h3>
  <div class="panel-header-trail">
    {#if actions}{@render actions()}{/if}
    {#if menu}{@render menu()}{/if}
  </div>
</header>

<style>
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-1);
  }
  .panel-header-title {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .panel-header-icon {
    display: inline-grid;
    place-items: center;
    color: var(--accent);
  }
  .panel-header-trail {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-3);
    font-size: 11px;
  }
</style>
