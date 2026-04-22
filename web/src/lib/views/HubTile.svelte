<!--
  A single tile in the Executive Summary Hub grid. Clicking the tile
  navigates to the domain's Matrix page (routes register in M4/M5).
-->
<script lang="ts">
  import { matrixIdForDomain, type HubTile } from "../hub";
  import { domainIcon } from "../domain-icons";
  import { SeverityChip, bucketSeverity } from "../primitives";
  import { navigate } from "../router.svelte";

  interface Props {
    tile: HubTile;
  }

  const { tile }: Props = $props();
  const Icon = $derived(domainIcon(tile.id));

  // Use severity bucketing for the chip in the tile corner; the tile
  // itself already conveys status via the accent bar, so the chip picks
  // a complementary granularity.
  const severityLevel = $derived(bucketSeverity(tile.riskIndex));

  function openMatrix(): void {
    navigate(`/matrix/${matrixIdForDomain(tile.id)}`);
  }
</script>

<button
  type="button"
  class="hub-tile"
  style="--tile-accent: {tile.accent}"
  onclick={openMatrix}
  aria-label={`Open ${tile.title} matrix`}
>
  <div class="hub-tile-top">
    <span class="hub-tile-icon" aria-hidden="true">
      <Icon size={16} strokeWidth={1.75} />
    </span>
    <SeverityChip level={severityLevel} />
  </div>

  <div class="hub-tile-body">
    <div class="hub-tile-title">{tile.title}</div>
    <div class="hub-tile-headline mono">{tile.headline}</div>
    <div class="hub-tile-sub">{tile.subMetric}</div>
  </div>
</button>

<style>
  .hub-tile {
    --tile-accent: var(--accent);
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4);
    min-height: 132px;
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    color: var(--text-1);
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--motion-fast) var(--ease),
      background var(--motion-fast) var(--ease),
      transform var(--motion-fast) var(--ease);
  }
  .hub-tile::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--tile-accent);
    border-top-left-radius: var(--radius-lg);
    border-bottom-left-radius: var(--radius-lg);
  }
  .hub-tile:hover {
    border-color: var(--border-strong);
    background: var(--bg-2);
  }
  .hub-tile:focus-visible {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .hub-tile-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .hub-tile-icon {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    background: color-mix(in oklab, var(--tile-accent) 22%, transparent);
    color: var(--tile-accent);
    border: 1px solid
      color-mix(in oklab, var(--tile-accent) 40%, transparent);
  }

  .hub-tile-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .hub-tile-title {
    font-size: 12px;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .hub-tile-headline {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-1);
    letter-spacing: -0.01em;
  }
  .hub-tile-sub {
    font-size: 11px;
    color: var(--text-3);
  }
</style>
