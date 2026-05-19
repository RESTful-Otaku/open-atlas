<!--
  Rich contextual preview for a map point: metrics, domain spark, narrative,
  signals, causal. Fades in/out; pointer-events none so the map keeps hover.
-->
<script lang="ts">
  import { fade } from "svelte/transition";

  import { domainLabel, domainColor } from "../colors";
  import { resolveEventNarrative } from "../event-narrative-fallback";
  import { dashboard } from "../state.svelte";
  import { navigate } from "../router.svelte";
  import { clampCardPosition, signalsForEvent, countCausalForEvent } from "../map/event-map-hover";
  import type { UiEvent } from "../types";

  interface Props {
    /** Active event under the cursor; `null` hides. */
    event: UiEvent | null;
    /** Pointer in the map container (local px). */
    x: number;
    y: number;
    /** Map area element (`position: relative`); used for layout bounds. */
    container: HTMLElement | null;
  }
  let { event, x, y, container }: Props = $props();

  const narrative = $derived(
    resolveEventNarrative(
      event,
      dashboard.eventNarratives,
      event ? dashboard.domainInsights[event.domain] : undefined,
    ),
  );
  const signals = $derived(
    event ? signalsForEvent(event.id, dashboard.recentSignals) : [],
  );
  const causal = $derived(
    event
      ? countCausalForEvent(event.id, dashboard.recentCausalEdges)
      : { incoming: 0, outgoing: 0 },
  );
  const world = $derived(
    event ? (dashboard.domainState[event.domain] ?? null) : null,
  );
  const trendHistory = $derived(
    event
      ? (dashboard.domainSeverityHistory[event.domain] ?? [])
      : [],
  );
  const insight = $derived(
    event ? (dashboard.domainInsights[event.domain] ?? null) : null,
  );
  const pos = $derived.by(() => {
    if (!event || !container) {
      return { left: 0, top: 0 };
    }
    return clampCardPosition(
      x,
      y,
      container.clientWidth,
      container.clientHeight,
    );
  });

  const sparkPoints = $derived.by(() => {
    const s = trendHistory;
    if (s.length < 2) return "";
    const samples = s.slice(-20);
    const w = 100;
    const h = 32;
    const min = Math.min(...samples, 0);
    const max = Math.max(...samples, 0.01);
    return samples
      .map(
        (v, i) =>
          `${(i / (samples.length - 1 || 1)) * w},${h - ((v - min) / (max - min)) * (h - 4) - 2}`,
      )
      .join(" ");
  });
</script>

