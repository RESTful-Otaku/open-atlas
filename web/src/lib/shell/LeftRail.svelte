<!--
  Primary nav: icon strip or expanded list with one-line blurb per view.
  Width is persisted in localStorage (see `rail.svelte.ts`).
-->
<script lang="ts">
  import { ChevronsLeft, ChevronsRight } from "@lucide/svelte";

  import { router, navigate } from "../router.svelte";
  import { VIEW_CATALOG, hrefForNavEntry, type ViewCatalogEntry } from "../views";
  import { leftRail, toggleLeftRail } from "./rail.svelte";

  const topEntries = $derived<readonly ViewCatalogEntry[]>(
    VIEW_CATALOG.filter((e) => e.nav && e.id !== "settings"),
  );
  const bottomEntries = $derived<readonly ViewCatalogEntry[]>(
    VIEW_CATALOG.filter((e) => e.nav && e.id === "settings"),
  );

  /** Tracks route so nav highlight updates when the hash changes. */
  const route = $derived(router.match);

  function isActive(entry: ViewCatalogEntry): boolean {
    const { pattern, path } = route;
    if (pattern === entry.pattern) return true;
    // Parametric matrix route: still highlight "Matrices" on any /matrix/… link.
    if (entry.id === "matrix" && path.startsWith("/matrix/")) {
      return true;
    }
    return false;
  }

  function go(entry: ViewCatalogEntry): void {
    navigate(hrefForNavEntry(entry));
  }
</script>

<nav
  class="left-rail"
  class:rail--expanded={leftRail.expanded}
  aria-label="Primary"
>
  <div class="rail-head">
    <button
      type="button"
      class="rail-toggle"
      class:rail-toggle--padded={leftRail.expanded}
      title={leftRail.expanded ? "Collapse sidebar" : "Expand sidebar — show names"}
      aria-expanded={leftRail.expanded}
      aria-controls="rail-nav-sections"
      onclick={() => toggleLeftRail()}
    >
      {#if leftRail.expanded}
        <ChevronsLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        <span class="rail-toggle-txt">Hide</span>
      {:else}
        <ChevronsRight size={16} strokeWidth={1.75} aria-hidden="true" />
      {/if}
    </button>
  </div>

  <div id="rail-nav-sections" class="rail-body">
    <ul class="rail-stack">
      {#each topEntries as entry (entry.id)}
        <li>
          <button
            type="button"
            class="rail-row"
            class:is-active={isActive(entry)}
            title={leftRail.expanded ? undefined : entry.title}
            aria-current={isActive(entry) ? "page" : undefined}
            onclick={() => go(entry)}
          >
            <span class="rail-ico" aria-hidden="true">
              <entry.icon size={18} strokeWidth={1.75} />
            </span>
            {#if leftRail.expanded}
              <span class="rail-copy">
                <span class="rail-title">{entry.title}</span>
                {#if entry.navDescription}
                  <span class="rail-desc">{entry.navDescription}</span>
                {/if}
              </span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  </div>

  <ul class="rail-stack rail-stack-bottom">
    {#each bottomEntries as entry (entry.id)}
      <li>
        <button
          type="button"
          class="rail-row"
          class:is-active={isActive(entry)}
          title={leftRail.expanded ? undefined : entry.title}
          aria-current={isActive(entry) ? "page" : undefined}
          onclick={() => go(entry)}
        >
          <span class="rail-ico" aria-hidden="true">
            <entry.icon size={18} strokeWidth={1.75} />
          </span>
          {#if leftRail.expanded}
            <span class="rail-copy">
              <span class="rail-title">{entry.title}</span>
              {#if entry.navDescription}
                <span class="rail-desc">{entry.navDescription}</span>
              {/if}
            </span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
</nav>

<style>
  .left-rail {
    grid-area: rail;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    min-width: 0;
    width: 48px;
    box-sizing: border-box;
    background: var(--bg-1);
    border-right: 1px solid var(--border-1);
    transition: width 0.22s var(--ease);
    flex-shrink: 0;
  }
  .left-rail.rail--expanded {
    width: 240px;
  }

  .rail-head {
    flex-shrink: 0;
    padding: var(--space-2) var(--space-2) var(--space-1);
    border-bottom: 1px solid var(--border-1);
  }
  .rail-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 32px;
    border-radius: var(--radius);
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-3);
    cursor: pointer;
    gap: 6px;
    transition:
      color var(--motion-fast) var(--ease),
      background var(--motion-fast) var(--ease);
  }
  .rail-toggle--padded {
    justify-content: flex-start;
    padding: 0 6px 0 8px;
  }
  .rail-toggle:hover {
    color: var(--text-1);
    background: var(--overlay);
    border-color: var(--border-1);
  }
  .rail-toggle-txt {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-2);
  }

  .rail-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-2) var(--space-2) var(--space-1);
  }

  .rail-stack-bottom {
    flex-shrink: 0;
    padding: var(--space-2) var(--space-2) var(--space-3);
    border-top: 1px solid var(--border-1);
  }

  .rail-stack {
    display: flex;
    flex-direction: column;
    gap: 4px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .rail-row {
    display: flex;
    align-items: flex-start;
    width: 100%;
    min-height: 36px;
    padding: 4px 4px 4px 2px;
    gap: 8px;
    text-align: left;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius);
    color: var(--text-3);
    cursor: pointer;
    box-sizing: border-box;
    transition:
      color var(--motion-fast) var(--ease),
      background var(--motion-fast) var(--ease),
      border-color var(--motion-fast) var(--ease);
  }
  .left-rail:not(.rail--expanded) .rail-row {
    padding: 4px 2px;
    justify-content: center;
  }
  .rail-row:hover {
    color: var(--text-1);
    background: var(--overlay);
    border-color: var(--border-1);
  }
  .rail-ico {
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
  }
  .rail-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .rail-title {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--text-1);
  }
  .rail-desc {
    font-size: 10px;
    line-height: 1.35;
    color: var(--text-3);
  }
  .rail-row.is-active {
    border-color: var(--border-2);
    background: color-mix(in srgb, var(--accent) 12%, var(--bg-2));
  }
  .rail-row.is-active .rail-title {
    color: #fafafa;
  }
  .rail-row.is-active .rail-ico {
    color: var(--accent);
  }
  .left-rail:not(.rail--expanded) .rail-row.is-active {
    color: #0b0b0f;
    background: linear-gradient(
      135deg,
      var(--accent) 0%,
      var(--accent-violet) 100%
    );
    border-color: transparent;
    box-shadow: var(--shadow-glow);
  }
  .left-rail:not(.rail--expanded) .rail-row.is-active .rail-ico {
    color: #0b0b0f;
  }
  .left-rail.rail--expanded .rail-row.is-active {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .left-rail.rail--expanded .rail-row.is-active .rail-ico {
    color: var(--accent);
  }
</style>
