<!--
  Global “entity” surface: the live `event` row set projected from
  SpacetimeDB, filterable the same way the map respects domain scoping.
-->
<script lang="ts">
  import { Database, Search } from "@lucide/svelte";

  import { dashboardData } from "../dashboard-revision.svelte";
  import { dashboard, setSelectedDomain } from "../state.svelte";
  import { navigate } from "../router.svelte";
  import type { UiEvent } from "../types";
  import CompactNumber from "../components/CompactNumber.svelte";
  import ConnectionPill from "../components/ConnectionPill.svelte";
  import DataPipelineBanner from "../components/DataPipelineBanner.svelte";

  const ENTITY_DISPLAY_CAP = 100;

  let q = $state("");
  let debouncedQ = $state("");
  type SortKey = "time" | "severity" | "ordinal";
  let sortBy = $state<SortKey>("ordinal");
  let sortDesc = $state(true);

  $effect(() => {
    const needle = q;
    const t = window.setTimeout(() => {
      debouncedQ = needle;
    }, 150);
    return () => clearTimeout(t);
  });

  const domains = $derived.by(() => {
    void dashboardData.revision;
    return [...new Set(dashboard.events.map((e) => e.domain))].sort((a, b) =>
      a.localeCompare(b),
    );
  });

  const filteredRows = $derived.by(() => {
    void dashboardData.revision;
    return filterAndSort(
      dashboard.events,
      debouncedQ,
      dashboard.selectedDomain,
      sortBy,
      sortDesc,
    );
  });

  const rows = $derived(filteredRows.slice(0, ENTITY_DISPLAY_CAP));
  const filteredCount = $derived(filteredRows.length);

  function filterAndSort(
    events: readonly UiEvent[],
    query: string,
    domain: string | null,
    by: SortKey,
    desc: boolean,
  ): UiEvent[] {
    const needle = query.trim().toLowerCase();
    const filtered = events.filter((e) => {
      if (domain && e.domain !== domain) return false;
      if (needle.length === 0) return true;
      return (
        e.id.toLowerCase().includes(needle) ||
        e.domain.toLowerCase().includes(needle) ||
        e.timestamp.toLowerCase().includes(needle) ||
        (e.location &&
          (`${e.location.lat},${e.location.lon}`.toLowerCase().includes(needle) ||
            false))
      );
    });
    const m = 1;
    const sign = desc ? -m : m;
    filtered.sort((a, b) => {
      if (by === "ordinal") return sign * (a.ordinal - b.ordinal);
      if (by === "severity") return sign * (a.severity_score - b.severity_score);
      return sign * a.timestamp.localeCompare(b.timestamp);
    });
    return filtered;
  }

  function setDomain(d: string | null): void {
    setSelectedDomain(d);
  }

  function setSort(k: SortKey): void {
    if (sortBy === k) sortDesc = !sortDesc;
    else {
      sortBy = k;
      sortDesc = k !== "time";
    }
  }

  function goGlobeFor(ev: UiEvent): void {
    setSelectedDomain(ev.domain);
    navigate("/");
  }
</script>

