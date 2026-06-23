<script lang="ts">
  import { BarBadge } from "../../primitives";
  import type { RegionBar } from "./types";

  interface Props {
    items: readonly RegionBar[];
    emptyLabel?: string;
  }

  const { items, emptyLabel = "No readings yet." }: Props = $props();
</script>

<div class="region-bars">
  {#each items as item (item.label)}
    <BarBadge label={item.label} value={item.value} tone={item.tone} />
  {/each}
  {#if items.length === 0}
    <div class="region-bars-empty">{emptyLabel}</div>
  {/if}
</div>

<style>
  .region-bars {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .region-bars-empty {
    padding: var(--space-4);
    text-align: center;
    color: var(--text-3);
    font-size: 12px;
    border: 1px dashed var(--border-2);
    border-radius: var(--radius);
  }
</style>
