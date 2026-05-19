<!--
  MapLibre gallery: CARTO dark basemap, event heat, point circles, traffic
  LineStrings, and a synthetic LEO “orbit” track — for reviewing geo
  overlays without API keys. Satellite and streets were dropped to keep
  focus on a consistent dark, overlay-forward look.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";

  import { applyMapPresentation } from "../map/map-presentation";
  import { mapThemeFor } from "../theme-map";
  import { onThemeChange, readThemeFromDocument } from "../theme-events";
  import { demoFreightRoutes, demoLeoOrbitLine, demoPointFeatures } from "./showcase-datasets";

  type Mode = "heat" | "points" | "both";

  const SRC_POINTS = "viz-demo-points";
  const SRC_ROUTES = "viz-demo-routes";
  const SRC_ORBIT = "viz-orbit";
  const LAYER_HEAT = "viz-heat";
  const LAYER_PTS = "viz-pts";
  const LAYER_ROUTE = "viz-routes";
  const LAYER_ORBIT = "viz-orbit-line";

  let { class: className = "" }: { class?: string } = $props();

  let root: HTMLDivElement | undefined = $state();
  let map: MapLibreMap | null = $state(null);
  let loaded = $state(false);
  let mode = $state<Mode>("both");

  function addOverlays(m: MapLibreMap): void {
    for (const id of [LAYER_HEAT, LAYER_PTS, LAYER_ROUTE, LAYER_ORBIT]) {
      if (m.getLayer(id)) m.removeLayer(id);
    }
    for (const id of [SRC_POINTS, SRC_ROUTES, SRC_ORBIT]) {
      if (m.getSource(id)) m.removeSource(id);
    }

    const points = demoPointFeatures();
    m.addSource(SRC_POINTS, { type: "geojson", data: points });
    m.addLayer({
      id: LAYER_HEAT,
      type: "heatmap",
      source: SRC_POINTS,
      maxzoom: 14,
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "severity"], 0, 0.1, 1, 1.1],
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          0.55,
          4,
          0.9,
          10,
          1.4,
          14,
          1.8,
        ],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 18, 6, 38, 12, 64, 14, 78],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(34, 211, 238, 0)",
          0.15,
          "rgba(99, 102, 241, 0.4)",
          0.4,
          "rgba(167, 139, 250, 0.5)",
          0.7,
          "rgba(245, 158, 11, 0.7)",
          1,
          "rgba(239, 68, 68, 0.92)",
        ],
        "heatmap-opacity": 0.85,
      },
    });
    m.addLayer({
      id: LAYER_PTS,
      type: "circle",
      source: SRC_POINTS,
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": ["interpolate", ["linear"], ["get", "severity"], 0, 3, 1, 10],
        "circle-stroke-color": "rgba(9,9,11,0.9)",
        "circle-stroke-width": 1,
        "circle-opacity": 0.88,
      },
    });

    m.addSource(SRC_ROUTES, { type: "geojson", data: demoFreightRoutes() });
    m.addLayer({
      id: LAYER_ROUTE,
      type: "line",
      source: SRC_ROUTES,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["match", ["get", "mode"], "ocean", "#38bdf8", "road", "#a78bfa", "#f59e0b"],
        "line-width": 3,
        "line-opacity": 0.85,
      },
    });

    m.addSource(SRC_ORBIT, { type: "geojson", data: demoLeoOrbitLine() });
    m.addLayer({
      id: LAYER_ORBIT,
      type: "line",
      source: SRC_ORBIT,
      paint: {
        "line-color": "#f472b6",
        "line-width": 2,
        "line-dasharray": [2, 1],
        "line-opacity": 0.9,
      },
    });

    applyModeToMap(m, mode);
    const ex = m as maplibregl.Map & { setProjection?: (p: { type: string }) => void };
    try {
      ex.setProjection?.({ type: "globe" });
    } catch {
      /* */
    }
    applyMapPresentation(m, { projection: "globe" }, readThemeFromDocument());
    m.setMaxPitch(85);
    loaded = true;
  }

  function applyModeToMap(m: MapLibreMap, next: Mode): void {
    if (!m.getLayer(LAYER_HEAT) || !m.getLayer(LAYER_PTS)) return;
    const heatVisible = next === "heat" || next === "both";
    const pointVisible = next === "points" || next === "both";
    m.setLayoutProperty(LAYER_HEAT, "visibility", heatVisible ? "visible" : "none");
    m.setLayoutProperty(LAYER_PTS, "visibility", pointVisible ? "visible" : "none");
  }

  onMount(() => {
    let m: MapLibreMap | null = null;
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    let setupGen = 0;

    const teardownMap = (): void => {
      setupGen += 1;
      ro?.disconnect();
      ro = null;
      m?.remove();
      m = null;
      map = null;
      loaded = false;
    };

    const run = async (): Promise<void> => {
      const theme = readThemeFromDocument();
      const basemap = mapThemeFor(theme).basemapGlStyle;
      const gen = ++setupGen;
      await tick();
      if (cancelled || gen !== setupGen) return;
      if (!root) {
        await new Promise<void>((r) => {
          requestAnimationFrame(() => {
            r();
          });
        });
      }
      if (cancelled || gen !== setupGen || !root) return;

      m = new maplibregl.Map({
        container: root,
        style: basemap,
        center: [20, 24],
        zoom: 1.3,
        minZoom: 0.4,
        maxZoom: 12,
        attributionControl: { compact: true },
        /** Wheel zoom only with Ctrl (⌃) or, on macOS, ⌘ — so plain scroll can move the page. */
        cooperativeGestures: true,
        dragRotate: true,
        pitchWithRotate: true,
      });
      const inst = m;
      map = m;

      inst.addControl(
        new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
        "top-right",
      );
      ro = new ResizeObserver(() => {
        inst.resize();
      });
      ro.observe(root);

      inst.on("load", () => {
        addOverlays(inst);
        inst.setMaxPitch(85);
        requestAnimationFrame(() => {
          inst.resize();
        });
      });
      const onWin = (): void => {
        inst.resize();
      };
      window.addEventListener("resize", onWin);
      inst.once("remove", () => window.removeEventListener("resize", onWin));
    };

    void run();
    const offTheme = onThemeChange(() => {
      if (cancelled) return;
      teardownMap();
      void run();
    });

    return () => {
      cancelled = true;
      offTheme();
      teardownMap();
    };
  });

  $effect(() => {
    const m = map;
    if (!m || !loaded) return;
    applyModeToMap(m, mode);
  });
