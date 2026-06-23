<script lang="ts">
  import { onMount } from "svelte";
  import type { Component } from "svelte";
  import { fade } from "svelte/transition";
  import { router } from "../router.svelte";
  import { isCompactLayout, subscribeMobileLayout } from "../mobile-layout";
  import { mainScrollModeForPattern, viewForPattern } from "../views";
  import { loadViewForPattern, peekCachedView } from "../view-loaders";
  import { refreshRemoteReadiness } from "../readiness.svelte";
  import { refreshFeedLive } from "../feed-live.svelte";

  const entry = $derived(viewForPattern(router.match.pattern));
  let compactLayout = $state(isCompactLayout());
  const scrollMode = $derived(
    mainScrollModeForPattern(router.match.pattern, compactLayout),
  );

  const routeKey = $derived.by(() => {
    const { pattern, path, params } = router.match;
    if (pattern === "/events/:id") return `events:${params.id ?? path}`;
    if (pattern === "/matrix/:id") return `matrix:${params.id ?? path}`;
    if (pattern.startsWith("/domain/")) return path;
    return pattern;
  });

  let View: Component | null = $state(null);
  let loadError = $state<string | null>(null);
  let routeFadeMs = $state(0);

  onMount(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    routeFadeMs = reduced ? 0 : 180;
    return subscribeMobileLayout(() => {
      compactLayout = isCompactLayout();
    });
  });
  let loadGen = 0;
  let loadedPattern: string | null = null;

  $effect(() => {
    const pattern = router.match.pattern;
    const gen = ++loadGen;

    void refreshRemoteReadiness().catch(() => {});
    void refreshFeedLive().catch(() => {});

    const cached = peekCachedView(pattern);
    if (cached) {
      View = cached;
      loadError = null;
      loadedPattern = pattern;
      return;
    }

    if (loadedPattern !== pattern) {
      View = null;
    }
    loadError = null;

    const loadPromise = loadViewForPattern(pattern);
    const timeoutMs = 15_000;
    let loadTimeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      loadTimeout = setTimeout(() => reject(new Error(`View load timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    void Promise.race([loadPromise, timedOut])
      .then((component) => {
        clearTimeout(loadTimeout);
        if (gen !== loadGen) return;
        View = component;
        loadError = null;
        loadedPattern = pattern;
      })
      .catch((err) => {
        clearTimeout(loadTimeout);
        if (gen !== loadGen) return;
        View = null;
        loadError = err instanceof Error ? err.message : String(err);
        loadedPattern = null;
        console.error("route view load failed", pattern, err);
      });

    return () => clearTimeout(loadTimeout);
  });
</script>

{#key routeKey}
  {#if View}
    <div
      class="route-view"
      data-scroll={scrollMode}
      in:fade={{ duration: routeFadeMs }}
      out:fade={{ duration: routeFadeMs > 0 ? 120 : 0 }}
    >
      <View />
    </div>
  {:else if loadError}
    <div class="route-loading route-loading--error" role="alert">
      <span class="route-loading-label">Could not load {entry.title}</span>
      <p class="route-loading-detail">{loadError}</p>
    </div>
  {:else}
    <div class="route-loading" aria-busy="true" aria-live="polite">
      <span class="route-loading-label">Loading {entry.title}…</span>
    </div>
  {/if}
{/key}

<style>
  .route-view {
    display: flex;
    flex-direction: column;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }
  .route-view[data-scroll="fill"] {
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
  }
  .route-view[data-scroll="page"] {
    flex: 0 0 auto;
    min-height: auto;
    height: auto;
  }
  .route-loading {
    display: grid;
    place-items: center;
    gap: var(--space-2);
    min-height: 12rem;
    padding: var(--space-8);
    color: var(--text-3);
    font-size: 0.85rem;
    text-align: center;
  }
  .route-loading-label {
    letter-spacing: 0.04em;
  }
  .route-loading--error {
    color: var(--sev-high);
  }
  .route-loading-detail {
    margin: 0;
    max-width: 48ch;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-2);
  }
</style>
