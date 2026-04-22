<script lang="ts">
  import { DOMAIN_CATALOG } from "../colors";
  import { dashboard, setSelectedDomain } from "../state.svelte";

  function select(id: string | null): void {
    setSelectedDomain(id);
  }
</script>

<div
  class="segmented"
  role="radiogroup"
  aria-label="Filter events by domain"
>
  <button
    type="button"
    class="segmented-btn"
    class:is-active={dashboard.selectedDomain === null}
    role="radio"
    aria-checked={dashboard.selectedDomain === null}
    onclick={() => select(null)}
  >
    All
  </button>
  {#each DOMAIN_CATALOG as entry (entry.id)}
    <button
      type="button"
      class="segmented-btn"
      class:is-active={dashboard.selectedDomain === entry.id}
      role="radio"
      aria-checked={dashboard.selectedDomain === entry.id}
      style="--btn-accent: {entry.color}"
      onclick={() => select(entry.id)}
    >
      {entry.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 3px;
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
  }

  .segmented-btn {
    --btn-accent: var(--accent);
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--text-2);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    padding: 5px 10px;
    border-radius: calc(var(--radius) - 4px);
    cursor: pointer;
    letter-spacing: 0.01em;
    transition:
      background var(--motion-fast) var(--ease),
      color var(--motion-fast) var(--ease);
  }
  .segmented-btn:hover {
    color: var(--text-1);
    background: var(--overlay);
  }
  .segmented-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .segmented-btn.is-active {
    background: var(--bg-3);
    color: var(--text-1);
    box-shadow: inset 0 0 0 1px var(--border-2);
  }
  .segmented-btn.is-active::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--btn-accent);
    margin-right: 6px;
    vertical-align: 1px;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--btn-accent) 28%, transparent);
  }
</style>