{#if event}
  <div
    class="emhc-wrap"
    style:left="{pos.left}px"
    style:top="{pos.top}px"
    role="status"
    transition:fade={{ duration: 140 }}
  >
    <div class="emhc" style="--emhc-accent: {domainColor(event.domain)}">
      <header class="emhc-head">
        <span
          class="emhc-dom"
          style:background="color-mix(in srgb, {domainColor(event.domain)} 22%, transparent)"
          style:border-color="color-mix(in srgb, {domainColor(event.domain)} 55%, var(--border-1))"
        >{domainLabel(event.domain)}</span>
        <span class="emhc-sev" title="Severity score 0–1"
          >{(event.severity_score ?? 0).toFixed(2)}</span
        >
      </header>
      <p class="emhc-time mono">{event.timestamp?.replace("T", " ").slice(0, 19)} UTC</p>

      <div class="emhc-bars" aria-label="Key metrics">
        <div class="emhc-bar-row">
          <span>Event severity</span>
          <div class="emhc-bar">
            <div
              class="emhc-bar-fill"
              style:width="{(Number.isFinite(event.severity_score) ? event.severity_score : 0) * 100}%"
            ></div>
          </div>
        </div>
        {#if world}
          <div class="emhc-bar-row">
            <span>Domain risk</span>
            <div class="emhc-bar">
              <div
                class="emhc-bar-fill emhc-bar-fill-2"
                style:width="{Math.max(0, Math.min(1, world.risk_index)) * 100}%"
              ></div>
            </div>
          </div>
        {/if}
      </div>

      {#if trendHistory.length > 1}
        <div class="emhc-spark" aria-label="Recent domain severity trend">
          <span class="emhc-sublabel">Domain severity (recent)</span>
          <svg
            class="emhc-spark-svg"
            viewBox="0 0 100 32"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              fill="none"
              stroke="var(--emhc-accent)"
              stroke-width="1.2"
              stroke-linejoin="round"
              points={sparkPoints}
            />
          </svg>
        </div>
      {/if}

      {#if narrative}
        <div class="emhc-nar">
          <p class="emhc-nh">{narrative.headline}</p>
          <p class="emhc-ns">
            {narrative.summary.length > 180
              ? `${narrative.summary.slice(0, 180)}…`
              : narrative.summary}
          </p>
        </div>
      {:else if insight?.narrative}
        <p class="emhc-insight">{insight.narrative.slice(0, 200)}{insight.narrative.length > 200
          ? "…"
          : ""}</p>
      {/if}

      {#if signals.length > 0}
        <div class="emhc-sig">
          <span class="emhc-sublabel">Signals</span>
          <ul>
            {#each signals as s (s.id)}
              <li>
                <span class="mono">{s.score.toFixed(2)}</span> — {s.reason}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <dl class="emhc-dl">
        <div>
          <dt>Ordinal</dt>
          <dd class="mono">{event.ordinal}</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd class="mono">
            {#if event.location}
              {event.location.lat.toFixed(2)}°, {event.location.lon.toFixed(2)}°
            {:else}—{/if}
          </dd>
        </div>
        <div>
          <dt>Causal</dt>
          <dd class="mono">in {causal.incoming} · out {causal.outgoing}</dd>
        </div>
        {#if world}
          <div>
            <dt>Domain events</dt>
            <dd class="mono">{world.event_count}</dd>
          </div>
        {/if}
      </dl>
      <p class="emhc-id mono" title="Event id">{event.id}</p>
      <div class="emhc-foot">
        <button
          type="button"
          class="emhc-open"
          onclick={() => navigate(`/events/${encodeURIComponent(event.id)}`)}
        >
          Open full analysis
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .emhc-wrap {
    position: absolute;
    z-index: 6;
    pointer-events: none;
    width: min(300px, calc(100% - 12px));
  }
  .emhc {
    border-radius: var(--radius);
    border: 1px solid var(--border-2);
    background: color-mix(in srgb, var(--bg-1) 94%, #0a0a12 6%);
    box-shadow: var(--shadow);
    padding: 10px 12px 10px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .emhc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0 0 4px;
  }
  .emhc-dom {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid var(--border-1);
    color: var(--text-1);
  }
  .emhc-sev {
    font: 600 16px/1.1 var(--font-mono);
    color: var(--text-0);
  }
  .emhc-time {
    margin: 0 0 8px;
    font-size: 10px;
    color: var(--text-3);
  }
  .emhc-bars {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }
  .emhc-bar-row {
    display: grid;
    grid-template-columns: 1fr 2fr;
    align-items: center;
    gap: 6px;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
  }
  .emhc-bar {
    height: 5px;
    border-radius: 2px;
    background: var(--bg-3);
    overflow: hidden;
  }
  .emhc-bar-fill {
    height: 100%;
    background: color-mix(in srgb, var(--emhc-accent) 90%, var(--text-0));
    border-radius: 2px;
  }
  .emhc-bar-fill-2 {
    background: color-mix(in srgb, var(--status-warn) 75%, var(--emhc-accent));
  }
  .emhc-spark {
    margin: 0 0 8px;
  }
  .emhc-sublabel {
    display: block;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-3);
    margin: 0 0 2px;
  }
  .emhc-spark-svg {
    display: block;
    width: 100%;
    height: 32px;
    opacity: 0.9;
  }
  .emhc-nar {
    margin: 0 0 6px;
  }
  .emhc-nh {
    margin: 0 0 2px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-0);
  }
  .emhc-ns {
    margin: 0;
    font-size: 11px;
    line-height: 1.35;
    color: var(--text-2);
  }
  .emhc-insight {
    margin: 0 0 6px;
    font-size: 10px;
    line-height: 1.4;
    color: var(--text-2);
  }
  .emhc-sig ul {
    margin: 2px 0 0 16px;
    padding: 0;
    font-size: 10px;
    line-height: 1.35;
    color: var(--text-2);
  }
  .emhc-sig li {
    margin: 0 0 2px;
  }
  .emhc-dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 10px;
    margin: 0 0 4px;
    font-size: 10px;
  }
  .emhc-dl dt {
    color: var(--text-3);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .emhc-dl dd {
    margin: 0;
    color: var(--text-1);
  }
  .emhc-id {
    margin: 0;
    font-size: 9px;
    color: var(--text-3);
    word-break: break-all;
  }
  .emhc-foot {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border-1);
  }
  .emhc-open {
    pointer-events: auto;
    display: block;
    width: 100%;
    padding: 6px 8px;
    border-radius: 5px;
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-1);
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
  }
  .emhc-open:hover {
    background: var(--bg-3);
    color: var(--text-0);
  }
  .mono {
    font-family: var(--font-mono);
  }
</style>
