<script lang="ts">
  import { navigate } from "../router.svelte";
  import { VIEW_CATALOG, hrefForNavEntry, type ViewCatalogEntry } from "../views";
  import {
    matrixById,
    MATRIX_CATALOG,
    type MatrixCatalogEntry,
  } from "../matrices/catalog";

  interface Props {
    q?: string;
    onnavigate?: () => void;
  }

  let { q = $bindable(""), onnavigate }: Props = $props();

  const navEntries = $derived(VIEW_CATALOG.filter((e) => e.nav));

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
    onnavigate?.();
  }

  function goMatrix(id: string): void {
    if (matrixById(id)) {
      navigate(`/matrix/${id}`);
      onnavigate?.();
    }
  }
</script>

<div class="cmd-body" role="document">
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

<style>
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
    min-height: var(--mobile-tap-min, 44px);
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
