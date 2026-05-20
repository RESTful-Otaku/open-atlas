<!--
  Compact grid of KPI tiles. Each tile shows a small label, a large
  numeric value, optional delta, and optional tone.

  Used inside matrix panels for the "4 up / 6 up" stat callouts seen
  across economic, health, resource, and transport mockups.
-->
<script lang="ts">
  import CompactNumber from "../../components/CompactNumber.svelte";
  import { TrendArrow } from "../../primitives";

  export interface KpiCell {
    readonly label: string;
    readonly value: string;
    /** When set, renders {@link CompactNumber} instead of the string `value`. */
    readonly valueNumber?: number;
    readonly delta?: number;
    readonly deltaLabel?: string;
    /** Force a tone; if omitted the trend arrow colours itself from `delta`. */
    readonly direction?: "up-good" | "up-bad";
    readonly tone?: "default" | "warn" | "danger" | "accent";
  }

  interface Props {
    cells: readonly KpiCell[];
    columns?: 2 | 3 | 4 | 6;
  }

  const { cells, columns = 4 }: Props = $props();
</script>

<div class="kpi-grid" style="--kpi-cols: {columns}">
  {#each cells as cell (cell.label)}
    <div class="kpi-cell" data-tone={cell.tone ?? "default"}>
      <div class="kpi-label">{cell.label}</div>
      <div class="kpi-value mono">
        {#if cell.valueNumber != null}
          <CompactNumber value={cell.valueNumber} />
        {:else}
          {cell.value}
        {/if}
      </div>
      {#if cell.delta !== undefined}
        <TrendArrow
          delta={cell.delta}
          label={cell.deltaLabel}
          direction={cell.direction ?? "up-good"}
        />
      {/if}
    </div>
  {/each}
</div>

<style>
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(var(--kpi-cols), minmax(0, 1fr));
    gap: var(--space-3);
  }
  .kpi-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--space-3);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    background: var(--bg-2);
  }
  .kpi-label {
    font-size: 10px;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .kpi-value {
    font-size: 18px;
    color: var(--text-1);
    letter-spacing: -0.01em;
  }
  .kpi-cell[data-tone="warn"] .kpi-value {
    color: var(--status-warn);
  }
  .kpi-cell[data-tone="danger"] .kpi-value {
    color: var(--status-err);
  }
  .kpi-cell[data-tone="accent"] .kpi-value {
    color: var(--accent);
  }
</style>
