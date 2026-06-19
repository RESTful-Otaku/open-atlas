<!--
  Reusable "list of cards" panel. Each card has a title, an optional
  severity chip, an optional trailing value pair (label + value), and
  optional sub-text. Used by Active Flashpoints, Strategic Commodities,
  Megacity Density, Upcoming Orbital Launches, etc.

  Items are supplied via props so this component stays display-only.
-->
<script lang="ts">
  import { SeverityChip } from "../../primitives";
  import type { CardListItem } from "./types";

  interface Props {
    items: readonly CardListItem[];
    emptyLabel?: string;
  }

  const { items, emptyLabel = "No entries yet." }: Props = $props();
</script>

<ul class="card-list">
  {#each items as item (item.id)}
    <li class="card-wrap">
      {#if item.href}
        <a
          class="card card-link"
          href={item.href}
          style={item.accent ? `--card-accent: ${item.accent}` : ""}
        >
          {@render cardBody(item)}
        </a>
      {:else}
        <div
          class="card"
          style={item.accent ? `--card-accent: ${item.accent}` : ""}
        >
          {@render cardBody(item)}
        </div>
      {/if}
    </li>
  {/each}
  {#if items.length === 0}
    <li class="card-empty">{emptyLabel}</li>
  {/if}
</ul>

{#snippet cardBody(item: CardListItem)}
  <header class="card-head">
    <span class="card-title">{item.title}</span>
    {#if item.severity}
      <SeverityChip level={item.severity} label={item.severityLabel} />
    {/if}
  </header>
  {#if item.subtitle}
    <div class="card-subtitle">{item.subtitle}</div>
  {/if}
  {#if item.leftPair || item.rightPair}
    <div class="card-pairs">
      {#if item.leftPair}
        <div class="card-pair">
          <span class="card-pair-label">{item.leftPair.label}</span>
          <span class="card-pair-value mono">{item.leftPair.value}</span>
        </div>
      {/if}
      {#if item.rightPair}
        <div class="card-pair">
          <span class="card-pair-label">{item.rightPair.label}</span>
          <span class="card-pair-value mono">{item.rightPair.value}</span>
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<style>
  .card-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .card-wrap {
    display: block;
  }

  .card {
    --card-accent: var(--border-2);
    position: relative;
    display: block;
    padding: var(--space-3) var(--space-4);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    overflow: hidden;
    color: inherit;
    text-decoration: none;
  }
  .card-link {
    transition: background 120ms ease, border-color 120ms ease;
  }
  .card-link:hover {
    background: var(--bg-3);
    border-color: var(--border-2);
  }
  .card-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .card::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 2px;
    background: var(--card-accent);
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .card-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-1);
  }
  .card-subtitle {
    margin-top: 2px;
    font-size: 12px;
    color: var(--text-2);
  }
  .card-pairs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
    margin-top: var(--space-3);
  }
  .card-pair {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .card-pair-label {
    font-size: 10px;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .card-pair-value {
    font-size: 12px;
    color: var(--text-1);
  }
  .card-empty {
    padding: var(--space-4);
    text-align: center;
    color: var(--text-3);
    font-size: 12px;
    border: 1px dashed var(--border-2);
    border-radius: var(--radius);
  }
</style>
