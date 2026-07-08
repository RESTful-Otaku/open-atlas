<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { onMount } from "svelte";
  import { Search } from "@lucide/svelte";
  import { fadePanelBackdrop, flyFromBottom } from "../motion/transitions";
  import { router } from "../router.svelte";
  import { viewForPattern } from "../views";
  import { isCompactLayout, subscribeMobileLayout } from "../mobile-layout";
  import SystemStatusBar from "../components/SystemStatusBar.svelte";
  import UpdateIntervalMenu from "./UpdateIntervalMenu.svelte";
  import CommandPalette from "./CommandPalette.svelte";
  import ShellMobileStatus from "./ShellMobileStatus.svelte";

  interface Props {
    onopensearch?: () => void;
  }
  const { onopensearch }: Props = $props();

  const activeView = $derived(viewForPattern(router.match.pattern));

  let compactLayout = $state(isCompactLayout());
  let searchExpanded = $state(false);
  let searchQuery = $state("");
  let searchInputEl = $state<HTMLInputElement | null>(null);

  onMount(() => subscribeMobileLayout(() => {
    compactLayout = isCompactLayout();
    if (!compactLayout) searchExpanded = false;
  }));

  function expandSearch(): void {
    searchExpanded = true;
    queueMicrotask(() => searchInputEl?.focus());
  }

  function collapseSearch(): void {
    searchExpanded = false;
    searchQuery = "";
  }

  function onSearchKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      collapseSearch();
      searchInputEl?.blur();
    }
  }
</script>

