<!--
  Touch-first primary nav for native / narrow layouts. Desktop keeps LeftRail.
  Domains sheet is rendered outside the nav bar so backdrop-filter does not
  trap `position: fixed` children (known mobile WebView bug).
-->
<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { Globe2, LayoutGrid, Map as MapIcon, MoreHorizontal, Settings, X } from "@lucide/svelte";

  import { fadePanelBackdrop, flyFromBottom, MOTION_PANEL_MS } from "../motion/transitions";

  import { router, navigate } from "../router.svelte";
  import { DOMAIN_CATALOG } from "../colors";
  import { domainIcon } from "../domain-icons";

  let domainsOpen = $state(false);
  /** Keeps sheet in DOM through `out:fly`; false while exiting so nav stays clickable. */
  let domainsPresent = $state(false);

  const tabs = [
    { id: "globe", href: "#/", label: "Globe", icon: Globe2, match: (p: string) => p === "/" },
    { id: "map", href: "#/map", label: "Map", icon: MapIcon, match: (p: string) => p === "/map" },
    { id: "hub", href: "#/hub", label: "Hub", icon: LayoutGrid, match: (p: string) => p === "/hub" },
    {
      id: "settings",
      href: "#/settings",
      label: "Settings",
      icon: Settings,
      match: (p: string) => p === "/settings",
    },
  ] as const;

  const route = $derived(router.match);
  const onDomainRoute = $derived(route.path.startsWith("/domain/"));

  function go(href: string): void {
    closeDomains();
    navigate(href);
  }

  let domainsCloseTimer: ReturnType<typeof setTimeout> | undefined;

  function closeDomains(): void {
    domainsOpen = false;
    if (domainsCloseTimer !== undefined) clearTimeout(domainsCloseTimer);
    domainsCloseTimer = setTimeout(() => {
      domainsPresent = false;
      domainsCloseTimer = undefined;
    }, MOTION_PANEL_MS + 48);
  }

  function onDomainsOutroEnd(): void {
    if (domainsCloseTimer !== undefined) clearTimeout(domainsCloseTimer);
    domainsCloseTimer = undefined;
    domainsPresent = false;
  }

  function toggleDomains(): void {
    if (domainsOpen) {
      closeDomains();
      return;
    }
    domainsPresent = true;
    domainsOpen = true;
  }
</script>

{#if domainsPresent}
  {#if domainsOpen}
    <button
      type="button"
      class="mobile-domains-backdrop"
      aria-label="Close domains"
      onclick={closeDomains}
      transition:fade={fadePanelBackdrop}
    ></button>
  {/if}
  <div
    class="mobile-domains-sheet"
    class:is-closing={!domainsOpen}
    role="dialog"
    aria-label="Domain desks"
    aria-hidden={!domainsOpen}
    in:fly={flyFromBottom}
    out:fly={{ ...flyFromBottom, y: 12 }}
    onoutroend={onDomainsOutroEnd}
  >
    <header class="mobile-domains-sheet-head">
      <h2 class="mobile-domains-sheet-title">Domains</h2>
      <button
        type="button"
        class="mobile-domains-close"
        aria-label="Close domains"
        onclick={closeDomains}
      >
        <X size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </header>
    <div class="mobile-domains-sheet-body" role="menu">
      {#each DOMAIN_CATALOG as d (d.id)}
        {@const Icon = domainIcon(d.id)}
        <button
          type="button"
          role="menuitem"
          class="mobile-domain-row"
          class:is-active={route.path === `/domain/${d.id}`}
          onclick={() => go(`#/domain/${d.id}`)}
        >
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>{d.label}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<nav class="mobile-bottom-nav" aria-label="Primary">
  {#each tabs.slice(0, 3) as tab (tab.id)}
    {@const active = tab.match(route.pattern)}
    <button
      type="button"
      class="mobile-tab"
      class:is-active={active}
      aria-current={active ? "page" : undefined}
      onclick={() => go(tab.href)}
    >
      <tab.icon size={22} strokeWidth={1.75} aria-hidden="true" />
      <span class="mobile-tab-label">{tab.label}</span>
    </button>
  {/each}

  <button
    type="button"
    class="mobile-tab"
    class:is-active={domainsOpen || onDomainRoute}
    aria-expanded={domainsOpen}
    aria-haspopup="dialog"
    onclick={toggleDomains}
  >
    <MoreHorizontal size={22} strokeWidth={1.75} aria-hidden="true" />
    <span class="mobile-tab-label">Domains</span>
  </button>

  {#each tabs.slice(3) as tab (tab.id)}
    {@const active = tab.match(route.pattern)}
    <button
      type="button"
      class="mobile-tab"
      class:is-active={active}
      aria-current={active ? "page" : undefined}
      onclick={() => go(tab.href)}
    >
      <tab.icon size={22} strokeWidth={1.75} aria-hidden="true" />
      <span class="mobile-tab-label">{tab.label}</span>
    </button>
  {/each}
</nav>

<style>
  .mobile-bottom-nav {
    display: none;
  }

  :global(html[data-compact-layout]) .mobile-bottom-nav {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 250;
    padding: 10px 10px calc(12px + env(safe-area-inset-bottom, 0px));
    gap: 2px;
    background: var(--bg-1);
    border-top: 1px solid var(--border-1);
    border-radius: 0;
    box-shadow: 0 -4px 24px color-mix(in srgb, var(--bg-0) 40%, transparent);
    touch-action: manipulation;
  }

  .mobile-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 44px;
    min-width: 44px;
    padding: 4px 2px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-3);
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      color var(--motion-fast) var(--ease),
      background var(--motion-fast) var(--ease);
  }

  .mobile-tab:hover,
  .mobile-tab.is-active {
    color: var(--text-1);
    background: var(--overlay);
  }

  .mobile-tab.is-active {
    color: var(--accent);
  }

  .mobile-tab-label {
    line-height: 1.1;
    letter-spacing: 0.02em;
  }

  :global(html[data-compact-layout]) .mobile-domains-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 220;
    margin: 0;
    padding: 0;
    border: none;
    background: color-mix(in srgb, var(--bg-0) 55%, transparent);
    cursor: default;
    touch-action: manipulation;
    animation: mobile-backdrop-in 220ms var(--ease, ease) both;
  }

  .mobile-domains-backdrop {
    display: none;
  }

  .mobile-domains-sheet {
    display: none;
  }

  .mobile-domains-sheet.is-closing {
    pointer-events: none;
  }

  :global(html[data-compact-layout]) .mobile-domains-sheet {
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: var(--mobile-nav-height, 56px);
    z-index: 230;
    padding: 0;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: calc(var(--mobile-nav-height, 56px) + env(safe-area-inset-bottom, 0px));
    background: var(--bg-1);
    box-sizing: border-box;
    overflow: hidden;
  }

  @keyframes mobile-backdrop-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .mobile-domains-sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-shrink: 0;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-1);
  }

  .mobile-domains-sheet-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-1);
  }

  .mobile-domains-close {
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
    touch-action: manipulation;
  }

  .mobile-domains-sheet-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-2) var(--space-3);
    display: flex;
    flex-direction: column;
    gap: 2px;
    -webkit-overflow-scrolling: touch;
  }

  .mobile-domain-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-2);
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
  }

  .mobile-domain-row.is-active,
  .mobile-domain-row:hover {
    color: var(--text-1);
    background: var(--overlay);
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-tab {
      transition: none;
    }
  }
</style>
