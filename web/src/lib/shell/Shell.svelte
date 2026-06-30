<script lang="ts">
  import { onMount } from "svelte";
  import { router } from "../router.svelte";
  import { mainScrollModeForPattern, viewForPattern } from "../views";
  import ActiveRoute from "./ActiveRoute.svelte";
  import LeftRail from "./LeftRail.svelte";
  import MobileBottomNav from "./MobileBottomNav.svelte";
  import { isCompactLayout, subscribeMobileLayout } from "../mobile-layout";
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
  import { refreshFeedLive, feedLive } from "../feed-live.svelte";
  import { refreshRemoteReadiness, readiness } from "../readiness.svelte";
  import { createBackoffPoll } from "../poll-with-backoff";
  import { notifySuccess, notifyWarning } from "../notify/notify";
  import { NOTIFY_CODES } from "../notify/notify-codes";
  import { prefetchView } from "../view-loaders";

  let { class: className = "" }: { class?: string } = $props();
  let paletteOpen = $state(false);
  let compactLayout = $state(isCompactLayout());

  onMount(() => {
    const unsubLayout = subscribeMobileLayout(() => {
      compactLayout = isCompactLayout();
    });
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        paletteOpen = !paletteOpen;
      }
    };
    window.addEventListener("keydown", onKey);

    const readinessBackoff = createBackoffPoll(
      async () => {
        if (dashboard.dataMode === "demo") return true;
        await refreshRemoteReadiness();
        return readiness.ingestCheckErr === null && readiness.ingestReady !== false;
      },
      {
        name: "readiness",
        intervalMs: 60_000,
        baseBackoffMs: 5_000,
        maxBackoffMs: 300_000,
        notifyAfterFailures: 3,
        onBackoffChange(backingOff, failures, nextPollMs) {
          if (backingOff) {
            notifyWarning({
              code: NOTIFY_CODES.INGEST_UNREACHABLE,
              title: "Ingest / LLM polling backed off",
              message: `${failures} consecutive failures — next poll in ${Math.round(nextPollMs / 1000)}s`,
              detail: "Readiness probes to ingest and LLM services are failing.",
              action: "Check that openatlas-ingest and openatlas-llm are running.",
              timeoutMs: 10_000,
              dedupeKey: "readiness-backoff",
              source: "ingest",
            });
          } else {
            notifySuccess({
              code: NOTIFY_CODES.INGEST_UNREACHABLE,
              title: "Ingest / LLM reachable again",
              message: "Readiness probes recovered — resuming normal polling interval.",
              timeoutMs: 5_000,
              dedupeKey: "readiness-recover",
              source: "ingest",
            });
          }
        },
      },
    );

    const feedBackoff = createBackoffPoll(
      async () => {
        await refreshFeedLive();
        return feedLive.error === null;
      },
      {
        name: "feed-catalog",
        intervalMs: 60_000,
        baseBackoffMs: 5_000,
        maxBackoffMs: 300_000,
        notifyAfterFailures: 3,
        onBackoffChange(backingOff, failures, nextPollMs) {
          if (backingOff) {
            notifyWarning({
              code: NOTIFY_CODES.FEED_POLL_FAIL,
              title: "Feed catalog polling backed off",
              message: `${failures} consecutive failures — next poll in ${Math.round(nextPollMs / 1000)}s`,
              detail: "The /feeds endpoint is not responding.",
              action: "Check that openatlas-ingest is running.",
              timeoutMs: 10_000,
              dedupeKey: "feed-backoff",
              source: "ingest",
            });
          } else {
            notifySuccess({
              code: NOTIFY_CODES.FEED_POLL_FAIL,
              title: "Feed catalog reachable again",
              message: "Feed catalog polling recovered — resuming normal interval.",
              timeoutMs: 5_000,
              dedupeKey: "feed-recover",
              source: "ingest",
            });
          }
        },
      },
    );

    const onVisibility = (): void => {
      if (document.hidden) {
        readinessBackoff.stop();
        feedBackoff.stop();
      } else {
        readinessBackoff.start();
        feedBackoff.start();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    readinessBackoff.start();
    feedBackoff.start();

    prefetchView("/matrix/:id");
    prefetchView("/settings");

    return () => {
      unsubLayout();
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      readinessBackoff.stop();
      feedBackoff.stop();
    };
  });

  const activeView = $derived(viewForPattern(router.match.pattern));
  const mainScrollMode = $derived(
    mainScrollModeForPattern(router.match.pattern, compactLayout),
  );
  const showTicker = $derived(routeShowsTicker(router.match.pattern));
  const showCommandBar = $derived(
    routeShowsCommandBar(router.match.pattern),
  );

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

  function routeShowsCommandBar(pattern: string): boolean {
    return pattern.startsWith("/matrix/");
  }

</script>

<div
  class="shell {className}"
  class:has-ticker={showTicker}
  class:has-cmd={showCommandBar}
  class:shell--compact={compactLayout}
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
    <MarketTicker compact={compactLayout} />
  {/if}
  <main
    id="shell-main"
    class="shell-main"
    class:shell-main-fill={mainScrollMode === "fill"}
    data-scroll={mainScrollMode}
    aria-label={activeView.title}
  >
    <ActiveRoute />
  </main>
  {#if showCommandBar}
    <OperatorCommandBar />
  {/if}
  {#if paletteOpen}
    <CommandPalette open={paletteOpen} onclose={() => (paletteOpen = false)} />
  {/if}
  <StateNotifyBridge />
  <ToastStack />
  {#if compactLayout}
    <MobileBottomNav />
  {/if}
</div>

<style>
  .shell-top-stack {
    grid-area: top;
    display: flex;
    flex-direction: column;
    min-width: 0;
    position: relative;
    z-index: 100;
    overflow: visible;
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
    overflow: hidden;
  }
  .shell-main.shell-main-fill > :global(*) {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 0;
    height: 100%;
    box-sizing: border-box;
  }

  .shell.shell--compact {
    grid-template-columns: 1fr;
    grid-template-areas:
      "top"
      "main"
      "main"
      "main";
    padding-bottom: var(--mobile-nav-height, calc(68px + env(safe-area-inset-bottom, 0px)));
  }
  .shell.shell--compact.has-ticker {
    grid-template-areas:
      "top"
      "ticker"
      "main"
      "main";
  }
  .shell.shell--compact.has-cmd {
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      "top"
      "main"
      "cmd";
  }
  .shell.shell--compact.has-ticker.has-cmd {
    grid-template-rows: auto auto 1fr auto;
    grid-template-areas:
      "top"
      "ticker"
      "main"
      "cmd";
  }
  .shell.shell--compact :global(.left-rail) {
    display: none;
  }
  .shell.shell--compact .shell-top-stack {
    padding-top: 0;
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
  }

  :global(html[data-compact-layout]) .shell.shell--compact .shell-top-stack {
    padding-top: env(safe-area-inset-top, 0px);
  }

  .shell.shell--compact .shell-main {
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
  }

  .shell.shell--compact .shell-main.shell-main-fill {
    min-height: calc(100dvh - var(--mobile-top-inset) - var(--mobile-nav-height));
    max-height: calc(100dvh - var(--mobile-top-inset) - var(--mobile-nav-height));
  }
</style>