<section class="entities" aria-label="Event entities from SpacetimeDB">
  <header class="entities-top">
    <div class="entities-title">
      <Database size={16} strokeWidth={1.75} />
      <span>Global entity database</span>
    </div>
    <p class="entities-sub">
      Live <code>event</code> rows from your SpacetimeDB module (same feed as
      the globe and matrices). <CompactNumber value={dashboard.events.length} /> in
      ring buffer;
      {#if filteredCount > ENTITY_DISPLAY_CAP}
        showing first <CompactNumber value={ENTITY_DISPLAY_CAP} /> of
        <CompactNumber value={filteredCount} /> matches
      {:else}
        showing <CompactNumber value={filteredCount} /> after filters
      {/if}.
    </p>
    <div class="entities-toolbar">
      <div class="entities-search" role="search">
        <span class="search-ico" aria-hidden="true"
          ><Search size={14} strokeWidth={1.75} /></span
        >
        <input
          type="search"
          placeholder="Filter by id, domain, or timestamp…"
          bind:value={q}
          aria-label="Filter events"
        />
      </div>
      <div class="entities-pillbox">
        <span class="pill-lab">Connection</span>
        <ConnectionPill />
      </div>
    </div>
  </header>

  <DataPipelineBanner />

  <div class="entities-domains" role="group" aria-label="Domain filter">
    <button
      type="button"
      class:sel={dashboard.selectedDomain === null}
      onclick={() => setDomain(null)}
    >
      All domains
    </button>
    {#each domains as d (d)}
      <button
        type="button"
        class:sel={dashboard.selectedDomain === d}
        onclick={() =>
          setDomain(dashboard.selectedDomain === d ? null : d)
        }
        title="Filter to this domain"
      >
        {d}
      </button>
    {/each}
  </div>

  <div class="entities-table-wrap" role="region" aria-label="Event table">
    <table class="entities-table">
      <thead>
        <tr>
          <th>
            <button type="button" class="th-btn" onclick={() => setSort("ordinal")}>
              Ordinal
            </button>
          </th>
          <th>
            <button type="button" class="th-btn" onclick={() => setSort("time")}>
              Time (ISO)
            </button>
          </th>
          <th>Domain</th>
          <th>
            <button type="button" class="th-btn" onclick={() => setSort("severity")}>
              Severity
            </button>
          </th>
          <th>Location</th>
          <th>Id</th>
        </tr>
      </thead>
      <tbody>
        {#if rows.length === 0}
          <tr>
            <td class="td-empty" colspan="6">
              {#if dashboard.dataMode === "demo"}
                No events match the current filter. Demo mode should show hundreds
                of rows — try Settings → Re-seed demo data.
              {:else if dashboard.connection !== "live"}
                Not connected to SpacetimeDB ({dashboard.connection}).
                {#if dashboard.connectionLastError}
                  {dashboard.connectionLastError}
                {/if}
                Use Reconnect in the status pill or ./dev.sh up then ./dev.sh web.
              {:else if dashboard.events.length === 0}
                Connected but the event buffer is empty. Start ingest with
                <code>./dev.sh up</code> (hybrid recommended) and wait a few seconds.
              {:else}
                No events match the domain or search filter. Clear the domain
                chip above or widen your search.
              {/if}
            </td>
          </tr>
        {:else}
          {#each rows as ev (ev.id)}
            <tr ondblclick={() => goGlobeFor(ev)}>
              <td class="mono">{ev.ordinal}</td>
              <td class="mono cell-ts">{ev.timestamp}</td>
              <td>
                <span class="dom">{ev.domain}</span>
              </td>
              <td class="mono">{Number.isFinite(ev.severity_score) ? ev.severity_score.toFixed(3) : "—"}</td>
              <td class="mono loc">
                {#if ev.location}
                  {ev.location.lat.toFixed(2)}, {ev.location.lon.toFixed(2)}
                {:else}
                  —
                {/if}
              </td>
              <td class="mono id-cell" title={ev.id}>{ev.id}</td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
  <p class="entities-hint">Double-click a row to set the domain filter to that event&rsquo;s domain and open the 3D globe.</p>
</section>

<style>
  .entities {
    padding: var(--space-6) var(--space-5) var(--space-8);
    max-width: 1280px;
    min-height: 0;
  }
  .entities-top {
    margin-bottom: var(--space-4);
  }
  .entities-title {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 20px;
    font-weight: 600;
    color: var(--text-1);
    letter-spacing: -0.01em;
  }
  .entities-sub {
    margin-top: var(--space-2);
    color: var(--text-2);
    font-size: 13px;
    line-height: 1.5;
    max-width: 720px;
  }
  .entities-sub code {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .entities-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    margin-top: var(--space-4);
  }
  .search-ico {
    display: inline-flex;
    color: var(--text-3);
  }
  .entities-search {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 200px;
    max-width: 400px;
    height: 36px;
    padding: 0 var(--space-3);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
  }
  .entities-search input {
    flex: 1;
    border: 0;
    background: transparent;
    color: var(--text-1);
    font-size: 13px;
    min-width: 0;
  }
  .entities-search input::placeholder {
    color: var(--text-3);
  }
  .entities-search input:focus {
    outline: 0;
  }
  .entities-pillbox {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .pill-lab {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-3);
  }

  .entities-domains {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: var(--space-3);
  }
  .entities-domains button {
    font: inherit;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-2);
    cursor: pointer;
  }
  .entities-domains button:hover {
    color: var(--text-1);
  }
  .entities-domains button.sel {
    background: var(--bg-3);
    border-color: var(--border-2);
    color: var(--text-1);
    box-shadow: inset 0 0 0 1px var(--accent-weak, var(--border-2));
  }

  .entities-table-wrap {
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    background: var(--bg-1);
    overflow-x: auto;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    max-height: min(64vh, 720px);
    max-width: 100%;
  }
  .entities-table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .entities-table thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    text-align: left;
    padding: 10px 12px;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border-1);
    color: var(--text-2);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 10px;
  }
  .th-btn {
    font: inherit;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-2);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .th-btn:hover {
    color: var(--accent);
  }
  .entities-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-1);
    vertical-align: top;
  }
  .entities-table tbody tr:hover {
    background: var(--overlay-weak);
  }
  .td-empty {
    text-align: center;
    color: var(--text-3);
    padding: var(--space-8);
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 11px;
  }
  .cell-ts {
    white-space: nowrap;
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dom {
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 11px;
    color: var(--accent);
  }
  .id-cell {
    max-width: 7rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .loc {
    font-size: 10px;
  }
  .entities-hint {
    margin-top: var(--space-3);
    font-size: 12px;
    color: var(--text-3);
  }
</style>
