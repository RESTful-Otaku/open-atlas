<script lang="ts">
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { ChevronDown, ChevronUp, GripVertical, RotateCcw, Save } from "@lucide/svelte";
  import FullscreenChartShell from "../../viz/FullscreenChartShell.svelte";
  import { memoDomainDeskPack } from "../../chart-cache";
  import { dashboardData } from "../../dashboard-revision.svelte";
  import type { DeskProfile } from "./domain-desk-types";
  import { deskChartPack, type DeskChartPanel } from "./domain-desk-charts";
  import type { DataMode } from "../../data-source-copy";
  import type { UiCausalEdge, UiEvent, UiEventHourBucket, UiWorldState } from "../../types";
  import {
    clearSavedLayout,
    cycleSpan,
    defaultLayout,
    loadLayout,
    type ColSpan,
    reorderOrder,
    saveLayout,
    withViewTransition,
    LAYOUT_STORAGE_VERSION,
  } from "./domain-chart-layout";
  import {
    builtInPresetLayout,
    listNamedPresets,
    saveNamedPreset,
    type BuiltInPresetId,
  } from "./domain-chart-presets";

  interface Props {
    profile: DeskProfile;
    domainId: string;
    accent: string;
    events: readonly UiEvent[];
    eventHourBuckets?: Record<string, UiEventHourBucket>;
    severityHistory: readonly number[];
    /** Edges touching this domain — used for cyber force graph. */
    causalEdges?: readonly UiCausalEdge[];
    worldState?: UiWorldState;
    dataMode?: DataMode;
  }
  const {
    profile,
    domainId,
    accent,
    events,
    eventHourBuckets = undefined,
    severityHistory,
    causalEdges = [],
    worldState,
    dataMode = "live",
  }: Props = $props();

  const pack = $derived.by(() => {
    void dashboardData.revision;
    void dashboardData.domainsRevision;
    return memoDomainDeskPack(`${profile}:${domainId}`, () =>
      deskChartPack(profile, {
        domainId,
        accent,
        events,
        eventHourBuckets,
        severityHistory,
        causalEdges,
        state: worldState,
        dataMode,
      }),
    );
  });

  /** Render order — values are original panel indices `0..n-1`. */
  let order = $state([] as number[]);
  let spanByIndex = $state({} as Record<number, ColSpan>);
  let layoutKey = $state("");
  let dragFromPosition = $state(null as number | null);
  let dragOverPosition = $state(null as number | null);
  let savedFlash = $state(false);
  let reduceMotion = $state(false);

  $effect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion = mq.matches;
    const fn = () => {
      reduceMotion = mq.matches;
    };
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  });

  $effect(() => {
    const n = pack.panels.length;
    const k = `${profile}:${domainId}:${n}`;
    if (k === layoutKey) return;
    layoutKey = k;
    const L = loadLayout(profile, domainId, n);
    order = [...L.order];
    spanByIndex = { ...L.spanByIndex };
  });

  /** While dragging: show where the card would land; `order` stays committed until drop. */
  const previewOrder = $derived.by(() => {
    if (dragFromPosition === null || dragOverPosition === null) return order;
    if (dragFromPosition === dragOverPosition) return order;
    return reorderOrder(order, dragFromPosition, dragOverPosition);
  });

  const orderedPanels = $derived(
    previewOrder
      .map((origIndex) => {
        const panel = pack.panels[origIndex];
        return panel ? { origIndex, panel } : null;
      })
      .filter((x): x is { origIndex: number; panel: DeskChartPanel } => x != null),
  );

  const flipDuration = $derived(reduceMotion ? 0 : 320);

  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  function snapshot() {
    return {
      version: LAYOUT_STORAGE_VERSION as typeof LAYOUT_STORAGE_VERSION,
      order: Object.freeze([...order]) as readonly number[],
      spanByIndex: Object.freeze({ ...spanByIndex }) as Readonly<Record<number, ColSpan>>,
    };
  }
  function schedulePersist(): void {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = undefined;
      saveLayout(profile, domainId, snapshot());
    }, 450);
  }
  function saveNow(): void {
    clearTimeout(persistTimer);
    saveLayout(profile, domainId, snapshot());
    savedFlash = true;
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        savedFlash = false;
      }, 2000);
    }
  }
  function resetDefault(): void {
    clearTimeout(persistTimer);
    withViewTransition(() => {
      clearSavedLayout(profile, domainId);
      const d = defaultLayout(pack.panels.length);
      order = [...d.order];
      spanByIndex = { ...d.spanByIndex };
    });
  }
  function applyBuiltInPreset(presetId: BuiltInPresetId): void {
    clearTimeout(persistTimer);
    const L = builtInPresetLayout(presetId, pack.panels.length);
    withViewTransition(() => {
      order = [...L.order];
      spanByIndex = { ...L.spanByIndex };
      schedulePersist();
    });
  }
  function saveNamedFromCurrent(): void {
    if (typeof window === "undefined") return;
    const name = window.prompt("Name this layout preset");
    if (!name?.trim()) return;
    saveNamedPreset(profile, domainId, name.trim(), snapshot());
    savedFlash = true;
    window.setTimeout(() => {
      savedFlash = false;
    }, 2000);
  }
  function loadNamed(name: string): void {
    const hit = listNamedPresets(profile, domainId).find((p) => p.name === name);
    if (!hit) return;
    clearTimeout(persistTimer);
    withViewTransition(() => {
      order = [...hit.layout.order];
      spanByIndex = { ...hit.layout.spanByIndex };
      schedulePersist();
    });
  }
  const namedPresets = $derived(listNamedPresets(profile, domainId));
  function spanVal(origIndex: number): ColSpan {
    return spanByIndex[origIndex] ?? 1;
  }
  function spanClass(origIndex: number): string {
    return `span-${spanVal(origIndex)}`;
  }
  function onCycleSpan(origIndex: number): void {
    const cur = spanByIndex[origIndex] ?? 1;
    const next = cycleSpan(cur);
    withViewTransition(() => {
      spanByIndex = { ...spanByIndex, [origIndex]: next };
      schedulePersist();
    });
  }
  function committedDisplayIndex(origIndex: number): number {
    return order.indexOf(origIndex);
  }
  function onMoveUp(origIndex: number): void {
    const displayPos = committedDisplayIndex(origIndex);
    if (displayPos <= 0) return;
    withViewTransition(() => {
      order = reorderOrder(order, displayPos, displayPos - 1);
      schedulePersist();
    });
  }
  function onMoveDown(origIndex: number): void {
    const displayPos = committedDisplayIndex(origIndex);
    if (displayPos >= order.length - 1) return;
    withViewTransition(() => {
      order = reorderOrder(order, displayPos, displayPos + 1);
      schedulePersist();
    });
  }
  function onDragStart(e: DragEvent, origIndex: number): void {
    dragFromPosition = committedDisplayIndex(origIndex);
    e.dataTransfer?.setData("text/plain", String(origIndex));
    e.dataTransfer!.effectAllowed = "move";
  }
  function onDragEnd(): void {
    dragFromPosition = null;
    dragOverPosition = null;
  }
  function onDragOver(e: DragEvent, hoverOrigIndex: number): void {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    if (dragFromPosition === null) return;
    dragOverPosition = committedDisplayIndex(hoverOrigIndex);
  }
  /** Avoid flicker when crossing children: only clear when leaving the grid. */
  function onDragLeaveGrid(e: DragEvent): void {
    const rel = e.relatedTarget as Node | null;
    const cur = e.currentTarget as HTMLElement;
    if (rel && cur.contains(rel)) return;
    dragOverPosition = null;
  }
  function onDrop(e: DragEvent, dropOrigIndex: number): void {
    e.preventDefault();
    const from = dragFromPosition;
    dragOverPosition = null;
    const dropSlot = committedDisplayIndex(dropOrigIndex);
    if (from === null || from === dropSlot) {
      dragFromPosition = null;
      return;
    }
    withViewTransition(() => {
      order = reorderOrder(order, from, dropSlot);
      schedulePersist();
    });
    dragFromPosition = null;
  }