</script>

<section class="geo-viz {className}" aria-label="Map overlay showcase">
  <header class="geo-head">
    <div>
      <h3 class="geo-title">2D / globe · overlays</h3>
      <p class="geo-sub">Theme-aware basemap, heat + points + routes + a synthetic LEO track (demo data).</p>
    </div>
    <div class="geo-bar">
      <div class="seg" role="group" aria-label="Event overlay">
        <span class="seg-lbl">Cluster</span>
        <button type="button" class:is-on={mode === "heat"} onclick={() => (mode = "heat")}>Heat</button>
        <button type="button" class:is-on={mode === "points"} onclick={() => (mode = "points")}>Points</button>
        <button type="button" class:is-on={mode === "both"} onclick={() => (mode = "both")}>Both</button>
      </div>
    </div>
  </header>
  <div class="map-shell">
    <div bind:this={root} class="map-canvas"></div>
  </div>
</section>

<style>
  .geo-viz {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
    min-width: 0;
    width: 100%;
  }
  .geo-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .geo-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-1);
  }
  .geo-sub {
    margin: 4px 0 0;
    max-width: min(56ch, 100%);
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-3);
  }
  .geo-bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    padding: 3px 4px;
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
  }
  .seg-lbl {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-3);
    padding: 0 6px 0 4px;
  }
  .seg button {
    background: transparent;
    border: 0;
    border-radius: calc(var(--radius) - 3px);
    color: var(--text-2);
    font-size: 11px;
    font-weight: 500;
    padding: 5px 10px;
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease);
  }
  .seg button:hover {
    color: var(--text-1);
    background: var(--overlay);
  }
  .seg button.is-on {
    color: var(--text-1);
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-violet) 100%);
    box-shadow: inset 0 0 0 1px var(--border-2);
  }
  :global(html[data-theme="light"]) .seg button.is-on {
    color: #f8fafc;
  }
  .map-shell {
    position: relative;
    width: 100%;
    min-width: 0;
    /* Grow with the main content width; height follows aspect + viewport caps. */
    min-height: 16rem;
    aspect-ratio: 2 / 1;
    max-height: min(88vh, 1000px);
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border-1);
    background: var(--map-canvas-bg);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border-2) 50%, transparent);
  }
  @media (max-width: 640px) {
    .map-shell {
      aspect-ratio: 4 / 3;
    }
  }
  .map-canvas {
    position: absolute;
    inset: 0;
    z-index: 0;
  }
</style>
