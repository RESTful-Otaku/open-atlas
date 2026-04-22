<!--
  The app shell. Lays out the left rail, top bar, optional market ticker,
  the active view, and the optional operator command bar.

  Which chrome is shown depends on the active route: matrix pages get
  the ticker + command bar, the legacy dashboard and settings view get
  neither, and the hub shows the ticker only. Centralising that logic
  here keeps individual views unaware of the shell.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { installRouter, router } from "../router.svelte";
  import { viewForPattern } from "../views";
  import LeftRail from "./LeftRail.svelte";
  import ShellTopBar from "./ShellTopBar.svelte";
  import MarketTicker from "./MarketTicker.svelte";
  import OperatorCommandBar from "./OperatorCommandBar.svelte";
  import CommandPalette from "./CommandPalette.svelte";
  import ToastStack from "../notify/ToastStack.svelte";
  import StateNotifyBridge from "../notify/StateNotifyBridge.svelte";
  import { dashboard } from "../state.svelte";
  import {
    enableDemoModeAndReload,
    exitDemoModeAndReload,
  } from "../demo-mode";
  import { refreshRemoteReadiness } from "../readiness.svelte";

  let { class: className = "" }: { class?: string } = $props();
  let paletteOpen = $state(false);

  onMount(() => {
    const disposer = installRouter();
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        paletteOpen = !paletteOpen;
      }
    };
    window.addEventListener("keydown", onKey);
    void refreshRemoteReadiness();
    const readinessPoll = window.setInterval(
      () => void refreshRemoteReadiness(),
      60_000,
    );
    return () => {
      disposer();
      window.removeEventListener("keydown", onKey);
      clearInterval(readinessPoll);
    };
  });

  const activeView = $derived(viewForPattern(router.match.pattern));
  const ActivePage = $derived(activeView.component);
  const showTicker = $derived(routeShowsTicker(router.match.pattern));
  const showCommandBar = $derived(
    routeShowsCommandBar(router.match.pattern),
  );

  /**
   * The ticker is a macro-economic affordance; it belongs on views where
   * cross-domain pulse matters (hub, map, matrix pages) but gets in the
   * way on view-specific surfaces (settings, entity database detail).
   */
  function routeShowsTicker(pattern: string): boolean {
    return (
      pattern === "/" ||
      pattern === "/map" ||
      pattern === "/hub" ||
      pattern === "/viz" ||
      pattern.startsWith("/domain/") ||
      pattern.startsWith("/matrix/")
    );
  }

  /**
   * The operator command bar is only useful on pages where operational
   * commands make sense. Matrices will grow a real grammar in M9; other
   * views don't have actionable verbs yet.
   */
  function routeShowsCommandBar(pattern: string): boolean {
    return pattern.startsWith("/matrix/");
  }

</script>

<div
  class="shell {className}"
  class:has-ticker={showTicker}
  class:has-cmd={showCommandBar}
>
  <div class="shell-top-stack">
    <ShellTopBar
      onopensearch={() => {
        paletteOpen = true;
      }}
    />
    {#if dashboard.dataMode === "demo"}
      <div class="demo-banner" role="status">
        <span
          >Demo / test data — no SpacetimeDB. Visualisations use synthetic
          events, signals, and domain aggregates.</span
        >
        <div class="demo-banner-actions">
          <button
            type="button"
            class="demo-link"
            onclick={() => exitDemoModeAndReload()}>Use live SpacetimeDB</button
          >
          <span class="demo-muted" aria-hidden="true">|</span>
          <button
            type="button"
            class="demo-link"
            onclick={() => enableDemoModeAndReload()}>Refresh demo (reload)</button
          >
        </div>
      </div>
    {/if}
  </div>
  <LeftRail />
  {#if showTicker}
    <MarketTicker />
  {/if}
  <main
    class="shell-main"
    class:shell-main-fill={activeView.id === "globe" || activeView.id === "map" || activeView.id === "viz" || activeView.id === "exec-hub" || activeView.id === "matrix"}
    aria-label={activeView.title}
  >
    <!-- Keyed so each route remounts; a bare dynamic tag must be bound to
         a capitalized `ActivePage` reference (not `activeView.component`). -->
    {#key router.match.path}
      <ActivePage />
    {/key}
  </main>
  {#if showCommandBar}
    <OperatorCommandBar />
  {/if}
  <CommandPalette open={paletteOpen} onclose={() => (paletteOpen = false)} />
  <StateNotifyBridge />
  <ToastStack />
</div>

<style>
  .shell-top-stack {
    grid-area: top;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .demo-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-5);
    background: color-mix(in srgb, var(--status-warn) 18%, var(--bg-2));
    border-bottom: 1px solid
      color-mix(in srgb, var(--status-warn) 40%, var(--border-1));
    font-size: 12px;
    color: var(--text-1);
  }
  .demo-banner-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .demo-link {
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    background: none;
    border: 0;
    padding: 0;
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
  }
  .demo-link:hover {
    color: var(--text-0);
  }
  .demo-muted {
    color: var(--text-3);
  }
  .shell {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    height: 100%;
    max-height: 100%;
    overflow: hidden;
    /* Rail column sizes from the rail component (`auto` = intrinsic width). */
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto 1fr auto;
    grid-template-areas:
      "rail top"
      "rail main"
      "rail main"
      "rail main";
  }
  .shell.has-ticker {
    grid-template-rows: auto auto 1fr auto;
    grid-template-areas:
      "rail top"
      "rail ticker"
      "rail main"
      "rail main";
  }
  .shell.has-cmd {
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      "rail top"
      "rail main"
      "rail cmd";
  }
  .shell.has-ticker.has-cmd {
    grid-template-rows: auto auto 1fr auto;
    grid-template-areas:
      "rail top"
      "rail ticker"
      "rail main"
      "rail cmd";
  }

  .shell-main {
    grid-area: main;
    min-width: 0;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .shell-main-fill {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  /**
   * Route views must not shrink to the intrinsic min-content of inner grids
   * (ECharts, etc.); they take the full `1fr` main column width.
   */
  .shell-main.shell-main-fill > :global(*) {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
</style>
