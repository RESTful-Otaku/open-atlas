<script lang="ts">
  import { onMount } from "svelte";
  import { ChevronDown, ChevronUp, GripVertical } from "@lucide/svelte";

  import DomainFilter from "../components/DomainFilter.svelte";
  import KpiStrip from "../components/KpiStrip.svelte";
  import WorldMap from "../components/WorldMap.svelte";
  import DomainCards from "../components/DomainCards.svelte";
  import Insights from "../components/Insights.svelte";
  import EventStream from "../components/EventStream.svelte";
  import Anomalies from "../components/Anomalies.svelte";
  import SeverityHeatmap from "../components/SeverityHeatmap.svelte";
  import CausalGraph from "../components/CausalGraph.svelte";
  import LegacyVizStrip from "../components/LegacyVizStrip.svelte";
  import MountWhenVisible from "../components/MountWhenVisible.svelte";
  import LayoutEditBar from "../layout/LayoutEditBar.svelte";
  import { loadPanelLayout, savePanelLayout, clearPanelLayout } from "../layout/panel-layout-persist";
  import {
    mergePanelLayout,
    moveId,
    setSpan,
  } from "../layout/merge-panel-layout";
  import type { PanelLayoutState } from "../layout/panel-layout-types";

  const LAYOUT_KEY = "legacy-dashboard";

  const DEFAULT_ORDER: readonly string[] = [
    "kpi",
    "map",
    "viz-strip",
    "domain-cards",
    "insights",
    "heatmap",
    "causal",
    "events",
    "anomalies",
  ];

  const DEFAULT_SPANS: Readonly<Record<string, number>> = {
    kpi: 12,
    map: 12,
    "viz-strip": 12,
    "domain-cards": 8,
    insights: 4,
    heatmap: 6,
    causal: 6,
    events: 6,
    anomalies: 6,
  };

  let layout = $state<PanelLayoutState>(
    mergePanelLayout(null, DEFAULT_ORDER, DEFAULT_SPANS),
  );
  let layoutEdit = $state(false);
  let dragId = $state<string | null>(null);

  onMount(() => {
    layout = mergePanelLayout(
      loadPanelLayout(LAYOUT_KEY),
      DEFAULT_ORDER,
      DEFAULT_SPANS,
    );
  });

  function persist(): void {
    savePanelLayout(LAYOUT_KEY, layout);
  }

  function resetLayout(): void {
    clearPanelLayout(LAYOUT_KEY);
    layout = mergePanelLayout(null, DEFAULT_ORDER, DEFAULT_SPANS);
  }

  function bumpSpan(id: string, d: 1 | -1): void {
    const cur = layout.spans[id] ?? DEFAULT_SPANS[id] ?? 6;
    const next = setSpan(layout.spans, id, cur + d, 1, 12);
    layout = { order: layout.order, spans: next };
    persist();
  }

  function onSpanSelect(id: string, ev: Event): void {
    const t = ev.currentTarget as HTMLSelectElement;
    const n = parseInt(t.value, 10);
    if (!Number.isFinite(n)) return;
    layout = {
      order: layout.order,
      spans: setSpan(layout.spans, id, n, 1, 12),
    };
    persist();
  }

  function moveRow(id: string, dir: -1 | 1): void {
    layout = { order: moveId(layout.order, id, dir), spans: layout.spans };
    persist();
  }

  function onDragStart(e: DragEvent, id: string): void {
    dragId = id;
    e.dataTransfer?.setData("text/plain", id);
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer?.setDragImage(
        e.currentTarget.closest(".legacy-slot") ?? e.currentTarget,
        0,
        0,
      );
    }
  }

  function onDragOver(e: DragEvent): void {
    e.preventDefault();
  }

  function onDrop(e: DragEvent, targetId: string): void {
    e.preventDefault();
    const from = dragId ?? e.dataTransfer?.getData("text/plain");
    dragId = null;
    if (!from || from === targetId) return;
    const o = [...layout.order];
    const i = o.indexOf(from);
    const j = o.indexOf(targetId);
    if (i < 0 || j < 0) return;
    o.splice(i, 1);
    o.splice(j, 0, from);
    layout = { order: o, spans: layout.spans };
    persist();
  }
</script>

<div class="legacy-top">
  <div class="legacy-filter-row">
    <DomainFilter />
    <LayoutEditBar
      editMode={layoutEdit}
      onEditToggle={() => (layoutEdit = !layoutEdit)}
      onReset={resetLayout}
      label="Layout"
    />
  </div>
</div>

