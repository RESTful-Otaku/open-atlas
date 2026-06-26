<script lang="ts">
  import { ArrowLeft, Activity, Clock, MapPin } from "@lucide/svelte";

  import { DOMAIN_STREAM_EXPLANATION } from "../event-domain-copy";
  import { onMount } from "svelte";
  import { router, navigate } from "../router.svelte";
  import { dashboardData } from "../dashboard-revision.svelte";
  import { dashboard, lookupEventById, setSelectedDomain } from "../state.svelte";
  import { acquireNarrativeSubscription } from "../connection.svelte";

  onMount(() => acquireNarrativeSubscription());
  import { domainColor, domainLabel } from "../colors";
  import { signalsForEvent } from "../map/event-map-hover";
  import {
    causalNeighborsForEvent,
    eventDetailPath,
  } from "../map/causal-neighbors";
  import { domainIcon } from "../domain-icons";
  import {
    PanelHeader,
    SeverityChip,
    bucketSeverity,
  } from "../primitives";
  import { resolveEventNarrative } from "../event-narrative-fallback";
  import type { UiEvent } from "../types";

  const eventId = $derived(router.match.params.id ?? "");
  const event = $derived.by((): UiEvent | null => {
    void dashboardData.revision;
    return eventId ? (lookupEventById(eventId) ?? null) : null;
  });
  const narrative = $derived(
    resolveEventNarrative(
      event,
      dashboard.eventNarratives,
      event ? dashboard.domainInsights[event.domain] : undefined,
    ),
  );
  const narrativeFromServer = $derived(
    event ? Boolean(dashboard.eventNarratives[event.id]) : false,
  );
  const streamExpl = $derived(
    event && DOMAIN_STREAM_EXPLANATION[event.domain]
      ? DOMAIN_STREAM_EXPLANATION[event.domain]!
      : null,
  );
  const eventSignals = $derived(
    event ? signalsForEvent(event.id, dashboard.recentSignals, 20) : [],
  );
  const causalNeighbors = $derived(
    event
      ? causalNeighborsForEvent(event.id, dashboard.recentCausalEdges, 12)
      : null,
  );
  const domainTrend = $derived(
    event ? (dashboard.domainSeverityHistory[event.domain] ?? []) : [],
  );
  const sparkPath = $derived.by(() => {
    const s = domainTrend;
    if (s.length < 2) return "";
    const w = 120;
    const h = 40;
    const min = Math.min(...s, 0);
    const max = Math.max(...s, 0.01);
    return s
      .map(
        (v, i) =>
          `${(i / (s.length - 1 || 1)) * w},${h - ((v - min) / (max - min)) * (h - 4) - 2}`,
      )
      .join(" ");
  });

  const severityLevel = $derived(
    event ? bucketSeverity(event.severity_score) : "nominal",
  );
  const severityPct = $derived(
    event ? Math.round(event.severity_score * 100) : 0,
  );
  const formattedTime = $derived(event ? formatTime(event.timestamp) : "");
  const DomainIconCmp = $derived(event ? domainIcon(event.domain) : null);

  /**
   * Keep the time label human without pulling in a date library. We
   * always emit UTC explicitly so two operators comparing timestamps
   * in different locales get matching strings.
   */
  function formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.toISOString().replace("T", " ").slice(0, 19)} UTC`;
  }

  function formatCoord(lat: number, lon: number): string {
    return `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`;
  }

  function openOnMap(): void {
    if (!event) return;
    setSelectedDomain(event.domain);
    navigate("/map");
  }

  function openOnGlobe(): void {
    if (!event) return;
    setSelectedDomain(event.domain);
    navigate("/");
  }

  /**
   * The server writes predicted-disruption severity as a short label
   * (e.g. "critical", "high"). The severity chip primitive takes a
   * `SeverityLevel`, so we map labels to fractional scores and let
   * `bucketSeverity` do the classification — keeping one source of
   * truth for bucket thresholds. Unknown labels collapse to the
   * "elevated" amber rather than guessing.
   */
  function asFraction(label: string): number {
    switch (label.toLowerCase()) {
      case "critical":
        return 0.9;
      case "severe":
      case "high":
        return 0.75;
      case "elevated":
      case "moderate":
        return 0.55;
      case "watch":
      case "low":
        return 0.35;
      case "nominal":
        return 0.1;
      default:
        return 0.55;
    }
  }
</script>

<section class="event-detail">
  <header class="ed-top">
    <button
      type="button"
      class="ed-back"
      onclick={() => window.history.length > 1 ? window.history.back() : navigate("/")}
    >
      <ArrowLeft size={14} strokeWidth={1.75} />
      Back
    </button>
    <div class="ed-title">
      <span class="ed-eyebrow">Event</span>
      <h2>#{eventId}</h2>
    </div>
  </header>

  {#if dashboard.dataMode !== "demo" && dashboard.connection === "connecting"}
    <div class="ed-connecting" aria-live="polite">
      <div class="connecting-spinner" aria-hidden="true"></div>
      <span>Connecting to SpacetimeDB…</span>
    </div>
  {:else if dashboard.dataMode !== "demo" && dashboard.connection === "offline" && !event}
    <div class="ed-connecting is-offline" aria-live="polite">
      <span>SpacetimeDB connection lost.</span>
      <a href="#/settings" class="connecting-link">Check settings</a>
    </div>
  {:else if event}
    <div class="ed-grid">
      <article class="ed-main">
        <div
          class="ed-hero"
          style:--domain-accent={domainColor(event.domain)}
        >
          <div class="ed-hero-row">
            <span class="ed-domain">
              {#if DomainIconCmp}
                {@const IconCmp = DomainIconCmp}
                <IconCmp size={14} strokeWidth={1.75} />
              {/if}
              {domainLabel(event.domain)}
            </span>
            <SeverityChip level={severityLevel} size="md" />
          </div>
          <h3 class="ed-headline">
            {narrative?.headline ?? `${domainLabel(event.domain)} incident`}
          </h3>
          <dl class="ed-meta">
            <div>
              <dt><Clock size={12} strokeWidth={1.75} /> Observed</dt>
              <dd>{formattedTime}</dd>
            </div>
            <div>
              <dt><Activity size={12} strokeWidth={1.75} /> Severity</dt>
              <dd>{severityPct}%</dd>
            </div>
            <div>
              <dt><MapPin size={12} strokeWidth={1.75} /> Location</dt>
              <dd class="ed-loc-dd">
                {#if event.location}
                  <span>{formatCoord(event.location.lat, event.location.lon)}</span>
                  <span class="ed-loc-actions">
                    <button type="button" class="ed-loc-btn" onclick={openOnMap}>
                      2D map
                    </button>
                    <button type="button" class="ed-loc-btn" onclick={openOnGlobe}>
                      Globe
                    </button>
                  </span>
                {:else}
                  —
                {/if}
              </dd>
            </div>
            <div>
              <dt>Ordinal</dt>
              <dd>{event.ordinal}</dd>
            </div>
          </dl>
        </div>

        {#if streamExpl}
          <section class="panel ed-stream">
            <PanelHeader title="What this data stream means" />
            <div class="ed-body">
              <p class="ed-lead">{streamExpl.title}</p>
              <p>{streamExpl.body}</p>
            </div>
          </section>
        {/if}

        <section
          class="panel ed-viz"
          style:--ed-accent={domainColor(event.domain)}
        >
          <PanelHeader title="Severity in domain context" />
          <div class="ed-body ed-viz-b">
            <div class="ed-sevrow" aria-label="This event on 0 to 100 percent scale">
              <span class="ed-sevrow-l">This event</span>
              <div class="ed-vbar" role="img" aria-label="Severity {severityPct} percent">
                <div
                  class="ed-vbar-fill"
                  style:width="{(Number.isFinite(event.severity_score) ? event.severity_score : 0) * 100}%"
                ></div>
              </div>
              <span class="mono ed-sevrow-r">{severityPct}%</span>
            </div>
            {#if domainTrend.length > 1}
              <div class="ed-trend">
                <span class="ed-trend-lab">Domain severity trend (rolling index)</span>
                <svg
                  class="ed-spark"
                  viewBox="0 0 120 40"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polyline
                    fill="none"
                    stroke="var(--ed-accent, var(--accent))"
                    stroke-width="1.2"
                    stroke-linejoin="round"
                    points={sparkPath}
                  />
                </svg>
              </div>
            {/if}
          </div>
        </section>

        <section class="panel ed-summary">
          <PanelHeader title="Summary" />
          <div class="ed-body">
            {#if narrative}
              <p>{narrative.summary}</p>
            {:else}
              <p class="ed-muted">
                No narrative for this event — severity is below the watch
                threshold ({Math.round(0.5 * 100)}%).
              </p>
            {/if}
          </div>
        </section>

        <section class="panel ed-inference">
          <PanelHeader title="Inference" />
          <div class="ed-body">
            {#if narrative}
              <p>{narrative.inference}</p>
            {:else}
              <p class="ed-muted">Inference not available.</p>
            {/if}
          </div>
        </section>
      </article>

      <aside class="ed-side">
        <section class="panel">
          <PanelHeader title="Predicted Disruption" />
          <div class="ed-body">
            {#if narrative && narrative.predicted_disruption.length > 0}
              <ul class="ed-disruptions">
                {#each narrative.predicted_disruption as item (item.entity)}
                  <li>
                    <span class="ed-disruption-entity">{item.entity}</span>
                    <SeverityChip
                      level={bucketSeverity(asFraction(item.severity))}
                      label={item.severity}
                    />
                    <span class="ed-disruption-note">{item.note}</span>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="ed-muted">No downstream disruption predicted.</p>
            {/if}
          </div>
        </section>

        {#if causalNeighbors && (causalNeighbors.counts.incoming > 0 || causalNeighbors.counts.outgoing > 0)}
          <section class="panel ed-causal">
            <PanelHeader title="Causal links" />
            <div class="ed-body">
              <p class="ed-causal-sum mono">
                {causalNeighbors.counts.incoming} incoming ·
                {causalNeighbors.counts.outgoing} outgoing
                <span class="ed-muted-inline">(current ring)</span>
              </p>
              {#if causalNeighbors.incoming.length > 0}
                <h4 class="ed-causal-dir">Upstream</h4>
                <ul class="ed-causal-list">
                  {#each causalNeighbors.incoming as link (link.eventId + link.direction)}
                    <li>
                      <button
                        type="button"
                        class="ed-causal-link"
                        onclick={() => navigate(eventDetailPath(link.eventId))}
                      >
                        #{link.eventId}
                      </button>
                      <span class="mono ed-causal-score"
                        >{link.influenceScore.toFixed(2)}</span
                      >
                    </li>
                  {/each}
                </ul>
              {/if}
              {#if causalNeighbors.outgoing.length > 0}
                <h4 class="ed-causal-dir">Downstream</h4>
                <ul class="ed-causal-list">
                  {#each causalNeighbors.outgoing as link (link.eventId + link.direction)}
                    <li>
                      <button
                        type="button"
                        class="ed-causal-link"
                        onclick={() => navigate(eventDetailPath(link.eventId))}
                      >
                        #{link.eventId}
                      </button>
                      <span class="mono ed-causal-score"
                        >{link.influenceScore.toFixed(2)}</span
                      >
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </section>
        {/if}

        {#if narrative}
        <section class="panel">
          <PanelHeader title="Linked signals" />
          <div class="ed-body">
            {#if eventSignals.length > 0}
              <ul class="ed-signals">
                {#each eventSignals as s (s.id)}
                  <li>
                    <span class="mono ed-sig-sc">{s.score.toFixed(2)}</span>
                    <span class="ed-sig-r">{s.reason}</span>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="ed-muted">No signals linked to this event in the current buffer.</p>
            {/if}
          </div>
        </section>

        <section class="panel">
          <PanelHeader title="Provenance" />
          <div class="ed-body ed-provenance">
              <div class="kv">
                <span>Source</span
                ><span>{narrativeFromServer ? "SpacetimeDB" : "Synthesized from telemetry"}</span>
              </div>
              <div class="kv">
                <span>Updated</span><span>{formatTime(narrative.updated_at)}</span>
              </div>
              <div class="kv">
                <span>Event ID</span><span class="mono">#{eventId}</span>
              </div>
            </div>
          </section>
        {/if}
      </aside>
    </div>
  {:else}
    <div class="ed-missing panel">
      <PanelHeader title="Event not found" />
      <div class="ed-body">
        <p>
          Event <code>#{eventId}</code> is not currently in the client
          projection. It may have aged out of the event ring, or the
          connection may still be warming up.
        </p>
        <button type="button" onclick={() => navigate("/hub")}>
          Back to executive hub
        </button>
      </div>
    </div>
  {/if}
</section>

<style>
  .event-detail {
    padding: var(--space-5) var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .ed-top {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .ed-back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: var(--radius);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-1);
    cursor: pointer;
    font-size: 12px;
  }
  .ed-back:hover {
    background: var(--bg-3);
  }
  .ed-title {
    display: flex;
    flex-direction: column;
  }
  .ed-eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 10px;
    color: var(--text-3);
  }
  .ed-title h2 {
    margin: 2px 0 0;
    font-size: 18px;
    color: var(--text-1);
    font-family: var(--font-mono);
  }

  .ed-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
    gap: var(--space-4);
  }
  @media (max-width: 960px) {
    .ed-grid {
      grid-template-columns: 1fr;
    }
  }
  .ed-main,
  .ed-side {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .ed-hero {
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    background: var(--bg-1);
    padding: var(--space-5);
    border-left: 3px solid var(--domain-accent, var(--accent));
  }
  .ed-hero-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .ed-domain {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-2);
  }
  .ed-headline {
    margin: var(--space-3) 0 var(--space-4);
    font-size: 20px;
    color: var(--text-0);
    line-height: 1.3;
  }
  .ed-meta {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--space-3);
  }
  .ed-meta > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ed-meta dt {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-3);
    margin: 0;
  }
  .ed-meta dd {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-1);
  }

  .panel {
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    background: var(--bg-1);
    overflow: hidden;
  }
  .ed-body {
    padding: var(--space-4);
    color: var(--text-1);
    font-size: 13px;
    line-height: 1.55;
  }
  .ed-body p {
    margin: 0 0 0.65em;
  }
  .ed-body p:last-child {
    margin-bottom: 0;
  }
  .ed-lead {
    font-weight: 600;
    color: var(--text-0);
    margin-bottom: 0.4em;
  }
  .ed-viz-b {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .ed-sevrow {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 3.2rem;
    align-items: center;
    gap: 10px;
    font-size: 11px;
  }
  .ed-sevrow-l,
  .ed-trend-lab {
    color: var(--text-3);
  }
  .ed-sevrow-r {
    text-align: right;
    color: var(--text-1);
  }
  .ed-vbar {
    height: 8px;
    border-radius: 4px;
    background: var(--bg-2);
    overflow: hidden;
    border: 1px solid var(--border-1);
  }
  .ed-vbar-fill {
    height: 100%;
    background: var(--ed-accent, var(--accent));
    border-radius: 4px;
    min-width: 2px;
  }
  .ed-trend {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ed-trend-lab {
    font-size: 10px;
  }
  .ed-loc-dd {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .ed-loc-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .ed-loc-btn {
    font-size: 0.68rem;
    padding: 0.15rem 0.45rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-2);
    cursor: pointer;
  }
  .ed-loc-btn:hover {
    border-color: var(--accent);
    color: var(--text-1);
  }
  .ed-spark {
    width: 100%;
    height: 44px;
    display: block;
  }
  .ed-signals {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ed-signals li {
    display: grid;
    grid-template-columns: 2.2rem 1fr;
    gap: 8px;
    font-size: 12px;
    line-height: 1.4;
  }
  .ed-sig-sc {
    color: var(--text-2);
  }
  .ed-sig-r {
    color: var(--text-1);
  }
  .ed-muted {
    color: var(--text-3);
    font-style: italic;
  }
  .ed-muted-inline {
    color: var(--text-3);
    font-weight: 400;
    font-style: normal;
  }
  .ed-causal-sum {
    margin: 0 0 var(--space-3);
    font-size: 12px;
    color: var(--text-2);
  }
  .ed-causal-dir {
    margin: var(--space-2) 0 var(--space-1);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-3);
  }
  .ed-causal-list {
    list-style: none;
    margin: 0 0 var(--space-3);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ed-causal-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: 12px;
  }
  .ed-causal-link {
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--accent);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .ed-causal-link:hover {
    text-decoration: underline;
  }
  .ed-causal-score {
    color: var(--text-3);
    font-size: 11px;
  }

  .ed-disruptions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .ed-disruptions li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    column-gap: var(--space-3);
    row-gap: 2px;
    align-items: center;
  }
  .ed-disruption-entity {
    font-size: 12px;
    color: var(--text-1);
    font-weight: 500;
  }
  .ed-disruption-note {
    grid-column: 1 / -1;
    font-size: 11px;
    color: var(--text-3);
  }

  .ed-provenance {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .kv {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text-2);
  }
  .mono {
    font-family: var(--font-mono);
    color: var(--text-1);
  }

  .ed-missing {
    max-width: 520px;
  }
  .ed-missing .ed-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .ed-missing button {
    align-self: flex-start;
    padding: 6px 12px;
    border-radius: var(--radius);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-1);
    cursor: pointer;
    font-size: 12px;
  }
  code {
    font-family: var(--font-mono);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-xs);
    padding: 1px 6px;
  }
  .ed-connecting {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-8);
    color: var(--text-2);
    font-size: 14px;
    font-weight: 500;
  }
  .ed-connecting.is-offline {
    color: var(--status-err);
  }
  .connecting-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--border-2);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .connecting-link {
    color: var(--accent);
    text-decoration: underline;
    margin-left: var(--space-1);
  }
</style>
