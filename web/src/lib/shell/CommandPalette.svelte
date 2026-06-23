<script lang="ts">
  import { onMount } from "svelte";
  import CommandPaletteBody from "./CommandPaletteBody.svelte";

  interface Props {
    open: boolean;
    onclose: () => void;
    inline?: boolean;
    fullscreen?: boolean;
    q?: string;
  }

  let { open, onclose, inline = false, fullscreen = false, q = $bindable("") }: Props = $props();

  $effect(() => {
    if (open && !inline) q = "";
  });

  onMount(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onclose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
</script>

{#if open}
  {#if inline}
    <div
      class="cmd-inline"
      class:cmd-inline--fullscreen={fullscreen}
      role="region"
      aria-label="Search results"
    >
      <CommandPaletteBody bind:q onnavigate={onclose} />
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="cmd-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      tabindex="-1"
      onclick={(e) => e.target === e.currentTarget && onclose()}
      onkeydown={(e) => {
        if (e.key === "Escape") onclose();
      }}
    >
      <div class="cmd-panel" role="document">
        <div class="cmd-search-wrap">
          <input
            class="cmd-search"
            type="search"
            placeholder="Filter views and matrices…"
            bind:value={q}
            aria-label="Filter palette"
          />
        </div>
        <CommandPaletteBody bind:q onnavigate={onclose} />
      </div>
    </div>
  {/if}
{/if}

<style>
  .cmd-backdrop {
    position: fixed;
    inset: 0;
    z-index: 3000;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 10vh;
  }
  .cmd-panel {
    width: min(480px, 92vw);
    max-height: 70vh;
    overflow: auto;
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
  }
  .cmd-inline {
    max-height: min(50vh, 360px);
    overflow: auto;
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-top: none;
    border-radius: 0 0 var(--radius) var(--radius);
  }
  .cmd-inline--fullscreen {
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    border: 0;
    border-radius: 0;
    background: var(--bg-1);
  }
  :global(.cmd-inline--fullscreen .cmd-body) {
    font-size: 15px;
    padding: var(--space-2) 0;
  }
  :global(.cmd-inline--fullscreen .cmd-list button) {
    min-height: var(--mobile-tap-min, 48px);
    padding: var(--space-3) var(--space-4);
    font-size: 16px;
  }
  :global(.cmd-inline--fullscreen .cmd-head) {
    font-size: 11px;
    padding: var(--space-3) var(--space-4) var(--space-1);
  }
  .cmd-search-wrap {
    padding: var(--space-3) var(--space-4) 0;
  }
  .cmd-search {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    font-size: 13px;
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    background: var(--bg-2);
    color: var(--text-1);
  }
  .cmd-search::placeholder {
    color: var(--text-3);
  }
  .cmd-search:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
  }
</style>
