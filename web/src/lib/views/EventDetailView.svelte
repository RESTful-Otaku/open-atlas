<!--
  Detail view for a single event: `/events/:id`.

  The view is deliberately resilient: any of (event, narrative,
  location) can be missing and the surface still reads sensibly. This
  is important because:

    * Narratives are only written above a severity threshold, so
      low-severity events will never have one.
    * The event ring is bounded; an id from an old link may no longer
      be in the client's projection.
    * The subscription may not have replayed yet on first mount.

  When the raw event row is missing we show a structured "not found"
  card with a link back to the Hub rather than rendering nothing.
-->
<script lang="ts">
  import { ArrowLeft, Activity, Clock, MapPin } from "@lucide/svelte";

  import { DOMAIN_STREAM_EXPLANATION } from "../event-domain-copy";
  import { router, navigate } from "../router.svelte";
  import { dashboard } from "../state.svelte";
  import { domainColor, domainLabel } from "../colors";
  import { signalsForEvent } from "../map/event-map-hover";
  import { domainIcon } from "../domain-icons";
  import {
    PanelHeader,
    SeverityChip,
    bucketSeverity,
  } from "../primitives";
  import type { UiEvent, UiEventNarrative } from "../types";

  const eventId = $derived(router.match.params.id ?? "");
  const event = $derived<UiEvent | null>(
    dashboard.events.find((e) => e.id === eventId) ?? null,
  );
  const narrative = $derived<UiEventNarrative | null>(
    dashboard.eventNarratives[eventId] ?? null,
  );
  const streamExpl = $derived(
    event && DOMAIN_STREAM_EXPLANATION[event.domain]
      ? DOMAIN_STREAM_EXPLANATION[event.domain]!
      : null,
  );
  const eventSignals = $derived(
    event ? signalsForEvent(event.id, dashboard.recentSignals, 20) : [],
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

  {#if event}
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
              <dd>
                {event.location
                  ? formatCoord(event.location.lat, event.location.lon)
                  : "—"}
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
                <span class="ed-trend-lab">Recent domain severity (synthetic / rolling index)</span>
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
                No detailed narrative was generated for this event. The
                server only writes narratives above a severity threshold.
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
</style>
