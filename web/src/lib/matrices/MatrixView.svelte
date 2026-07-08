<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { ChevronDown, ChevronUp, Download, ExternalLink, GripVertical } from "@lucide/svelte";

  import { LiveFeedPill } from "../primitives";
  import { domainColor, domainLabel } from "../colors";
  import { isCompactLayout, subscribeMobileLayout } from "../mobile-layout";
  import { dashboard } from "../state.svelte";
  import { navigate } from "../router.svelte";
  import LayoutEditBar from "../layout/LayoutEditBar.svelte";
  import { loadPanelLayout, savePanelLayout, clearPanelLayout } from "../layout/panel-layout-persist";
  import { mergePanelLayout, moveId, reorderBetween, setSpan } from "../layout/merge-panel-layout";
  import type { PanelLayoutState } from "../layout/panel-layout-types";

  import type { MatrixCatalogEntry, MatrixHeaderAction, MatrixPanel } from "./types";

  interface Props {
    matrix: MatrixCatalogEntry;
  }

  const { matrix }: Props = $props();

  let compactLayout = $state(isCompactLayout());

  onMount(() =>
    subscribeMobileLayout(() => {
      compactLayout = isCompactLayout();
    }),
  );

  const accentColor = $derived(domainColor(matrix.accentDomain));
  const domainDeskPath = $derived(`/domain/${matrix.accentDomain}`);

  // When the matrix defines `tabs`, `activeTab` selects which `tabId` each
  // panel is shown under (see `visiblePanels` below). `activeTab` resets
  // when the matrix id changes to an invalid id.
  let activeTab = $state<string | null>(null);
  const effectiveTab = $derived.by(() => {
    const tabs = matrix.tabs ?? [];
    if (tabs.length === 0) return null;
    if (activeTab && tabs.some((t) => t.id === activeTab)) return activeTab;
    return tabs[0].id;
  });

  let actionFeedback = $state<string | null>(null);
  let actionTimer: ReturnType<typeof setTimeout> | null = null;

  function flashFeedback(msg: string): void {
    actionFeedback = msg;
    if (actionTimer) clearTimeout(actionTimer);
    actionTimer = setTimeout(() => {
      actionFeedback = null;
      actionTimer = null;
    }, 6000);
  }

  function handleHeaderAction(action: MatrixHeaderAction): void {
    const c = action.command;
    if (c === "triage") {
      activeTab = "incidents";
      flashFeedback(
        "Switched to Incidents: flashpoints and highest-severity events in this matrix’s scope.",
      );
      return;
    }
    if (c && c.startsWith("/")) {
      navigate(c);
      return;
    }
    flashFeedback(`${action.label} — no client action (command: ${c ?? "none"})`);
  }

  function exportJson(): void {
    const payload = {
      exportedAt: new Date().toISOString(),
      matrix: {
        id: matrix.id,
        title: matrix.title,
        subtitle: matrix.subtitle,
        activeTab: effectiveTab,
      },
      connection: dashboard.connection,
      events: dashboard.events,
      worldState: dashboard.domainState,
      signals: dashboard.recentSignals,
      domainInsights: dashboard.domainInsights,
      recentCausalEdges: dashboard.recentCausalEdges,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openatlas-matrix-${matrix.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flashFeedback("Downloaded JSON snapshot of the current client projection.");
  }

  /** When tabs exist, each panel may declare `tabId`; otherwise all panels show. */
  const visiblePanels = $derived.by(() => {
    const tabs = matrix.tabs ?? [];
    const tab = effectiveTab;
    if (tabs.length === 0 || tab === null) return matrix.panels;
    return matrix.panels.filter(
      (p) => p.tabId === undefined || p.tabId === tab,
    );
  });

  const layoutStorageKey = $derived(
    `matrix-${matrix.id}-t-${String(effectiveTab ?? "all")}`,
  );

  let lastLoadedKey = $state<string | null>(null);
  let panelLayout = $state<PanelLayoutState>({ order: [], spans: {} });
  let layoutEdit = $state(false);
  let dragId = $state<string | null>(null);
  /** Drop target while dragging — drives live reorder preview (committed order updates on drop). */
  let dragOverId = $state<string | null>(null);
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
    const k = layoutStorageKey;
    const v = visiblePanels;
    if (k === lastLoadedKey) return;
    lastLoadedKey = k;
    const defOrder = v.map((p) => p.id);
    const defSpans: Record<string, number> = Object.fromEntries(
      v.map((p) => [p.id, p.span] as [string, number]),
    );
    panelLayout = mergePanelLayout(loadPanelLayout(k), defOrder, defSpans);
  });

  const matrixPreviewOrder = $derived.by(() => {
    if (!layoutEdit || !dragId || !dragOverId || dragId === dragOverId) {
      return panelLayout.order;
    }
    return reorderBetween(panelLayout.order, dragId, dragOverId);
  });

  const sortedMatrixPanels = $derived.by((): readonly MatrixPanel[] => {
    const vis = visiblePanels;
    const want = matrixPreviewOrder.filter((id) => vis.some((p) => p.id === id));
    const inOrder: MatrixPanel[] = want
      .map((id) => vis.find((p) => p.id === id))
      .filter((p): p is MatrixPanel => p !== undefined);
    const rest = vis.filter((p) => !want.includes(p.id));
    return [...inOrder, ...rest];
  });

  const matrixFlipDuration = $derived(reduceMotion ? 0 : 280);

  function persistMatrixLayout(): void {
    savePanelLayout(layoutStorageKey, panelLayout);
  }

  function resetMatrixLayout(): void {
    clearPanelLayout(layoutStorageKey);
    const v = visiblePanels;
    const defOrder = v.map((p) => p.id);
    const defSpans = Object.fromEntries(v.map((p) => [p.id, p.span])) as Record<
      string,
      number
    >;
    panelLayout = mergePanelLayout(null, defOrder, defSpans);
    lastLoadedKey = layoutStorageKey;
  }

  function bumpMSpan(id: string, d: 1 | -1): void {
    const cur = (panelLayout.spans[id] ?? vSpan(id)) as number;
    const next = setSpan(panelLayout.spans, id, cur + d, 1, 3);
    panelLayout = { order: panelLayout.order, spans: next };
    persistMatrixLayout();
  }
  function vSpan(id: string): number {
    const p = visiblePanels.find((x) => x.id === id);
    return p?.span ?? 1;
  }
  function onMSpanSelect(id: string, ev: Event): void {
    const t = ev.currentTarget as HTMLSelectElement;
    const n = parseInt(t.value, 10) as 1 | 2 | 3;
    if (n !== 1 && n !== 2 && n !== 3) return;
    panelLayout = {
      order: panelLayout.order,
      spans: setSpan(panelLayout.spans, id, n, 1, 3),
    };
    persistMatrixLayout();
  }
  function moveMRow(id: string, dir: -1 | 1): void {
    panelLayout = { order: moveId(panelLayout.order, id, dir), spans: panelLayout.spans };
    persistMatrixLayout();
  }
  function onMDragStart(e: DragEvent, id: string): void {
    dragId = id;
    e.dataTransfer?.setData("text/plain", id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }
  function onMDragEnd(): void {
    dragId = null;
    dragOverId = null;
  }
  function onMDragOverPanel(e: DragEvent, targetId: string): void {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    if (layoutEdit && dragId) {
      dragOverId = targetId;
    }
  }
  function onMDragLeaveGrid(e: DragEvent): void {
    const rel = e.relatedTarget as Node | null;
    const cur = e.currentTarget as HTMLElement;
    if (rel && cur.contains(rel)) return;
    dragOverId = null;
  }
  function onMDrop(e: DragEvent, targetId: string): void {
    e.preventDefault();
    const from = dragId ?? e.dataTransfer?.getData("text/plain");
    dragOverId = null;
    dragId = null;
    if (!from || from === targetId) return;
    const next = reorderBetween(panelLayout.order, from, targetId);
    panelLayout = { order: next, spans: panelLayout.spans };
    persistMatrixLayout();
  }

  onDestroy(() => {
    if (actionTimer) clearTimeout(actionTimer);
  });
</script>

<section class="matrix" style="--matrix-accent: {accentColor}">
  <header class="matrix-header">
    <div class="matrix-title-block">
      <div class="matrix-kicker">
        <matrix.icon size={14} strokeWidth={2} />
        <span>{matrix.subtitle.toUpperCase()}</span>
      </div>
      <h1 class="matrix-title">{matrix.title}</h1>
    </div>

    <div class="matrix-header-actions">
      <a
        class="matrix-btn matrix-btn-link"
        href="#{domainDeskPath}"
        title="Open {domainLabel(matrix.accentDomain)} domain desk with charts and map"
        onclick={(e) => {
          e.preventDefault();
          navigate(domainDeskPath);
        }}
      >
        <ExternalLink size={13} strokeWidth={1.75} />
        <span>{domainLabel(matrix.accentDomain)} desk</span>
      </a>
      <LiveFeedPill />
      {#if matrix.headerActions}
        {#each matrix.headerActions as action (action.label + (action.command ?? ""))}
          <button
            type="button"
            class="matrix-btn"
            data-variant={action.variant ?? "default"}
            data-command={action.command}
            onclick={() => handleHeaderAction(action)}
          >
            {#if action.icon}
              {@const ActionIcon = action.icon}
              <ActionIcon size={13} strokeWidth={1.75} />
            {/if}
            <span>{action.label}</span>
          </button>
        {/each}
      {/if}
      <button
        type="button"
        class="matrix-btn"
        title="Download JSON snapshot of this view’s data from the client"
        onclick={exportJson}
      >
        <Download size={13} strokeWidth={1.75} />
        <span>Export</span>
      </button>
      <LayoutEditBar
        editMode={layoutEdit}
        onEditToggle={() => (layoutEdit = !layoutEdit)}
        onReset={resetMatrixLayout}
        label="Panels"
      />
    </div>
  </header>
  {#if actionFeedback}
    <p class="matrix-toast" role="status">{actionFeedback}</p>
  {/if}

  {#if matrix.tabs && matrix.tabs.length > 0}
    <nav class="matrix-tabs" aria-label={`${matrix.title} tabs`}>
      <div class="matrix-tablist" role="tablist">
        {#each matrix.tabs as tab (tab.id)}
          <button
            type="button"
            role="tab"
            class="matrix-tab"
            class:is-active={effectiveTab === tab.id}
            aria-selected={effectiveTab === tab.id}
            onclick={() => (activeTab = tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </div>
    </nav>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="matrix-grid"
    ondragover={(e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    }}
    ondragleave={layoutEdit ? onMDragLeaveGrid : undefined}
  >
    {#each sortedMatrixPanels as panel (panel.id)}
      {@const spanM = (panelLayout.spans[panel.id] ?? panel.span) as 1 | 2 | 3}
      <!-- svelte-ignore a11y_no_static_element_interactions (drop target) -->
      <section
        class="matrix-panel"
        class:matrix-panel--edit={layoutEdit}
        class:matrix-panel--drag-over={layoutEdit &&
          dragId !== null &&
          dragOverId === panel.id &&
          dragId !== panel.id}
        class:matrix-panel--dragging={layoutEdit && dragId === panel.id}
        data-span={String(spanM)}
        animate:flip={{ duration: matrixFlipDuration, easing: cubicOut }}
        ondragover={layoutEdit
          ? (e) => {
              onMDragOverPanel(e, panel.id);
            }
          : undefined}
        ondrop={layoutEdit
          ? (e) => {
              onMDrop(e, panel.id);
            }
          : undefined}
      >
        {#if layoutEdit}
          <div class="m-lay-chrome" aria-label="Layout controls">
            <!-- svelte-ignore a11y_no_static_element_interactions (drag handle) -->
            <span
              class="m-lay-grip"
              title="Drag to reorder"
              role="button"
              tabindex="0"
              draggable="true"
              ondragstart={(e) => onMDragStart(e, panel.id)}
              ondragend={onMDragEnd}><GripVertical
                size={14}
                strokeWidth={1.75}
              /></span
            >
            <div class="m-lay-meta">
              <span class="m-lay-id">{panel.id}</span>
              <div class="m-lay-ctl">
                <button
                  type="button"
                  class="m-mini"
                  title="Narrower"
                  aria-label="Narrower"
                  onclick={() => bumpMSpan(panel.id, -1)}>−</button
                >
                <select
                  class="m-span-sel"
                  value={String(spanM)}
                  aria-label="Panel width in matrix"
                  onchange={(e) => onMSpanSelect(panel.id, e)}
                >
                  <option value="1">S</option>
                  <option value="2">M</option>
                  <option value="3">L</option>
                </select>
                <button
                  type="button"
                  class="m-mini"
                  title="Wider"
                  aria-label="Wider"
                  onclick={() => bumpMSpan(panel.id, 1)}>+</button
                >
              </div>
            </div>
            <div class="m-lay-moves">
              <button
                type="button"
                class="m-mini"
                title="Move up"
                aria-label="Move up"
                onclick={() => moveMRow(panel.id, -1)}><ChevronUp
                  size={14}
                  strokeWidth={2}
                /></button
              >
              <button
                type="button"
                class="m-mini"
                title="Move down"
                aria-label="Move down"
                onclick={() => moveMRow(panel.id, 1)}><ChevronDown
                  size={14}
                  strokeWidth={2}
                /></button
              >
            </div>
          </div>
        {/if}
        <header class="matrix-panel-head">
          {#if panel.icon}
            {@const PanelIcon = panel.icon}
            <span class="matrix-panel-icon" aria-hidden="true">
              <PanelIcon size={12} strokeWidth={1.75} />
            </span>
          {/if}
          <h3>{panel.title}</h3>
        </header>
        <div class="matrix-panel-body">
          <panel.component {...panel.props ?? {}} />
        </div>
      </section>
    {/each}

    {#if compactLayout}
      <details class="matrix-ai-accordion">
        <summary>AI synthesis</summary>
        <section class="matrix-ai">
          <matrix.aiPanel.component {...matrix.aiPanel.props ?? {}} />
        </section>
      </details>
    {:else}
      <section class="matrix-ai">
        <matrix.aiPanel.component {...matrix.aiPanel.props ?? {}} />
      </section>
    {/if}
  </div>
</section>

<style>
  .matrix {
    --matrix-accent: var(--accent);
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    margin: 0;
    max-width: none;
    padding: var(--space-5);
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--space-4);
    min-height: 0;
  }

  .matrix-toast {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-2);
    padding: var(--space-2) var(--space-3);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
  }

  .matrix-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
    flex-wrap: wrap;
  }
  .matrix-kicker {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--matrix-accent);
    font-weight: 600;
  }
  .matrix-title {
    margin: var(--space-1) 0 0;
    font-size: 22px;
    font-weight: 600;
    color: var(--text-1);
    letter-spacing: -0.01em;
  }
  .matrix-header-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .matrix-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 500;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-1);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease),
      border-color var(--motion-fast) var(--ease);
  }
  .matrix-btn:hover {
    background: var(--bg-3);
    border-color: var(--border-2);
  }
  .matrix-btn[data-variant="danger"] {
    color: var(--sev-high);
    border-color: color-mix(in oklab, var(--sev-high) 35%, var(--border-1));
  }
  .matrix-btn-link {
    text-decoration: none;
    color: var(--matrix-accent);
    border-color: color-mix(in srgb, var(--matrix-accent) 40%, var(--border-1));
  }
  .matrix-btn-link:hover {
    background: color-mix(in srgb, var(--matrix-accent) 12%, var(--bg-2));
  }

  .matrix-btn[data-variant="primary"] {
    background: linear-gradient(
      135deg,
      var(--accent) 0%,
      var(--accent-violet) 100%
    );
    color: #0b0b0f;
    border-color: transparent;
    font-weight: 600;
  }

  .matrix-tabs {
    padding: 2px;
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    width: fit-content;
  }
  .matrix-tablist {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .matrix-tab {
    padding: 5px 10px;
    font-size: 11px;
    border: 0;
    background: transparent;
    border-radius: var(--radius-xs);
    color: var(--text-2);
    cursor: pointer;
  }
  .matrix-tab.is-active {
    background: var(--bg-3);
    color: var(--text-1);
    box-shadow: var(--shadow-sm);
  }

  .matrix-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: var(--space-4);
    align-items: start;
  }

  .m-lay-chrome {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 4px 6px 0 4px;
    border-bottom: 1px solid var(--border-1);
    flex-wrap: wrap;
  }
  .m-lay-grip {
    display: inline-grid;
    place-items: center;
    cursor: grab;
    color: var(--text-3);
  }
  .m-lay-grip:active {
    cursor: grabbing;
  }
  .m-lay-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .m-lay-id {
    font-size: 9px;
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
  }
  .m-lay-ctl,
  .m-lay-moves {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .m-lay-moves {
    margin-left: auto;
  }
  .m-mini {
    display: inline-grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-2);
    padding: 0;
    font-size: 12px;
    cursor: pointer;
  }
  .m-mini:hover {
    background: var(--bg-3);
    color: var(--text-1);
  }
  .m-span-sel {
    font-size: 10px;
    font-weight: 600;
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    color: var(--text-1);
    border-radius: var(--radius-sm);
    padding: 2px 4px;
  }
  .matrix-panel--edit {
    position: relative;
  }
  .matrix-panel--drag-over {
    z-index: 1;
    border-color: color-mix(in srgb, var(--matrix-accent) 55%, var(--border-1));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--matrix-accent) 35%, transparent);
  }
  .matrix-panel--dragging {
    opacity: 0.82;
  }
  .matrix-panel--edit::after {
    content: "";
    position: absolute;
    inset: -2px;
    border: 1px dashed color-mix(in srgb, var(--matrix-accent) 45%, var(--border-1));
    border-radius: var(--radius-lg);
    pointer-events: none;
  }

  .matrix-panel {
    grid-column: span 2;
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-lg);
    min-height: 180px;
    display: flex;
    flex-direction: column;
  }
  .matrix-panel[data-span="2"] {
    grid-column: span 4;
  }
  .matrix-panel[data-span="3"] {
    grid-column: span 6;
  }
  .matrix-panel-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-1);
  }
  .matrix-panel-icon {
    color: var(--matrix-accent);
  }
  .matrix-panel-head h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .matrix-panel-body {
    padding: var(--space-4);
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }

  .matrix-ai {
    grid-column: 5 / span 2;
    grid-row: 1 / span 3;
    position: sticky;
    top: var(--space-4);
  }

  @media (max-width: 1100px) {
    .matrix-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .matrix-panel {
      grid-column: span 2;
    }
    .matrix-panel[data-span="2"],
    .matrix-panel[data-span="3"] {
      grid-column: span 4;
    }
    .matrix-ai {
      grid-column: span 4;
      grid-row: auto;
      position: static;
    }
  }
  @media (max-width: 700px) {
    .matrix-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .matrix-panel,
    .matrix-panel[data-span="2"],
    .matrix-panel[data-span="3"] {
      grid-column: span 1;
    }
  }
</style>
