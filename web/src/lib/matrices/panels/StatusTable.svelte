<script lang="ts">
  import { StatusDot } from "../../primitives";
  import type { StatusTableRow } from "./types";

  interface Props {
    rows: readonly StatusTableRow[];
    emptyLabel?: string;
  }

  const { rows, emptyLabel = "No rows to display." }: Props = $props();
</script>

<div class="status-table">
  {#each rows as row (row.id)}
    <div class="status-row">
      <div class="status-row-text">
        {#if row.href}
          <a class="status-row-primary status-link" href={row.href}>{row.primary}</a>
        {:else}
          <div class="status-row-primary">{row.primary}</div>
        {/if}
        {#if row.secondary}
          <div class="status-row-secondary">{row.secondary}</div>
        {/if}
      </div>
      <StatusDot level={row.status} label={row.statusLabel} />
      {#if row.right}
        <div class="status-row-right mono">{row.right}</div>
      {/if}
    </div>
  {/each}
  {#if rows.length === 0}
    <div class="status-table-empty">{emptyLabel}</div>
  {/if}
</div>

<style>
  .status-table {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .status-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-1);
    min-width: 0;
  }
  .status-row:last-child {
    border-bottom: 0;
  }
  .status-row-text {
    min-width: 0;
  }
  .status-row-primary {
    font-size: 12px;
    color: var(--text-1);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  a.status-link {
    color: inherit;
    text-decoration: none;
    border-bottom: 1px solid color-mix(in oklab, var(--accent) 50%, transparent);
  }
  a.status-link:hover {
    color: var(--accent);
  }
  .status-row-secondary {
    font-size: 11px;
    color: var(--text-3);
    margin-top: 1px;
  }
  .status-row-right {
    font-size: 11px;
    color: var(--text-2);
    text-align: right;
  }
  .status-table-empty {
    padding: var(--space-4);
    text-align: center;
    color: var(--text-3);
    font-size: 12px;
    border: 1px dashed var(--border-2);
    border-radius: var(--radius);
  }
</style>
