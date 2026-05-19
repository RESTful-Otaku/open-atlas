<!--
  Per-domain “desk” — a focused read on one axis of the world model:
  rolling KPIs, LLM/insight narrative, recency, severity history, and
  quick jumps to the map (domain filter) and the right command matrix.
-->
<script lang="ts">
  import { ExternalLink, Map as MapIcon, Network, PanelLeftDashed } from "@lucide/svelte";
  import { DOMAIN_CATALOG, domainLabel } from "../colors";
  import { domainIcon } from "../domain-icons";
  import { matrixIdForDomain } from "../hub";
  import { navigate, router } from "../router.svelte";
  import { getEventsForDomain } from "../domain-events-cache";
  import { dashboardData } from "../dashboard-revision.svelte";
  import { dashboard, setSelectedDomain } from "../state.svelte";
  import { SeverityChip, bucketSeverity, bucketRisk } from "../primitives";
  import type { UiCausalEdge, UiEvent, UiSignal } from "../types";
  import DomainKpiPanel from "../matrices/bound/DomainKpiPanel.svelte";
  import { DOMAIN_DESK_FOCUS } from "./domain-focus";
  import { deskProfileForDomain, type DeskProfile } from "./domain/domain-desk-types";
  import DomainChartsBlock from "./domain/DomainChartsBlock.svelte";
  import DomainEventMap from "./domain/DomainEventMap.svelte";
  import DomainHeroVisual from "./domain/DomainHeroVisual.svelte";
  import {
    geoMapAsideCopy,
    geoMapCaption,
    geoMapTitle,
  } from "../data-source-copy";

  const domainId = $derived(
    router.match.path
      .replace(/^\/domain\//, "")
      .split("/")
      .filter(Boolean)[0] ?? "",
  );
  const catalog = $derived(DOMAIN_CATALOG.find((d) => d.id === domainId));
  const Icon = $derived(catalog ? domainIcon(catalog.id) : domainIcon("energy"));

  const state = $derived(
    domainId ? dashboard.domainState[domainId] : undefined,
  );
  const insight = $derived(
    domainId ? dashboard.domainInsights[domainId] : undefined,
  );
  const severityHistory = $derived(
    domainId
      ? (dashboard.domainSeverityHistory[domainId] ?? [])
      : ([] as number[]),
  );
  const domainEventsAll = $derived.by(() => {
    if (!domainId) return [] as UiEvent[];
    void dashboardData.revision;
    return getEventsForDomain(domainId);
  });
  const domainEvents = $derived(sortEventsForDomain(domainEventsAll));
  const deskProfile = $derived(
    domainId ? deskProfileForDomain(domainId) : ("geo_operational" as DeskProfile),
  );
  const showGeoMap = $derived(
    deskProfile === "geo_operational",
  );
  const domainSignals = $derived(
    sortSignals(
      domainId
        ? dashboard.recentSignals.filter((s) => s.domain === domainId)
        : [],
    ),
  );
  const domainEventIds = $derived(new Set(domainEvents.map((e) => e.id)));
  const relatedEdges = $derived(
    domainId
      ? filterEdges(
          dashboard.recentCausalEdges,
          domainEventIds,
        ).slice(0, 14)
      : [],
  );
  const focus = $derived(DOMAIN_DESK_FOCUS[domainId] ?? "");
  const riskBucket = $derived(
    state ? bucketRisk(state.risk_index) : "nominal",
  );
  const matrixSlug = $derived(
    domainId ? matrixIdForDomain(domainId) : "threat",
  );

  $effect(() => {
    if (!catalog) {
      setSelectedDomain(null);
      return;
    }
    setSelectedDomain(catalog.id);
    return () => {
      setSelectedDomain(null);
    };
  });

  function sortEventsForDomain(rows: readonly UiEvent[]): UiEvent[] {
    return [...rows]
      .sort(
        (a, b) =>
          b.severity_score - a.severity_score || b.ordinal - a.ordinal,
      )
      .slice(0, 22);
  }

  function sortSignals(rows: readonly UiSignal[]): UiSignal[] {
    return [...rows]
      .sort((a, b) => b.score - a.score)
      .slice(0, 14);
  }

  function filterEdges(
    edges: readonly UiCausalEdge[],
    idSet: ReadonlySet<string>,
  ): UiCausalEdge[] {
    return edges.filter(
      (e) =>
        idSet.has(e.source_event_id) || idSet.has(e.target_event_id),
    );
  }

  function openEvent(id: string): void {
    navigate(`/events/${encodeURIComponent(id)}`);
  }

  function goMatrix(): void {
    navigate(`/matrix/${encodeURIComponent(matrixSlug)}`);
  }

  function goMap(): void {
    navigate("/map");
  }
</script>

{#if !catalog}
  <section class="domain-unknown" aria-label="Unknown domain">
    <h1 class="domain-h1">Domain not found</h1>
    <p class="domain-lead">
      No view is registered for <code class="domain-code">{domainId}</code>.
    </p>
    <button
      type="button"
      class="domain-cta"
      onclick={() => navigate("/hub")}>Back to executive hub</button
    >
  </section>
{:else}
  <div class="domain-page" style:--domain-accent={catalog.color}>
    <header class="domain-hero">
      <div class="domain-hero-main">
        <div class="domain-hero-titles">
          <p class="domain-kicker">
            <span class="domain-kicker-ico" aria-hidden="true">
              <Icon size={16} strokeWidth={1.75} />
            </span>
            Domain desk
          </p>
          <h1 class="domain-h1">{domainLabel(catalog.id)}</h1>
          <p class="domain-lead">
            Live rolling state, insight, and stream for this axis — tuned for
            {catalog.label} operators (not a second hub grid).
          </p>
          {#if focus}
            <p class="domain-focus">{focus}</p>
          {/if}
        </div>
        <DomainHeroVisual
          profile={deskProfile}
          accent={catalog.color}
          label={catalog.label}
        />
      </div>
      <div class="domain-hero-actions" role="group" aria-label="Open related views">
        <button
          type="button"
          class="domain-cta primary"
          onclick={goMatrix}
        >
          <PanelLeftDashed size={15} strokeWidth={1.75} aria-hidden="true" />
          Command matrix
        </button>
        <button type="button" class="domain-cta" onclick={goMap}>
          <MapIcon size={15} strokeWidth={1.75} aria-hidden="true" />
          2D map (this filter)
        </button>
      </div>
    </header>

    <section
      class="domain-panel domain-panel-kpi"
      aria-labelledby="domain-kpi-h"
    >
      <h2 id="domain-kpi-h" class="visually-hidden">KPIs and snapshot</h2>
      <DomainKpiPanel domain={catalog.id} columns={4} />
    </section>

    <section class="domain-panel domain-charts-wrap" aria-labelledby="domain-charts-h">
      <h2 id="domain-charts-h" class="visually-hidden">Domain charts</h2>
      {#key catalog.id}
        <DomainChartsBlock
          profile={deskProfile}
          domainId={catalog.id}
          accent={catalog.color}
          events={domainEventsAll}
          severityHistory={severityHistory}
          state={state}
          dataMode={dashboard.dataMode}
        />
      {/key}
    </section>

    <section
      class="domain-panel domain-narr"
      aria-labelledby="domain-narr-h"
    >
      <h2 id="domain-narr-h" class="domain-h2">Insight &amp; live state</h2>
        {#if insight}
          <p class="meta">
            {insight.trend} — anomalies
            {insight.anomaly_count_recent} ·
            {new Date(insight.updated_at).toLocaleString()} UTC
            {#if insight.dominant_source}
              <span> · {insight.dominant_source}</span>
            {/if}
            {#if insight.source_link}
              <a
                class="domain-link"
                href={insight.source_link}
                rel="noreferrer"
                target="_blank"
                >Source <ExternalLink size={11} strokeWidth={2} />
              </a>
            {/if}
          </p>
          <p class="domain-narrative">{insight.narrative}</p>
        {:else if state}
          <p class="domain-narrative muted">
            No narrative for this domain yet. Event counts and risk still
            update from the world-state ring: <strong
              >{state.event_count}</strong
            >
            events, risk
            {state.risk_index.toFixed(2)}.
          </p>
        {:else}
          <p class="domain-narrative muted">
            No rows yet for this domain — the feed may still be cold after
            connect.
          </p>
        {/if}
        {#if state}
          <div class="chips" role="list">
            <span class="chips-lbl" id="sev-lbl">Risk aggregate</span>
            <div class="chips-row" role="list" aria-labelledby="sev-lbl">
              <span class="cap-bucket" data-bucket={riskBucket}
                >{riskBucket}</span
              >
            </div>
          </div>
        {/if}
    </section>

    {#if showGeoMap}
      <div class="domain-map-row">
        <div class="domain-panel domain-map-panel">
          <DomainEventMap
            events={domainEventsAll}
            accent={catalog.color}
            title={geoMapTitle(dashboard.dataMode)}
            caption={geoMapCaption(
              dashboard.dataMode,
              domainEventsAll.filter((e) => e.location).length,
            )}
          />
        </div>
        <aside class="domain-panel domain-map-aside" aria-label="Geo context">
          <h3 class="aside-h">How to read this strip</h3>
          <p class="aside-p">
            {geoMapAsideCopy(dashboard.dataMode)}
          </p>
          <p class="aside-p muted">
            {domainEventsAll.filter((e) => e.location).length} /
            {domainEventsAll.length} events carry coordinates in this slice.
          </p>
        </aside>
      </div>
    {/if}

    <div class="domain-cols">
      <section
        class="domain-panel"
        aria-labelledby="domain-evt-h"
      >
        <h2 id="domain-evt-h" class="domain-h2">Recent events (this domain)</h2>
        {#if domainEvents.length === 0}
          <p class="muted">No events in the local ring for this filter.</p>
        {:else}
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Sev.</th>
                  <th scope="col">Ord.</th>
                  <th scope="col">Timestamp (UTC)</th>
                  {#if showGeoMap}
                    <th scope="col">Lat</th>
                    <th scope="col">Lon</th>
                  {/if}
                  <th scope="col">Score</th>
                </tr>
              </thead>
              <tbody>
                {#each domainEvents as e (e.id)}
                  <tr>
                    <td>
                      <button
                        type="button"
                        class="cell-btn"
                        onclick={() => openEvent(e.id)}
                        title="Open event detail"
                      >
                        <SeverityChip level={bucketSeverity(e.severity_score)} />
                      </button>
                    </td>
                    <td class="mono">
                      <button
                        type="button"
                        class="cell-btn mono"
                        onclick={() => openEvent(e.id)}
                      >#{e.ordinal}</button>
                    </td>
                    <td class="mono ts-cell">
                      <button
                        type="button"
                        class="cell-btn mono ts-cell"
                        onclick={() => openEvent(e.id)}
                      >{e.timestamp}</button>
                    </td>
                    {#if showGeoMap}
                      <td class="mono dim"
                        >{e.location ? e.location.lat.toFixed(2) : "—"}</td
                      >
                      <td class="mono dim"
                        >{e.location ? e.location.lon.toFixed(2) : "—"}</td
                      >
                    {/if}
                    <td class="mono">
                      <button
                        type="button"
                        class="cell-btn mono"
                        onclick={() => openEvent(e.id)}
                      >{e.severity_score.toFixed(2)}</button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>

      <section
        class="domain-panel"
        aria-labelledby="domain-sig-h"
      >
        <h2 id="domain-sig-h" class="domain-h2">Signals (scored for filter)</h2>
        {#if domainSignals.length === 0}
          <p class="muted">No recent signals in this stream slice.</p>
        {:else}
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Score</th>
                  <th scope="col">Linked event</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {#each domainSignals as s (s.id)}
                  <tr>
                    <td class="mono">{s.score.toFixed(2)}</td>
                    <td class="mono dim">{s.event_id}</td>
                    <td>{s.reason}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    </div>

    <section
      class="domain-panel domain-edges"
      aria-labelledby="domain-edges-h"
    >
      <h2 id="domain-edges-h" class="domain-h2">
        <Network size={16} strokeWidth={1.75} aria-hidden="true" />
        Causal edges (touching this domain)
      </h2>
      {#if relatedEdges.length === 0}
        <p class="muted">No recent edges in the local ring for these events.</p>
      {:else}
        <div class="table-scroll">
          <table class="data-table data-table--edges">
            <thead>
              <tr>
                <th scope="col">Source event</th>
                <th scope="col">Target</th>
                <th scope="col">Influence</th>
                <th scope="col">Decay</th>
              </tr>
            </thead>
            <tbody>
              {#each relatedEdges as e (e.id)}
                <tr>
                  <td class="mono dim">{e.source_event_id}</td>
                  <td class="mono dim">{e.target_event_id}</td>
                  <td class="mono">{e.influence_score.toFixed(2)}</td>
                  <td class="mono">{e.decay_rate.toFixed(3)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  .domain-unknown {
    padding: var(--space-10) var(--space-5);
    max-width: 520px;
  }
  .domain-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-5) var(--space-6) var(--space-8);
  }
  .domain-hero {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-5);
  }
  .domain-hero-main {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-5);
    flex: 1;
    min-width: min(100%, 40rem);
  }
  .domain-hero-titles {
    flex: 1;
    min-width: min(100%, 22rem);
  }
  .domain-kicker {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    margin: 0 0 0.35rem 0;
  }
  .domain-kicker-ico {
    color: var(--domain-accent, var(--accent));
  }
  .domain-h1 {
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin: 0 0 0.4rem 0;
    color: var(--text-1);
  }
  .domain-h2 {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin: 0 0 0.5rem 0;
  }
  .domain-lead {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.45;
    color: var(--text-2);
    max-width: 46rem;
  }
  .domain-focus {
    margin: 0.6rem 0 0 0;
    padding: 0.5rem 0.6rem;
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--text-2);
    border-left: 3px solid
      color-mix(in srgb, var(--domain-accent, var(--accent)) 55%, var(--bg-0));
    background: color-mix(
      in srgb,
      var(--domain-accent, var(--accent)) 8%,
      var(--bg-1)
    );
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  .domain-hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .domain-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.45rem 0.7rem;
    font-size: 0.8rem;
    font-weight: 600;
    border-radius: var(--radius);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-1);
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease);
  }
  .domain-cta:hover {
    background: var(--bg-3);
  }
  .domain-cta.primary {
    background: color-mix(
      in srgb,
      var(--domain-accent, var(--accent)) 20%,
      var(--bg-2)
    );
    border-color: color-mix(
      in srgb,
      var(--domain-accent, var(--accent)) 40%,
      var(--border-1)
    );
  }
  .domain-cta.primary:hover {
    background: color-mix(
      in srgb,
      var(--domain-accent, var(--accent)) 28%,
      var(--bg-2)
    );
  }
  .domain-panel {
    padding: var(--space-4);
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
  }
  .domain-panel-kpi {
    padding: var(--space-3) var(--space-3) 0;
    border: none;
    background: transparent;
  }
  .domain-charts-wrap {
    padding: var(--space-3) var(--space-4);
  }
  .domain-map-row {
    display: grid;
    grid-template-columns: 1.4fr 0.6fr;
    gap: var(--space-4);
  }
  @media (max-width: 960px) {
    .domain-map-row {
      grid-template-columns: 1fr;
    }
  }
  .domain-map-panel {
    padding: var(--space-3);
  }
  .domain-map-aside {
    padding: var(--space-4);
  }
  .aside-h {
    margin: 0 0 0.5rem 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-1);
  }
  .aside-p {
    margin: 0 0 0.45rem 0;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--text-2);
  }
  .domain-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
  }
  @media (max-width: 960px) {
    .domain-cols {
      grid-template-columns: 1fr;
    }
  }
  .meta {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin: 0 0 0.4rem 0;
  }
  .domain-narrative {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.5;
    color: var(--text-1);
  }
  .domain-narrative.muted,
  .muted {
    color: var(--text-3);
  }
  .domain-link {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    color: var(--accent);
  }
  .chips {
    margin-top: var(--space-3);
  }
  .chips-lbl {
    display: block;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 0.2rem;
  }
  .chips-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .cap-bucket {
    display: inline-block;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    text-transform: capitalize;
    background: var(--bg-2);
    color: var(--text-1);
    border: 1px solid var(--border-1);
  }
  .cap-bucket[data-bucket="warning"],
  .cap-bucket[data-bucket="elevated"] {
    color: var(--sev-mid);
    border-color: color-mix(
      in srgb,
      var(--sev-mid) 35%,
      var(--border-1)
    );
  }
  .cap-bucket[data-bucket="critical"] {
    color: var(--sev-high);
    border-color: color-mix(
      in srgb,
      var(--sev-high) 45%,
      var(--border-1)
    );
  }
  .mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .table-scroll {
    overflow-x: auto;
    margin-top: 0.25rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
  }
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
  }
  .data-table th,
  .data-table td {
    padding: 0.35rem 0.5rem;
    text-align: left;
    border-bottom: 1px solid var(--border-1);
    vertical-align: middle;
  }
  .data-table th {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    background: color-mix(in srgb, var(--bg-2) 88%, transparent);
  }
  .data-table tbody tr:hover {
    background: var(--overlay);
  }
  .data-table--edges td {
    font-size: 0.7rem;
  }
  .cell-btn {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }
  .ts-cell {
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dim {
    color: var(--text-3);
    font-size: 0.72rem;
  }
  .domain-edges h2 {
    text-transform: none;
    letter-spacing: 0;
    font-size: 0.9rem;
    color: var(--text-1);
  }
  .domain-code {
    font-family: var(--font-mono);
    background: var(--bg-2);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
  }
</style>
