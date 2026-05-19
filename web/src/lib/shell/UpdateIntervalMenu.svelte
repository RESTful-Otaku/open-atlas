<!--
  Top-bar control: how often live ingest is flushed to charts (revision bumps).
  Menu uses fixed positioning so it is not clipped by the shell grid overflow.
-->
<script lang="ts">
  import { tick } from "svelte";
  import { Timer } from "@lucide/svelte";
  import {
    UPDATE_INTERVAL_OPTIONS,
    getUpdateIntervalLabel,
    setUpdateInterval,
    updateInterval,
    type UpdateIntervalId,
  } from "../update-interval.svelte";

  let open = $state(false);
  let triggerEl: HTMLButtonElement | undefined = $state();
  let menuStyle = $state("");

  async function toggleOpen(): Promise<void> {
    open = !open;
    if (open) {
      await tick();
      positionMenu();
    }
  }

  function positionMenu(): void {
    const btn = triggerEl;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = 176;
    const left = Math.min(
      Math.max(8, r.right - width),
      window.innerWidth - width - 8,
    );
    const top = r.bottom + 6;
    menuStyle = `top:${top}px;left:${left}px;width:${width}px;`;
  }

  function pick(id: UpdateIntervalId): void {
    setUpdateInterval(id);
    open = false;
  }

  function onTriggerClick(e: MouseEvent): void {
    e.stopPropagation();
    void toggleOpen();
  }

  function onDocClick(e: MouseEvent): void {
    const t = e.target as Node | null;
    if (!open || !t) return;
    const root = document.getElementById("update-interval-menu");
    if (root && !root.contains(t)) open = false;
  }

  function onResize(): void {
    if (open) positionMenu();
  }
</script>

<svelte:window onclick={onDocClick} onresize={onResize} />

<div id="update-interval-menu" class="interval-root">
  <div class="interval-menu">
    <button
      bind:this={triggerEl}
      type="button"
      class="interval-trigger"
      aria-haspopup="listbox"
      aria-expanded={open}
      title="Update frequency (charts + live feeds; some APIs enforce longer minimums)"
      onclick={onTriggerClick}
    >
      <Timer size={14} strokeWidth={1.75} aria-hidden="true" />
      <span class="interval-label">{getUpdateIntervalLabel()}</span>
    </button>
  </div>

  {#if open}
    <ul
      class="interval-list"
      style={menuStyle}
      role="listbox"
      aria-label="Chart refresh cadence"
    >
      {#each UPDATE_INTERVAL_OPTIONS as opt (opt.id)}
        <li role="presentation">
          <button
            type="button"
            role="option"
            aria-selected={updateInterval.id === opt.id}
            class="interval-opt"
            class:is-selected={updateInterval.id === opt.id}
            onclick={() => pick(opt.id)}
          >
            {opt.label}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .interval-root {
    position: relative;
    flex-shrink: 0;
  }
  .interval-menu {
    display: contents;
  }
  .interval-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 10px;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-2);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    cursor: pointer;
    white-space: nowrap;
  }
  .interval-trigger:hover {
    color: var(--text-1);
    border-color: var(--border-2);
  }
  .interval-label {
    max-width: 9rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .interval-list {
    position: fixed;
    z-index: 4000;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--bg-1);
    border: 1px solid var(--border-2);
    border-radius: var(--radius);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
    max-height: min(70vh, 320px);
    overflow-y: auto;
  }
  .interval-opt {
    display: block;
    width: 100%;
    padding: 6px 10px;
    font-size: 12px;
    text-align: left;
    color: var(--text-2);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .interval-opt:hover {
    background: var(--overlay);
    color: var(--text-1);
  }
  .interval-opt.is-selected {
    color: var(--accent);
    font-weight: 600;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
</style>
