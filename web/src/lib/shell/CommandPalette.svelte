<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "../router.svelte";
  import { VIEW_CATALOG, hrefForNavEntry, type ViewCatalogEntry } from "../views";
  import { matrixById, MATRIX_CATALOG, type MatrixCatalogEntry } from "../matrices";

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  const { open, onclose }: Props = $props();

  let q = $state("");

  const navEntries = $derived(
    VIEW_CATALOG.filter((e) => e.nav),
  );

  $effect(() => {
    if (open) q = "";
  });

  function matchNav(entry: ViewCatalogEntry, needle: string): boolean {
    if (needle.length === 0) return true;
    const t = [
      entry.title,
      entry.pattern,
      entry.navHref ?? "",
      entry.navDescription ?? "",
      entry.id,
    ]
      .join(" ")
      .toLowerCase();
    return t.includes(needle);
  }

  function matchMatrix(m: MatrixCatalogEntry, needle: string): boolean {
    if (needle.length === 0) return true;
    const t = [m.id, m.title, m.subtitle, `/matrix/${m.id}`]
      .join(" ")
      .toLowerCase();
    return t.includes(needle);
  }

  const navFiltered = $derived(
    navEntries.filter((e) => matchNav(e, q.trim().toLowerCase())),
  );
  const matrixFiltered = $derived(
    MATRIX_CATALOG.filter((m) => matchMatrix(m, q.trim().toLowerCase())),
  );

  function goEntry(entry: ViewCatalogEntry): void {
    navigate(hrefForNavEntry(entry));
    onclose();
  }

  function goMatrix(id: string): void {
    if (matrixById(id)) {
      navigate(`/matrix/${id}`);
      onclose();
    }
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onclose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
</script>

{#if open}
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
      <header class="cmd-head">Go to</header>
      <ul class="cmd-list">
        {#each navFiltered as e (e.id)}
          <li>
            <button type="button" onclick={() => goEntry(e)}>
              {e.title}
              <span class="cmd-hint mono">{e.pattern}</span>
            </button>
          </li>
        {/each}
      </ul>
      {#if navFiltered.length === 0 && q.trim().length > 0}
        <p class="cmd-empty">No views match &ldquo;{q.trim()}&rdquo;.</p>
      {/if}
      <header class="cmd-head">Matrices</header>
      <ul class="cmd-list">
        {#each matrixFiltered as m (m.id)}
          <li>
            <button type="button" onclick={() => goMatrix(m.id)}>
              {m.title}
              <span class="cmd-hint mono">/matrix/{m.id}</span>
            </button>
          </li>
        {/each}
      </ul>
      {#if matrixFiltered.length === 0 && q.trim().length > 0}
        <p class="cmd-empty">No matrices match &ldquo;{q.trim()}&rdquo;.</p>
      {/if}
    </div>
  </div>
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
  .cmd-head {
    padding: var(--space-2) var(--space-4);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-3);
  }
  .cmd-list {
    list-style: none;
    margin: 0;
    padding: 0 0 var(--space-2);
  }
  .cmd-list button {
    width: 100%;
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border: 0;
    background: transparent;
    color: var(--text-1);
    font-size: 13px;
    cursor: pointer;
  }
  .cmd-list button:hover {
    background: var(--overlay-weak);
  }
  .cmd-hint {
    font-size: 10px;
    color: var(--text-3);
  }
  .mono {
    font-family: var(--font-mono);
  }
  .cmd-empty {
    margin: 0;
    padding: 0 var(--space-4) var(--space-2);
    font-size: 12px;
    color: var(--text-3);
  }
</style>
