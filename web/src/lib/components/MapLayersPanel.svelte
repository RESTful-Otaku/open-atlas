<script lang="ts">
  import {
    Clock,
    Globe as GlobeIcon,
    Layers,
    LayoutGrid,
    Link2,
    Moon,
    Plane,
    Sun,
    SunDim,
    Wind,
  } from "@lucide/svelte";

  import SolarTimeScrub from "./SolarTimeScrub.svelte";
  import { isCompactLayout } from "../mobile-layout";
  import type { SimMinOfDay } from "../map/solar-time-scrub";

  const SWIPE_DISMISS_PX = 80;

  interface Props {
    open: boolean;
    sheet?: boolean;
    onDismiss?: () => void;
    useWebGlGlobe: boolean;
    mapDomainsActiveLabel: string;
    simUtcLabel: string;
    minOfDay: SimMinOfDay;
    showTerminator: boolean;
    showSubsun: boolean;
    showMoon: boolean;
    showPhotorealEarth: boolean;
    showCausal: boolean;
    showWeatherOverlays: boolean;
    showDemoLayers: boolean;
    showPublicTracking: boolean;
    mapDomainSet: Set<string>;
    domainPickOrder: readonly { id: string; label: string; color: string }[];
    onDomainToggle: (id: string, on: boolean) => void;
    onSelectAllDomains: () => void;
    onClearDomains: () => void;
    onSnapSimToNow?: () => void;
  }

  let {
    open,
    sheet = false,
    onDismiss,
    useWebGlGlobe,
    mapDomainsActiveLabel,
    simUtcLabel,
    minOfDay = $bindable(0),
    showTerminator = $bindable(false),
    showSubsun = $bindable(false),
    showMoon = $bindable(false),
    showPhotorealEarth = $bindable(false),
    showCausal = $bindable(false),
    showWeatherOverlays = $bindable(false),
    showDemoLayers = $bindable(false),
    showPublicTracking = $bindable(false),
    mapDomainSet,
    domainPickOrder,
    onDomainToggle,
    onSelectAllDomains,
    onClearDomains,
    onSnapSimToNow,
  }: Props = $props();

  let swipeStartY = 0;
  let swipeDragging = false;

  function onSheetPointerDown(e: PointerEvent): void {
    if (sheet || !open || !isCompactLayout() || !onDismiss) return;
    swipeStartY = e.clientY;
    swipeDragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onSheetPointerUp(e: PointerEvent): void {
    if (!swipeDragging) return;
    swipeDragging = false;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    const dy = e.clientY - swipeStartY;
    if (dy >= SWIPE_DISMISS_PX) onDismiss?.();
  }

  function onSheetPointerCancel(e: PointerEvent): void {
    swipeDragging = false;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
  }
</script>

<div
  id="map-layers-panel"
  class="map-layers-panel"
  class:is-open={open || sheet}
  class:map-layers-panel--sheet={sheet}
  aria-hidden={!(open || sheet)}
>
  <div class="map-layers-panel-inner">
    <div
      class="map-layers-sheet-handle"
      aria-hidden="true"
      onpointerdown={onSheetPointerDown}
      onpointerup={onSheetPointerUp}
      onpointercancel={onSheetPointerCancel}
    ></div>
    <section class="map-layers-block" aria-labelledby="map-layers-domains-h">
      <header class="map-layers-block-head">
        <h3 id="map-layers-domains-h" class="map-layers-block-title">
          <LayoutGrid size={14} strokeWidth={1.75} aria-hidden="true" />
          Domains
        </h3>
        <span class="map-layers-block-meta map-ctl-mono">{mapDomainsActiveLabel}</span>
        <div class="map-mode map-mode-compact">
          <button type="button" onclick={onSelectAllDomains}>All</button>
          <button type="button" onclick={onClearDomains}>None</button>
        </div>
      </header>
      <div
        class="map-layers-pills map-layers-pills-domains"
        role="group"
        aria-label="Data domains on the map"
      >
        {#each domainPickOrder as d (d.id)}
          <label class="map-layers-pill" title="Toggle {d.label}">
            <input
              type="checkbox"
              checked={mapDomainSet.has(d.id)}
              onchange={(ev) => {
                const t = ev.currentTarget as HTMLInputElement;
                onDomainToggle(d.id, t.checked);
              }}
            />
            <span class="map-dom-swatch" style:background={d.color} aria-hidden="true"></span>
            <span class="map-layers-pill-txt">{d.label}</span>
          </label>
        {/each}
      </div>
    </section>

    <section class="map-layers-block" aria-labelledby="map-layers-overlays-h">
      <header class="map-layers-block-head">
        <h3 id="map-layers-overlays-h" class="map-layers-block-title">
          <Layers size={14} strokeWidth={1.75} aria-hidden="true" />
          Overlays
        </h3>
      </header>
      <div class="map-layers-pills" role="group" aria-label="Map overlays">
        <label class="map-layers-pill" title="Day/night boundary">
          <input type="checkbox" bind:checked={showTerminator} />
          <Sun size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>Term</span>
        </label>
        <label class="map-layers-pill" title="Subsolar point">
          <input type="checkbox" bind:checked={showSubsun} />
          <SunDim size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>Subsol</span>
        </label>
        {#if useWebGlGlobe}
          <label class="map-layers-pill" title="Approximate moon position">
            <input type="checkbox" bind:checked={showMoon} />
            <Moon size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Moon</span>
          </label>
          <label
            class="map-layers-pill"
            title="NASA day/night imagery + city lights (off = same CARTO style as 2D map)"
          >
            <input type="checkbox" bind:checked={showPhotorealEarth} />
            <GlobeIcon size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>NASA Earth (colour)</span>
          </label>
        {/if}
        <label class="map-layers-pill" title="Causal edges when both events have place">
          <input type="checkbox" bind:checked={showCausal} />
          <Link2 size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>Causal</span>
        </label>
        <label class="map-layers-pill" title="Wind/isobars + stylized cloud shell on the 3D globe">
          <input type="checkbox" bind:checked={showWeatherOverlays} />
          <Wind size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>Weather</span>
        </label>
        <label class="map-layers-pill" title="Sample transport / hub glyphs">
          <input type="checkbox" bind:checked={showDemoLayers} />
          <Layers size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>Demo</span>
        </label>
        <label
          class="map-layers-pill"
          title="Celestrak TLEs, OpenSky ADS-B, sample vessels — public & rate-limited"
        >
          <input type="checkbox" bind:checked={showPublicTracking} />
          <Plane size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>Traffic</span>
        </label>
      </div>
    </section>

    <section class="map-layers-block map-layers-block-time" aria-labelledby="map-layers-time-h">
      <header class="map-layers-block-head">
        <h3 id="map-layers-time-h" class="map-layers-block-title">
          <Clock size={14} strokeWidth={1.75} aria-hidden="true" />
          Solar time
        </h3>
        <span class="map-layers-block-meta map-ctl-mono">{simUtcLabel} UTC</span>
      </header>
      <SolarTimeScrub bind:minOfDay utcLabel={simUtcLabel} onNow={onSnapSimToNow} />
    </section>
  </div>
</div>

<style>
  .map-layers-panel {
    display: grid;
    grid-template-rows: 0fr;
    width: 100%;
    overflow: hidden;
    opacity: 0;
    transition:
      grid-template-rows 0.32s cubic-bezier(0.33, 1, 0.68, 1),
      opacity 0.22s ease;
  }
  .map-layers-panel.is-open {
    grid-template-rows: auto;
    opacity: 1;
    max-height: min(calc(100% - 2.75rem), calc(100cqb - 2.75rem));
    position: relative;
    z-index: 15;
    pointer-events: auto;
  }
  .map-layers-panel--sheet {
    display: block;
    grid-template-rows: none;
    opacity: 1;
    max-height: none;
    overflow: visible;
  }
  .map-layers-panel--sheet .map-layers-panel-inner {
    border: 0;
    box-shadow: none;
    background: transparent;
    padding: 0;
  }
  .map-layers-sheet-handle {
    display: none;
  }
  .map-layers-panel-inner {
    pointer-events: auto;
    overflow: visible;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 3px;
    background: var(--glass-surface, var(--bg-glass));
    border: 1px solid var(--border-2);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow), var(--shadow-glow-soft, none);
    backdrop-filter: blur(14px);
  }
  .map-layers-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border-bottom: 1px solid var(--border-1);
  }
  .map-layers-block:last-child {
    border-bottom: none;
  }
  .map-layers-block-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
  }
  .map-layers-block-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-3);
  }
  .map-layers-block-meta {
    font-size: 10px;
    color: var(--text-3);
  }
  .map-layers-block-head .map-mode-compact {
    margin-left: auto;
  }
  .map-layers-block-time :global(.solar-scrub) {
    width: 100%;
    min-width: 0;
  }
  .map-mode-compact {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: calc(var(--radius) - 2px);
  }
  .map-mode-compact button {
    padding: 3px 8px;
    font-size: 10px;
    background: transparent;
    border: 0;
    border-radius: calc(var(--radius) - 4px);
    color: var(--text-2);
    cursor: pointer;
  }
  .map-mode-compact button:hover {
    color: var(--text-1);
    background: var(--overlay);
  }
  .map-layers-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 3px;
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: calc(var(--radius) - 2px);
  }
  .map-layers-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: 0;
    border-radius: calc(var(--radius) - 4px);
    background: transparent;
    color: var(--text-2);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    user-select: none;
    transition:
      background var(--motion-fast) var(--ease),
      color var(--motion-fast) var(--ease);
  }
  .map-layers-pill:hover {
    color: var(--text-1);
    background: var(--overlay);
  }
  .map-layers-pill:has(input:checked) {
    background: color-mix(in srgb, var(--accent) 14%, var(--bg-2));
    color: var(--text-1);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .map-layers-pill input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
  .map-layers-pill-txt {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 9rem;
  }
  .map-dom-swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
    box-shadow: 0 0 0 1px var(--map-swatch-ring);
  }
  .map-ctl-mono {
    font-family: var(--font-mono);
  }
  :global(html[data-mobile-layout]) .map-layers-sheet-handle {
    display: block;
    flex-shrink: 0;
    width: 2.5rem;
    height: 4px;
    margin: 10px auto 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-3) 55%, transparent);
    touch-action: none;
    cursor: grab;
  }
  :global(html[data-mobile-layout]) .map-mode-compact button {
    min-height: var(--mobile-tap-min, 44px);
    min-width: var(--mobile-tap-min, 44px);
    padding: 8px 12px;
  }
  @media (prefers-reduced-motion: reduce) {
    .map-layers-panel {
      transition: none;
    }
  }
</style>
