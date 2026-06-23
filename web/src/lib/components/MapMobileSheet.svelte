<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { X } from "@lucide/svelte";

  import { fadePanel, flyFromRight } from "../motion/transitions";

  interface Props {
    open: boolean;
    title: string;
    onclose: () => void;
    children?: import("svelte").Snippet;
  }

  let { open, title, onclose, children }: Props = $props();
</script>

{#if open}
  <button
    type="button"
    class="map-mobile-flyout-backdrop"
    aria-label="Close map layers"
    onclick={onclose}
    transition:fade={fadePanel}
  ></button>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions a11y_interactive_supports_focus -->
  <div
    class="map-mobile-flyout"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    in:fly={flyFromRight}
    out:fly={{ ...flyFromRight, x: 12 }}
  >
    <header class="map-mobile-flyout-head">
      <h2 class="map-mobile-flyout-title">{title}</h2>
      <button type="button" class="map-mobile-flyout-close" aria-label="Close" onclick={onclose}>
        <X size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </header>
    <div class="map-mobile-flyout-body">
      {@render children?.()}
    </div>
  </div>
{/if}

<style>
  .map-mobile-flyout-backdrop {
    position: absolute;
    inset: 0;
    z-index: 10;
    margin: 0;
    padding: 0;
    border: none;
    background: color-mix(in srgb, var(--bg-0) 42%, transparent);
    cursor: default;
    touch-action: manipulation;
  }

  .map-mobile-flyout {
    position: relative;
    z-index: 11;
    display: flex;
    flex-direction: column;
    width: min(72vw, 280px);
    max-height: min(58dvh, calc(100% - 52px));
    margin-bottom: 20px;
    flex-shrink: 0;
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    box-shadow: -8px 0 28px color-mix(in srgb, var(--bg-0) 50%, transparent);
    touch-action: manipulation;
    pointer-events: auto;
    overflow: hidden;
  }

  .map-mobile-flyout-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    flex-shrink: 0;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-1);
  }

  .map-mobile-flyout-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-1);
  }

  .map-mobile-flyout-close {
    display: inline-grid;
    place-items: center;
    min-width: var(--mobile-tap-min, 44px);
    min-height: var(--mobile-tap-min, 44px);
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-2);
    cursor: pointer;
  }

  .map-mobile-flyout-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: var(--space-1) var(--space-2) var(--space-2);
  }

  @media (prefers-reduced-motion: reduce) {
    .map-mobile-flyout-backdrop,
    .map-mobile-flyout {
      animation: none;
    }
  }
</style>
