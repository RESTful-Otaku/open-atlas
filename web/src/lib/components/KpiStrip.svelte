<script lang="ts">
  import { Activity, AlertTriangle, Layers, Radio } from "@lucide/svelte";

  import { dashboard } from "../state.svelte";
  import { MAX_EVENTS } from "../data-limits";
  import { fmtInt, fmtFixed } from "../format";
  import Sparkline from "./Sparkline.svelte";

  const BUCKETS = 24;

  function severitySeries(events: typeof dashboard.events): number[] {
    if (events.length === 0) return [];
    const window = events.slice(Math.max(events.length - 120, 0));
    const bucketSize = Math.max(Math.ceil(window.length / BUCKETS), 1);
    const series: number[] = [];
    for (let i = 0; i < window.length; i += bucketSize) {
      const chunk = window.slice(i, i + bucketSize);
      const sum = chunk.reduce((acc, e) => acc + e.severity_score, 0);
      series.push(sum / chunk.length);
    }
    return series;
  }

  function averageSeverity(events: typeof dashboard.events): number {
    if (events.length === 0) return 0;
    return (
      events.reduce((acc, e) => acc + e.severity_score, 0) / events.length
    );
  }

  const series = $derived(severitySeries(dashboard.events));
  const avg = $derived(averageSeverity(dashboard.events));
  const domainCount = $derived(Object.keys(dashboard.domainState).length);
</script>

<section class="kpi-strip-panel">
  <article class="kpi" style="--kpi-glow: rgba(34, 211, 238, 0.18)">
    <div class="kpi-head">
      <span class="kpi-label">Events in window</span>
      <Activity size={14} strokeWidth={1.75} />
    </div>
    <div class="kpi-value">
      <span>{fmtInt(dashboard.events.length)}</span>
      <span class="kpi-suffix">streamed</span>
    </div>
    <div class="kpi-caption">
      Bounded ring buffer · {dashboard.events.length}/{MAX_EVENTS}
    </div>
  </article>

  <article class="kpi" style="--kpi-glow: rgba(239, 68, 68, 0.16)">
    <div class="kpi-head">
      <span class="kpi-label">Active anomalies</span>
      <AlertTriangle size={14} strokeWidth={1.75} />
    </div>
    <div class="kpi-value">
      <span>{fmtInt(dashboard.recentSignals.length)}</span>
      <span class="kpi-suffix">signals</span>
    </div>
    <div class="kpi-caption">Threshold inference</div>
  </article>

  <article class="kpi" style="--kpi-glow: rgba(245, 158, 11, 0.18)">
    <div class="kpi-head">
      <span class="kpi-label">Average severity</span>
      <Radio size={14} strokeWidth={1.75} />
    </div>
    <div class="kpi-value">
      <span>{fmtFixed(avg, 2)}</span>
      <span class="kpi-suffix">0 – 1</span>
    </div>
    <div class="kpi-spark">
      <Sparkline values={series} color="#f59e0b" height={30} width={220} />
    </div>
  </article>

  <article class="kpi" style="--kpi-glow: rgba(167, 139, 250, 0.18)">
    <div class="kpi-head">
      <span class="kpi-label">Live domains</span>
      <Layers size={14} strokeWidth={1.75} />
    </div>
    <div class="kpi-value">
      <span>{fmtInt(domainCount)}</span>
      <span class="kpi-suffix">tracked</span>
    </div>
    <div class="kpi-caption">Reporting in current window</div>
  </article>
</section>

<style>
  .kpi-strip-panel {
    grid-column: span 12;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-3);
  }

  @media (max-width: 900px) {
    .kpi-strip-panel {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .kpi {
    position: relative;
    padding: var(--space-4) var(--space-5);
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    overflow: hidden;
    transition: transform var(--motion-med) var(--ease);
    min-height: 120px;
    display: flex;
    flex-direction: column;
  }
  .kpi:hover {
    transform: translateY(-1px);
    border-color: var(--border-2);
  }
  .kpi::after {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(
      120% 80% at 100% 0%,
      var(--kpi-glow, rgba(34, 211, 238, 0.1)),
      transparent 60%
    );
    pointer-events: none;
  }

  .kpi-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--text-3);
  }
  .kpi-head :global(svg) {
    color: var(--text-2);
  }

  .kpi-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .kpi-value {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin-top: var(--space-2);
    font-size: 28px;
    font-weight: 600;
    line-height: 1;
    color: var(--text-1);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  .kpi-suffix {
    font-size: 12px;
    color: var(--text-3);
    font-weight: 500;
  }

  .kpi-caption {
    margin-top: var(--space-2);
    font-size: 12px;
    color: var(--text-2);
  }

  .kpi-spark {
    margin-top: var(--space-3);
    height: 30px;
  }
</style>
