
<script lang="ts">
  import { tick } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { Maximize2, Minimize2, RotateCcw } from "@lucide/svelte";
  import type { EChartsOption } from "echarts";
  import type { ECharts } from "../echarts";
  import EChartsPanel from "./EChartsPanel.svelte";

  interface Props {
    /** Shown in the fullscreen header. */
    title: string;
    option: EChartsOption;
    /** Class for the embedded chart host (e.g. `desk-echart`, `hub-echart`). */
    embedClass?: string;
    /** Optional class for the fullscreen chart host. */
    fullscreenChartClass?: string;
    /** When false, only the chart is shown inline (no expand affordance). */
    enabled?: boolean;
    /**
     * Embedded chart uses compact mode (no ECharts toolbox / zoom chrome) by default.
     * Set true to merge full `withInteractiveDefaults` in the small view.
     */
    embedInteractive?: boolean;
    onChartClick?: (params: unknown) => void;
    onBrushSelected?: (params: unknown) => void;
    onDataZoom?: (params: unknown) => void;
  }

  const {
    title,
    option,
    embedClass = "",
    fullscreenChartClass = "fs-chart-max",
    enabled = true,
    embedInteractive = false,
    onChartClick,
    onBrushSelected,
    onDataZoom,
  }: Props = $props();

  let open = $state(false);
  let fullPanel: {
    getEchartsInstance(): ECharts | null;
    resetInteractions(): void;
  } | null = $state(null);
  let reducedMotion = $state(false);

  $effect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion = mq.matches;
    const sync = () => {
      reducedMotion = mq.matches;
    };
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  });

  $effect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  });

  /** Resize after the fullscreen panel mounts / layout settles. */
  $effect(() => {
    if (!open || !fullPanel) return;
    let cancelled = false;
    tick().then(() =>
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;
          fullPanel?.getEchartsInstance()?.resize();
        });
      }),
    );
    return () => {
      cancelled = true;
    };
  });

  async function handleResetView(): Promise<void> {
    await tick();
    fullPanel?.resetInteractions();
    await tick();
    fullPanel?.getEchartsInstance()?.resize();
  }

  function close(): void {
    open = false;
  }

  function keydownOnWindow(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }
</script>

<svelte:window onkeydown={open ? keydownOnWindow : undefined} />

<div class="fs-shell">
  <div class="fs-embed-wrap">
    {#if enabled}
      <button
        type="button"
        class="fs-expand"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open chart in fullscreen"
        onclick={() => (open = true)}
      >
        <Maximize2 size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    {/if}
    <EChartsPanel
      {option}
      class={embedClass}
      interactive={embedInteractive}
      onChartClick={onChartClick}
      onBrushSelected={onBrushSelected}
      onDataZoom={onDataZoom}
    />
  </div>
</div>

{#if open}
  <div class="fs-layer" transition:fade={{ duration: reducedMotion ? 0 : 220 }}>
    <button type="button" class="fs-backdrop" aria-label="Close fullscreen chart" onclick={close}></button>
    <div
      class="fs-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fs-dialog-title"
      tabindex="-1"
      transition:scale={{
        duration: reducedMotion ? 0 : 300,
        easing: cubicOut,
        start: 0.94,
        opacity: 0,
      }}
    >
      <header class="fs-toolbar">
        <h2 class="fs-title" id="fs-dialog-title">{title}</h2>
        <div class="fs-toolbar-actions">
          <button type="button" class="fs-tbtn" onclick={handleResetView} title="Reset zoom & brush">
            <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />
            <span class="fs-tbtn-label">Reset view</span>
          </button>
          <button
            type="button"
            class="fs-tbtn fs-tbtn-accent"
            onclick={close}
            title="Exit fullscreen"
          >
            <Minimize2 size={18} strokeWidth={2} aria-hidden="true" />
            <span class="fs-tbtn-label">Close</span>
          </button>
        </div>
      </header>
      <div class="fs-body">
        <EChartsPanel
          bind:this={fullPanel}
          {option}
          interactive={true}
          class={fullscreenChartClass}
          onChartClick={onChartClick}
          onBrushSelected={onBrushSelected}
          onDataZoom={onDataZoom}
        />
      </div>
    </div>
  </div>
{/if}

<style>
  .fs-shell {
    min-width: 0;
    width: 100%;
  }
  .fs-embed-wrap {
    position: relative;
    min-width: 0;
  }
  .fs-expand {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--border-2);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--bg-glass) 88%, transparent);
    backdrop-filter: blur(10px);
    color: var(--text-2);
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    opacity: 0.62;
    transition:
      opacity 0.22s ease,
      transform 0.22s ease,
      border-color 0.22s ease,
      color 0.22s ease;
  }
  .fs-embed-wrap:hover .fs-expand,
  .fs-expand:focus-visible {
    opacity: 1;
  }
  .fs-expand:hover {
    color: var(--accent);
    border-color: var(--border-strong);
    transform: scale(1.05);
  }
  .fs-expand:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
    outline-offset: 2px;
  }

  .fs-layer {
    position: fixed;
    inset: 0;
    z-index: 100020;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3);
    pointer-events: none;
  }
  .fs-backdrop {
    position: absolute;
    inset: 0;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    background: rgba(3, 3, 6, 0.62);
    backdrop-filter: blur(7px);
    pointer-events: auto;
  }
  .fs-dialog {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: min(96vw, 1280px);
    max-height: min(92vh, 900px);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-1);
    box-shadow:
      0 24px 64px rgba(0, 0, 0, 0.55),
      0 0 0 1px rgba(255, 255, 255, 0.04) inset;
    overflow: hidden;
    pointer-events: auto;
  }
  .fs-toolbar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-1);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg-2) 92%, transparent),
      var(--bg-1)
    );
  }
  .fs-title {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-1);
    letter-spacing: 0.02em;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fs-toolbar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }
  .fs-tbtn {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.45rem 0.75rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-2);
    background: var(--bg-2);
    color: var(--text-2);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease,
      transform 0.18s ease;
  }
  .fs-tbtn:hover {
    background: var(--bg-3);
    color: var(--text-1);
    border-color: var(--border-strong);
  }
  .fs-tbtn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 50%, transparent);
    outline-offset: 2px;
  }
  .fs-tbtn-accent {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border-2));
    background: color-mix(in srgb, var(--accent-soft) 45%, var(--bg-2));
    color: var(--accent);
  }
  .fs-tbtn-accent:hover {
    background: color-mix(in srgb, var(--accent-soft) 65%, var(--bg-2));
    color: var(--accent-strong, var(--accent));
  }
  .fs-tbtn-label {
    line-height: 1;
  }
  @media (max-width: 520px) {
    .fs-tbtn-label {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      border: 0;
    }
    .fs-tbtn {
      padding: 0.5rem;
    }
  }
  .fs-body {
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--space-2) var(--space-3) var(--space-3);
    display: flex;
    flex-direction: column;
  }
  :global(.fs-chart-max) {
    --echarts-min-height: min(62vh, 620px);
    --echarts-height: min(62vh, 620px);
    flex: 1 1 auto;
    min-height: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .fs-expand,
    .fs-tbtn {
      transition: none;
    }
  }
</style>