<main class="dashboard">
  {#each layout.order as id (id)}
    {@const s = layout.spans[id] ?? DEFAULT_SPANS[id] ?? 12}
    <!-- svelte-ignore a11y_no_static_element_interactions (drag target for custom layout) -->
    <div
      class="legacy-slot"
      class:legacy-slot--edit={layoutEdit}
      style:grid-column={`span ${s} / span ${s}`}
      ondragover={layoutEdit ? onDragOver : undefined}
      ondrop={layoutEdit
        ? (e) => {
            onDrop(e, id);
          }
        : undefined}
    >
      {#if layoutEdit}
        <div class="legacy-chrome" aria-hidden={false}>
          <!-- svelte-ignore a11y_no_static_element_interactions (drag handle) -->
          <span
            class="legacy-grip"
            title="Drag to reorder"
            draggable="true"
            ondragstart={(e) => onDragStart(e, id)}
            role="button"
            tabindex="0"
            onkeydown={() => {
              /* no-op: drag only */
            }}><GripVertical size={14} strokeWidth={1.75} /></span
          >
          <div class="legacy-meta">
            <span class="legacy-id">{id}</span>
            <div class="legacy-span-ctl">
              <button
                type="button"
                class="mini"
                title="Narrower"
                aria-label="Narrower"
                onclick={() => bumpSpan(id, -1)}>−</button
              >
              <select
                class="span-sel"
                value={s}
                aria-label="Column span (of 12)"
                onchange={(e) => onSpanSelect(id, e)}
              >
                {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as c (c)}
                  <option value={c}>{c} col</option>
                {/each}
              </select>
              <button
                type="button"
                class="mini"
                title="Wider"
                aria-label="Wider"
                onclick={() => bumpSpan(id, 1)}>+</button
              >
            </div>
          </div>
          <div class="legacy-moves">
            <button
              type="button"
              class="mini"
              title="Move up"
              aria-label="Move up in layout"
              onclick={() => moveRow(id, -1)}><ChevronUp size={14} strokeWidth={2} /></button
            >
            <button
              type="button"
              class="mini"
              title="Move down"
              aria-label="Move down in layout"
              onclick={() => moveRow(id, 1)}><ChevronDown size={14} strokeWidth={2} /></button
            >
          </div>
        </div>
      {/if}
      <div class="legacy-slot-in">
        {#if id === "kpi"}
          <MountWhenVisible minHeight="120px">
            <KpiStrip />
          </MountWhenVisible>
        {:else if id === "map"}
          <MountWhenVisible minHeight="420px">
            <WorldMap embedded={true} panelSpan={12} />
          </MountWhenVisible>
        {:else if id === "viz-strip"}
          <MountWhenVisible minHeight="280px">
            <LegacyVizStrip />
          </MountWhenVisible>
        {:else if id === "domain-cards"}
          <MountWhenVisible minHeight="200px">
            <DomainCards span={12} />
          </MountWhenVisible>
        {:else if id === "insights"}
          <MountWhenVisible minHeight="200px">
            <Insights span={12} />
          </MountWhenVisible>
        {:else if id === "heatmap"}
          <MountWhenVisible minHeight="420px">
            <SeverityHeatmap span={12} />
          </MountWhenVisible>
        {:else if id === "causal"}
          <MountWhenVisible minHeight="420px">
            <CausalGraph span={12} />
          </MountWhenVisible>
        {:else if id === "events"}
          <MountWhenVisible minHeight="280px">
            <EventStream span={12} />
          </MountWhenVisible>
        {:else if id === "anomalies"}
          <MountWhenVisible minHeight="200px">
            <Anomalies span={12} />
          </MountWhenVisible>
        {/if}
      </div>
    </div>
  {/each}
</main>

<style>
  .legacy-top {
    max-width: none;
  }
  .legacy-filter-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5) 0;
  }

  .dashboard {
    max-width: none;
    padding: var(--space-5) var(--space-6) var(--space-10);
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--space-4);
    list-style: none;
  }

  .legacy-slot {
    position: relative;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .legacy-slot--edit {
    padding-top: 2px;
  }
  .legacy-slot--edit::before {
    content: "";
    position: absolute;
    inset: -2px;
    border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--border-1));
    border-radius: var(--radius-lg);
    pointer-events: none;
  }
  .legacy-chrome {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 4px 6px 2px;
    flex-wrap: wrap;
    z-index: 1;
  }
  .legacy-grip {
    display: inline-grid;
    place-items: center;
    cursor: grab;
    color: var(--text-3);
    padding: 2px;
  }
  .legacy-grip:active {
    cursor: grabbing;
  }
  .legacy-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .legacy-id {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-3);
    font-family: var(--font-mono);
  }
  .legacy-span-ctl,
  .legacy-moves {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .legacy-moves {
    margin-left: auto;
  }
  .mini {
    display: inline-grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-2);
    cursor: pointer;
    padding: 0;
    font-size: 12px;
  }
  .mini:hover {
    background: var(--bg-3);
    color: var(--text-1);
  }
  .span-sel {
    font-size: 10px;
    font-family: var(--font-mono);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    color: var(--text-1);
    border-radius: var(--radius-sm);
    padding: 2px 4px;
    max-width: 5.4rem;
  }
  .legacy-slot-in {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  @media (max-width: 680px) {
    .dashboard {
      padding: var(--space-4) var(--space-3) var(--space-8);
      gap: var(--space-3);
    }
  }
</style>
