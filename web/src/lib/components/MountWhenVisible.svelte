<script lang="ts">
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";

  interface Props {
    children: Snippet;
    minHeight?: string;
    class?: string;
    rootMargin?: string;
    unmountDelayMs?: number;
  }

  const {
    children,
    minHeight = "200px",
    class: className = "",
    rootMargin = "120px 0px",
    unmountDelayMs = 400,
  }: Props = $props();

  let root: HTMLDivElement | undefined = $state();
  let mounted = $state(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    const node = root;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      mounted = true;
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          if (hideTimer !== undefined) {
            clearTimeout(hideTimer);
            hideTimer = undefined;
          }
          mounted = true;
        } else if (!hideTimer) {
          hideTimer = setTimeout(() => {
            hideTimer = undefined;
            mounted = false;
          }, unmountDelayMs);
        }
      },
      { rootMargin, threshold: 0 },
    );
    io.observe(node);
    return () => {
      if (hideTimer !== undefined) clearTimeout(hideTimer);
      io.disconnect();
    };
  });
</script>

<div
  bind:this={root}
  class="mount-when-visible {className}"
  style:min-height={mounted ? undefined : minHeight}
>
  {#if mounted}
    {@render children()}
  {:else}
    <motion class="mount-when-visible-placeholder" aria-hidden="true"></motion>
  {/if}
</div>

<style>
  .mount-when-visible {
    width: 100%;
    min-width: 0;
  }
  .mount-when-visible-placeholder {
    width: 100%;
    min-height: inherit;
    border-radius: var(--radius);
    background: var(--bg-2);
    opacity: 0.35;
  }
</style>
