<script lang="ts">
  import { LayoutGrid, RotateCcw } from "@lucide/svelte";

  interface Props {
    editMode: boolean;
    onEditToggle: () => void;
    onReset: () => void;
    /** Optional, e.g. "Legacy dashboard" */
    label?: string;
  }
  const {
    editMode,
    onEditToggle,
    onReset,
    label = "Panel layout",
  }: Props = $props();
</script>

<div class="lay-edit" role="group" aria-label={label}>
  <span class="lay-edit-kick">{label}</span>
  {#if editMode}
    <span class="lay-edit-hint">Drag panels or use arrows. Width: span columns (12 = full row).</span>
  {/if}
  <div class="lay-edit-btns">
    <button
      type="button"
      class="lay-btn"
      class:is-on={editMode}
      aria-pressed={editMode}
      onclick={onEditToggle}
    >
      <LayoutGrid size={14} strokeWidth={1.75} />
      {editMode ? "Done" : "Customize"}
    </button>
    {#if editMode}
      <button
        type="button"
        class="lay-btn"
        title="Reset to default order and sizes"
        onclick={onReset}
      >
        <RotateCcw size={14} strokeWidth={1.75} />
        Reset
      </button>
    {/if}
  </div>
</div>

<style>
  .lay-edit {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2) var(--space-4);
    flex: 1;
    min-width: 0;
  }
  .lay-edit-kick {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-3);
  }
  .lay-edit-hint {
    font-size: 11px;
    color: var(--text-3);
    max-width: 40ch;
    line-height: 1.35;
  }
  .lay-edit-btns {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .lay-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    font-size: 11px;
    font-weight: 600;
    border-radius: var(--radius);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-1);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease),
      border-color var(--motion-fast) var(--ease);
  }
  .lay-btn:hover {
    background: var(--bg-3);
    border-color: var(--border-2);
  }
  .lay-btn.is-on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
  }
</style>