{#if compactLayout}
  <header class="shell-top shell-top--mobile">
    <div class="shell-mobile-bar">
      <div class="shell-mobile-brand">
        <img
          class="brand-logo"
          src="/logo.png"
          width="32"
          height="32"
          alt="OpenAtlas"
          decoding="async"
        />
        <span class="shell-mobile-title" title="Active view">{activeView.title}</span>
      </div>
      <div class="shell-mobile-actions">
        <ShellMobileStatus />
        <button
          type="button"
          class="shell-icon-btn"
          aria-label="Search and navigate"
          aria-expanded={searchExpanded}
          onclick={expandSearch}
        >
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  </header>
  {#if searchExpanded}
    <button
      type="button"
      class="shell-search-backdrop"
      aria-label="Close search"
      onclick={collapseSearch}
      transition:fade={fadePanelBackdrop}
    ></button>
    <div
      class="shell-search-sheet"
      role="search"
      in:fly={flyFromBottom}
      out:fly={{ ...flyFromBottom, y: 12 }}
    >
      <div class="shell-mobile-search-head">
        <input
          bind:this={searchInputEl}
          class="shell-search-input shell-search-input--full"
          type="search"
          placeholder="Search views, matrices, commands…"
          bind:value={searchQuery}
          aria-label="Search and navigate"
          onkeydown={onSearchKeydown}
        />
        <button
          type="button"
          class="shell-icon-btn shell-search-close"
          aria-label="Close search"
          onclick={collapseSearch}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <CommandPalette
        inline
        fullscreen
        open={searchExpanded}
        bind:q={searchQuery}
        onclose={collapseSearch}
      />
    </div>
  {/if}
{:else}
  <header class="shell-top">
    <div class="shell-brand">
      <img
        class="brand-logo"
        src="/logo.png"
        width="28"
        height="28"
        alt=""
        decoding="async"
      />
      <span class="brand-wordmark">OpenAtlas</span>
      <span class="brand-divider" aria-hidden="true"></span>
      <span class="brand-view" title="Active view">{activeView.title}</span>
    </div>

    <button
      type="button"
      class="shell-search"
      aria-label="Open command palette and navigation"
      onclick={() => onopensearch?.()}
    >
      <Search size={14} strokeWidth={1.75} />
      <span class="shell-search-label">Search nodes, datasets, or type a command…</span>
      <kbd class="shell-search-kbd">⌘K</kbd>
    </button>

    <div class="shell-status">
      <UpdateIntervalMenu />
      <SystemStatusBar />
    </div>
  </header>
{/if}

<style>
  .shell-top {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-3) var(--space-5);
    background: var(--bg-glass);
    backdrop-filter: saturate(160%) blur(12px);
    -webkit-backdrop-filter: saturate(160%) blur(12px);
    border-bottom: 1px solid var(--border-1);
    overflow: visible;
  }

  .shell-brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .brand-logo {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    object-fit: contain;
    flex-shrink: 0;
    box-shadow: var(--shadow-glow);
    background: color-mix(in srgb, var(--bg-2) 60%, transparent);
  }
  .brand-wordmark {
    font-size: 14px;
    color: var(--text-1);
  }
  .brand-divider {
    width: 1px;
    height: 16px;
    background: var(--border-2);
  }
  .brand-view {
    font-size: 12px;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .shell-search {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 32px;
    padding: 0 var(--space-3);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    color: var(--text-3);
    font-size: 12px;
    width: 100%;
    max-width: 520px;
    justify-self: center;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .shell-search:hover {
    border-color: var(--border-2);
    color: var(--text-2);
  }
  .shell-search-label {
    flex: 1;
  }
  .shell-search-kbd {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-3);
    padding: 2px 6px;
    border: 1px solid var(--border-1);
    border-radius: var(--radius-xs);
    background: var(--overlay);
  }

  .shell-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    justify-self: end;
  }

  @media (max-width: 960px) {
    .shell-top:not(.shell-top--mobile) {
      grid-template-columns: 1fr auto;
    }
    .shell-top:not(.shell-top--mobile) .shell-search {
      display: none;
    }
  }

  :global(html[data-compact-layout]) .shell-top--mobile {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    min-height: 44px;
    background: var(--bg-1);
    border-bottom: 1px solid var(--border-1);
  }

  .shell-search-backdrop {
    display: none;
  }

  .shell-search-sheet {
    display: none;
  }

  :global(html[data-compact-layout]) .shell-search-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 2350;
    margin: 0;
    padding: 0;
    border: none;
    background: color-mix(in srgb, var(--bg-0) 55%, transparent);
    cursor: default;
    touch-action: manipulation;
  }

  :global(html[data-compact-layout]) .shell-search-sheet {
    display: flex;
    flex-direction: column;
    position: fixed;
    inset: 0;
    z-index: 2360;
    padding: 0;
    padding-top: env(safe-area-inset-top, 0px);
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: var(--bg-0);
    box-sizing: border-box;
    overflow: hidden;
  }

  .shell-mobile-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    width: 100%;
    min-height: 48px;
    padding: 6px max(var(--space-3), env(safe-area-inset-left, 0px)) 6px
      max(var(--space-3), env(safe-area-inset-right, 0px));
    box-sizing: border-box;
  }

  .shell-mobile-brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    flex: 0 1 auto;
    max-width: 38%;
  }

  .shell-mobile-brand .brand-logo {
    width: 32px;
    height: 32px;
    border-radius: var(--radius);
  }

  .shell-mobile-title {
    flex: 1 1 auto;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text-1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .shell-mobile-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    flex: 1 1 0;
    min-width: 0;
    margin-left: auto;
  }

  :global(html[data-compact-layout]) .shell-mobile-actions :global(.mobile-status-strip) {
    flex: 1 1 auto;
    min-width: 0;
  }

  :global(html[data-tablet-layout]) .shell-mobile-brand {
    max-width: 42%;
  }

  .shell-icon-btn {
    display: inline-grid;
    place-items: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    background: var(--bg-2);
    color: var(--text-2);
    cursor: pointer;
    touch-action: manipulation;
  }
  .shell-icon-btn:hover {
    border-color: var(--border-2);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--bg-2));
  }

  .shell-mobile-search-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-1);
    background: var(--bg-1);
  }

  .shell-search-input {
    width: 100%;
    box-sizing: border-box;
    min-height: 44px;
    padding: 0 var(--space-3);
    font-size: 16px;
    border: 0;
    border-bottom: 1px solid var(--border-1);
    background: transparent;
    color: var(--text-1);
  }
  .shell-search-input--full {
    flex: 1 1 auto;
    min-height: 48px;
    padding: 0 var(--space-4);
    font-size: 18px;
    font-weight: 500;
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    background: var(--bg-2);
  }
  .shell-search-input--full:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
    border-color: var(--accent);
  }
  .shell-search-close {
    flex-shrink: 0;
    font-size: 18px;
    line-height: 1;
  }
  .shell-search-input:focus {
    outline: none;
    border-bottom-color: var(--accent);
  }

  :global(html[data-tablet-layout]) .shell-mobile-title {
    font-size: 14px;
  }

</style>
