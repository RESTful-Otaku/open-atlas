<!--
  Horizontal timeline-bar chart — each row is a labelled track with a
  colored segment spanning a portion of the track. Used for orbital
  launch schedules, migration waves, mobilization stages, and similar
  "named interval" visualisations.

  Purely display-only; callers supply the computed start/end fractions.
-->
<script lang="ts">
  export interface TimelineRow {
    readonly id: string;
    readonly label: string;
    readonly secondary?: string;
    /** Segment start as a fraction in `[0, 1]`. */
    readonly start: number;
    /** Segment end as a fraction in `[0, 1]`, `end > start`. */
    readonly end: number;
    readonly color?: string;
  }

  interface Props {
    rows: readonly TimelineRow[];
    /** Axis labels spread across the track; first is "now", last the horizon. */
    readonly axisLabels?: readonly string[];
  }

  const { rows, axisLabels = ["Now", "+6h", "+12h", "+24h"] }: Props = $props();
</script>

<div class="timeline">
  <div class="timeline-axis">
    {#each axisLabels as label (label)}
      <span>{label}</span>
    {/each}
  </div>
  <ul class="timeline-rows">
    {#each rows as row (row.id)}
      {@const clampedStart = Math.min(Math.max(row.start, 0), 1)}
      {@const clampedEnd = Math.min(Math.max(row.end, clampedStart), 1)}
      {@const width = Math.max((clampedEnd - clampedStart) * 100, 2)}
      <li class="timeline-row">
        <div class="timeline-label">
          <span class="timeline-label-primary">{row.label}</span>
          {#if row.secondary}
            <span class="timeline-label-secondary">{row.secondary}</span>
          {/if}
        </div>
        <div class="timeline-track" aria-hidden="true">
          <div
            class="timeline-fill"
            style="left: {clampedStart * 100}%; width: {width}%; background: {row.color ?? 'var(--accent)'};"
          ></div>
        </div>
      </li>
    {/each}
    {#if rows.length === 0}
      <li class="timeline-empty">No scheduled intervals.</li>
    {/if}
  </ul>
</div>

<style>
  .timeline {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .timeline-axis {
    display: grid;
    grid-template-columns: 160px 1fr;
    font-size: 10px;
    color: var(--text-3);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .timeline-axis span {
    padding-left: var(--space-2);
  }
  .timeline-axis {
    grid-template-columns: 160px repeat(4, 1fr);
  }
  .timeline-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .timeline-row {
    display: grid;
    grid-template-columns: 160px 1fr;
    align-items: center;
    gap: var(--space-3);
  }
  .timeline-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .timeline-label-primary {
    font-size: 12px;
    color: var(--text-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .timeline-label-secondary {
    font-size: 10px;
    color: var(--text-3);
  }
  .timeline-track {
    position: relative;
    height: 14px;
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-xs);
  }
  .timeline-fill {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: calc(var(--radius-xs) - 1px);
    opacity: 0.9;
  }
  .timeline-empty {
    padding: var(--space-3) var(--space-4);
    font-size: 12px;
    color: var(--text-3);
    text-align: center;
    border: 1px dashed var(--border-2);
    border-radius: var(--radius);
  }
</style>