</script>

<section class="desk-charts" aria-label="Analytic charts for this domain">
  <div class="desk-charts-head">
    <div class="desk-charts-head-row">
      <h3 class="desk-charts-h">Analytic panels</h3>
      <div class="layout-toolbar" role="group" aria-label="Chart layout">
        <button
          type="button"
          class="tb-btn"
          onclick={() => applyBuiltInPreset("analyst")}
          title="Wide lead charts — analyst desk"
        >
          <span class="tb-btn-txt">Analyst</span>
        </button>
        <button
          type="button"
          class="tb-btn"
          onclick={() => applyBuiltInPreset("executive")}
          title="Compact single-column — executive skim"
        >
          <span class="tb-btn-txt">Executive</span>
        </button>
        <button type="button" class="tb-btn" onclick={saveNow} title="Save layout to this browser">
          <Save size={15} strokeWidth={2} aria-hidden="true" />
          <span class="tb-btn-txt">Save layout</span>
        </button>
        <button type="button" class="tb-btn" onclick={saveNamedFromCurrent} title="Save as named preset">
          <span class="tb-btn-txt">Save preset…</span>
        </button>
        <button type="button" class="tb-btn" onclick={resetDefault} title="Reset order and widths">
          <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
          <span class="tb-btn-txt">Reset layout</span>
        </button>
        {#each namedPresets as preset (preset.name)}
          <button
            type="button"
            class="tb-btn tb-btn-preset"
            title="Load preset saved {preset.savedAt}"
            onclick={() => loadNamed(preset.name)}
          >
            <span class="tb-btn-txt">{preset.name}</span>
          </button>
        {/each}
        {#if savedFlash}
          <span class="saved-toast" role="status">Saved</span>
        {/if}
      </div>
    </div>
    <p class="layout-hint">
      Drag the grip to reorder. Width cycles 1–3 columns (max three charts per row on wide
      screens). Layout is stored in this browser.
    </p>
    <ul class="desk-charts-notes">
      {#each pack.notes as line (line)}
        <li>{line}</li>
      {/each}
    </ul>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="desk-charts-grid"
    role="list"
    ondragover={(e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
    }}
    ondragleave={onDragLeaveGrid}
  >
    {#each orderedPanels as { origIndex, panel } (origIndex)}
      {@const cdi = order.indexOf(origIndex)}
      <article
        class="chart-card {spanClass(origIndex)}"
        class:drag-over={dragOverPosition === cdi && dragFromPosition !== null && dragFromPosition !== cdi}
        class:dragging={dragFromPosition === cdi}
        animate:flip={{ duration: flipDuration, easing: cubicOut }}
        ondragover={(e) => onDragOver(e, origIndex)}
        ondrop={(e) => onDrop(e, origIndex)}
        role="group"
        aria-labelledby="chart-h-{origIndex}"
      >
        <div class="chart-card-head">
          <h4 class="chart-card-h" id="chart-h-{origIndex}">{panel.title}</h4>
          <div class="chart-card-controls">
            <button
              type="button"
              class="cc-btn"
              onclick={() => onCycleSpan(origIndex)}
              title="Cycle width (grid columns)"
              aria-label="Cycle chart width, currently {spanVal(origIndex)} of 3 columns"
            >
              <span class="cc-span-label">{spanVal(origIndex)}×</span>
            </button>
            <button
              type="button"
              class="cc-btn"
              onclick={() => onMoveUp(origIndex)}
              disabled={cdi <= 0}
              title="Move up"
              aria-label="Move chart up"
            >
              <ChevronUp size={16} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              class="cc-btn"
              onclick={() => onMoveDown(origIndex)}
              disabled={cdi >= order.length - 1}
              title="Move down"
              aria-label="Move chart down"
            >
              <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              class="drag-handle"
              draggable="true"
              aria-grabbed={dragFromPosition === cdi}
              aria-label="Drag to reorder {panel.title}"
              ondragstart={(e) => onDragStart(e, origIndex)}
              ondragend={onDragEnd}
              onkeydown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  onMoveUp(origIndex);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  onMoveDown(origIndex);
                }
              }}
            >
              <GripVertical size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
        <FullscreenChartShell title={panel.title} option={panel.option} embedClass="desk-echart" />
      </article>
    {/each}
  </div>
</section>

<style>
  .desk-charts {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .desk-charts-head {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .desk-charts-head-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .desk-charts-h {
    margin: 0;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
  .layout-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .tb-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.65rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-2);
    background: var(--bg-2);
    color: var(--text-2);
    font-size: 0.7rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease;
  }
  .tb-btn:hover {
    background: var(--bg-3);
    color: var(--text-1);
    border-color: var(--border-strong);
  }
  .tb-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
    outline-offset: 2px;
  }
  .tb-btn-txt {
    line-height: 1;
  }
  @media (max-width: 520px) {
    .tb-btn-txt {
      display: none;
    }
    .tb-btn {
      padding: 0.4rem;
    }
  }
  .saved-toast {
    font-size: 0.68rem;
    color: var(--status-ok);
    font-weight: 600;
    animation: fs-nudge 0.35s ease;
  }
  @keyframes fs-nudge {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .layout-hint {
    margin: 0;
    font-size: 0.68rem;
    line-height: 1.45;
    color: var(--text-3);
    max-width: 52rem;
  }
  .desk-charts-notes {
    margin: 0;
    padding-left: 1rem;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--text-3);
  }
  /* Flex + ratio grow so incomplete rows share width (not a fixed ⅓-empty third). */
  .desk-charts-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: stretch;
    transition: gap 0.28s cubic-bezier(0.33, 1, 0.68, 1);
  }
  @media (prefers-reduced-motion: reduce) {
    .desk-charts-grid {
      transition: none;
    }
  }
  .chart-card {
    padding: var(--space-3);
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    min-width: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    transition:
      border-color 0.25s ease,
      box-shadow 0.25s ease,
      transform 0.2s ease,
      flex-basis 0.32s cubic-bezier(0.33, 1, 0.68, 1);
  }
  /* Target widths ≈ ⅓ / ⅔ / full row at 3-column; flex-grow splits leftover space on short rows. */
  .chart-card.span-1 {
    flex: 1 1 calc((100% - 2 * var(--space-3)) / 3);
    max-width: 100%;
  }
  .chart-card.span-2 {
    flex: 2 1 calc(2 * (100% - 2 * var(--space-3)) / 3);
    max-width: 100%;
  }
  .chart-card.span-3 {
    flex: 3 1 100%;
    min-width: 100%;
  }
  @media (max-width: 900px) {
    .chart-card.span-1 {
      flex: 1 1 calc((100% - 1 * var(--space-3)) / 2);
    }
    .chart-card.span-2,
    .chart-card.span-3 {
      flex: 2 1 100%;
      min-width: 100%;
    }
  }
  @media (max-width: 560px) {
    .chart-card.span-1,
    .chart-card.span-2,
    .chart-card.span-3 {
      flex: 1 1 100%;
      min-width: 100%;
    }
  }
  .chart-card.drag-over {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border-1));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .chart-card.dragging {
    opacity: 0.82;
  }
  .chart-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: 0.35rem;
  }
  .chart-card-h {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-2);
    flex: 1;
    min-width: 0;
    line-height: 1.3;
  }
  .chart-card-controls {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }
  .cc-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.75rem;
    height: 1.75rem;
    padding: 0 0.25rem;
    border: none;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text-3);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }
  .cc-btn:hover:not(:disabled) {
    background: var(--overlay);
    color: var(--text-1);
  }
  .cc-btn:disabled {
    opacity: 0.28;
    cursor: not-allowed;
  }
  .cc-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
    outline-offset: 1px;
  }
  .cc-span-label {
    font-size: 0.65rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }
  .drag-handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    margin: 0;
    border: none;
    cursor: grab;
    color: var(--text-3);
    border-radius: var(--radius-xs);
    background: transparent;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }
  .drag-handle:hover {
    background: color-mix(in srgb, var(--accent-violet-soft) 40%, transparent);
    color: var(--text-2);
  }
  .drag-handle:active {
    cursor: grabbing;
  }
  .drag-handle:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
    outline-offset: 1px;
  }
  .chart-card :global(.fs-shell) {
    flex: 1 1 auto;
    min-height: 0;
  }
  :global(.desk-echart) {
    --echarts-min-height: 180px;
    --echarts-height: 200px;
  }
  @media (prefers-reduced-motion: reduce) {
    .saved-toast {
      animation: none;
    }
    .chart-card {
      transition: border-color 0.15s ease;
    }
  }
</style>
