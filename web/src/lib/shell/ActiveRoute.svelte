<!--
  One top-level route at a time. Views are lazy-loaded and evicted so
  WebGL / MapLibre / ECharts memory is not retained across the whole catalog.
-->
<script lang="ts">
  import type { Component } from "svelte";
  import { router } from "../router.svelte";
  import { viewForPattern } from "../views";
  import { loadViewForPattern, peekCachedView } from "../view-loaders";
  import {
    cancelScheduledDashboardFlush,
    pauseDashboardFlush,
    resumeDashboardFlush,
  } from "../dashboard-flush";

  const entry = $derived(viewForPattern(router.match.pattern));

  /** Remount when pattern changes, or when parametric routes need a fresh instance. */
  const routeKey = $derived.by(() => {
    const { pattern, path, params } = router.match;
    if (pattern === "/events/:id") return `events:${params.id ?? path}`;
    if (pattern === "/matrix/:id") return `matrix:${params.id ?? path}`;
    if (pattern.startsWith("/domain/")) return path;
    return pattern;
  });

  let View: Component | null = $state(null);
  let loadError = $state<string | null>(null);
  let loadGen = 0;
  let loadedPattern: string | null = null;

  $effect(() => {
    const pattern = router.match.pattern;
    const gen = ++loadGen;

    pauseDashboardFlush();
    cancelScheduledDashboardFlush();

    const cached = peekCachedView(pattern);
    if (cached) {
      View = cached;
      loadError = null;
      loadedPattern = pattern;
      resumeDashboardFlush();
      return () => {
        cancelScheduledDashboardFlush();
        resumeDashboardFlush();
      };
    }

    if (loadedPattern !== pattern) {
      View = null;
    }
    loadError = null;

    void loadViewForPattern(pattern)
      .then((component) => {
        if (gen !== loadGen) return;
        View = component;
        loadError = null;
        loadedPattern = pattern;
        resumeDashboardFlush();
      })
      .catch((err) => {
        if (gen !== loadGen) return;
        View = null;
        loadError = err instanceof Error ? err.message : String(err);
        loadedPattern = null;
        resumeDashboardFlush();
        console.error("route view load failed", pattern, err);
      });

    return () => {
      cancelScheduledDashboardFlush();
      resumeDashboardFlush();
    };
  });
</script>

{#key routeKey}
  {#if View}
    <View />
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
