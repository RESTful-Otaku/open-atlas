<!--
  3D Earth: Three.js + globe.gl — full orbit (polar 0..π), zoom, pan.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { GlobeInstance } from "globe.gl";

  import { navigate } from "../router.svelte";
  import { dashboard } from "../state.svelte";
  import { buildDemoWeatherPathsForGlobe, type GlobePathDatum } from "../map/map-weather-globe";
  import {
    buildGlobeArcs,
    buildGlobePoints,
    buildPerDomainHeatmaps,
    buildSunMarkerPoint,
    buildTerminatorPath,
    heatColorForDomain,
    type GlobeArc,
    type GlobeEventPoint,
    type GlobeHeatmapDatum,
  } from "../map/three-globe-data";

  type Mode = "heat" | "points" | "both";

  export type MapPointScreen = { x: number; y: number; id: string };

  interface Props {
    mode: Mode;
    showTerminator: boolean;
    showSubsun: boolean;
    showCausal: boolean;
    mapDomainSet: ReadonlySet<string>;
    simUtcMs: number;
    /** NORAD / ADS-B / maritime (see `public/tracking/`) */
    publicTracking: GlobeEventPoint[];
    /**
     * Wind + pressure-style contours (static demo, aligned with 2D `SRC_DEMO` wind
     * and contour).
     */
    showWeatherOverlays?: boolean;
    /** Local px + event id for hover cards (excludes sun + public tracking). */
    onMapPointScreen?: (d: MapPointScreen | null) => void;
  }
  let {
    mode = "both",
    showTerminator = true,
    showSubsun = true,
    showCausal = true,
    mapDomainSet,
    simUtcMs,
    publicTracking = [],
    showWeatherOverlays = true,
    onMapPointScreen = undefined,
  }: Props = $props();

  let root: HTMLDivElement | undefined = $state();
  let ro: ResizeObserver | null = null;
  let globe: GlobeInstance | null = null;
  let lastHover: GlobeEventPoint | null = null;
  /** False until globe.gl reports the textured globe is ready (or fallback timeout). */
  let globeReady = $state(false);

  const BG = "#040a14";

  /** CARTO dark-matter *raster* (XYZ Web Mercator), aligned with 2D map lat/lon. */
  const CARTO_SUBS = "abcd" as const;
  function cartoDarkAllTileUrl(x: number, y: number, level: number): string {
    const s = CARTO_SUBS[(x + y + level) % CARTO_SUBS.length];
    return `https://${s}.basemaps.cartocdn.com/dark_all/${level}/${x}/${y}.png`;
  }

  function updateLayers(): void {
    const g = globe;
    if (!g) return;
    const events = dashboard.events;
    const wantPointsMode = mode === "points" || mode === "both";
    const wantHeat = mode === "heat" || mode === "both";

    let eventPts: GlobeEventPoint[] = wantPointsMode
      ? buildGlobePoints(events, mapDomainSet)
      : [];
    if (showSubsun) {
      const sun = buildSunMarkerPoint(simUtcMs);
      if (sun) eventPts = [...eventPts, sun];
    }
    const tr = publicTracking.length ? publicTracking : [];
    const arcs = buildGlobeArcs(events, dashboard.recentCausalEdges, mapDomainSet);

    const heatData = wantHeat
      ? buildPerDomainHeatmaps(events, mapDomainSet)
      : [];
    g.heatmapsData(heatData)
      .heatmapPoints((d) => (d as GlobeHeatmapDatum).points)
      .heatmapPointLat((p) => (p as [number, number, number])[0])
      .heatmapPointLng((p) => (p as [number, number, number])[1])
      .heatmapPointWeight((p) => (p as [number, number, number])[2] ?? 1)
      .heatmapColorFn(
        (d: object) => (t: number) =>
          heatColorForDomain((d as GlobeHeatmapDatum).color, t),
      )
      .heatmapBandwidth(5.4)
      .heatmapColorSaturation(2.1)
      .heatmapBaseAltitude(0.0048)
      .heatmapTopAltitude(0.0048)
      .heatmapsTransitionDuration(0);

    g.pointsData([...eventPts, ...tr])
      .pointLat("lat")
      .pointLng("lng")
      .pointColor("color")
      .pointAltitude((d) => (d as GlobeEventPoint).altitude ?? 0.006)
      .pointRadius((d) => {
        const p = d as GlobeEventPoint;
        return p.r * (p.kind === "sun" ? 1.4 : 1);
      })
      .pointResolution(14)
      .pointLabel((d) => {
        const p = d as GlobeEventPoint;
        if (p.kind === "sun") return "Subsolar point";
        if (p.kind === "tracking" && p.trackLabel)
          return `${p.trackClass ?? "track"} · ${p.trackLabel}`;
        return `${p.domain} · ${p.id.slice(0, 12)}`;
      });

    g.arcsData(showCausal ? arcs : [])
      .arcColor(
        (a: object) =>
          [((a as GlobeArc).color), (a as GlobeArc).color] as [string, string],
      )
      .arcStroke((a: object) => (a as GlobeArc).w * 0.5)
      .arcAltitude(0.1)
      .arcLabel((a: object) => (a as GlobeArc).id);

    const termCoords: [number, number, number][] = showTerminator
      ? buildTerminatorPath(simUtcMs)
      : [];
    const pathRows: GlobePathDatum[] = [];
    if (termCoords.length > 2) {
      pathRows.push({
        path: termCoords,
        color: "rgba(180, 210, 255, 0.5)",
        stroke: 0.45,
        dashLength: 1,
        dashGap: 0,
      });
    }
    if (showWeatherOverlays) {
      pathRows.push(...buildDemoWeatherPathsForGlobe());
    }
    g.pathsData(pathRows)
      .pathPoints((d) => (d as GlobePathDatum).path)
      .pathPointLat((p) => (p as [number, number, number])[0])
      .pathPointLng((p) => (p as [number, number, number])[1])
      .pathPointAlt((p) => (p as [number, number, number])[2] ?? 0.0025)
      .pathColor((d: object) => (d as GlobePathDatum).color)
      .pathStroke((d: object) => (d as GlobePathDatum).stroke)
      .pathDashLength((d) => (d as GlobePathDatum).dashLength ?? 1)
      .pathDashGap((d) => (d as GlobePathDatum).dashGap ?? 0)
      .pathDashInitialGap(0);
  }

  onMount(() => {
    let cancelled = false;
    let onLeaveHandler: (() => void) | undefined;
    let onWheelBlock: ((e: WheelEvent) => void) | undefined;
    let loadSafetyTimer: ReturnType<typeof setTimeout> | undefined;
    const run = async (): Promise<void> => {
      globeReady = false;
      await tick();
      if (cancelled || !root) return;

      const failOpen = (): void => {
        if (!cancelled) globeReady = true;
      };
      loadSafetyTimer = window.setTimeout(failOpen, 12_000);

      try {
        const { default: GConstructor } = await import("globe.gl");
        if (cancelled || !root) {
          if (loadSafetyTimer !== undefined) window.clearTimeout(loadSafetyTimer);
          return;
        }

        const g: GlobeInstance = new GConstructor(root, {
          animateIn: false,
          waitForGlobeReady: true,
          rendererConfig: { antialias: false, alpha: true, powerPreference: "high-performance" },
        });
        globe = g;

        const markReady = (): void => {
          if (cancelled) return;
          if (loadSafetyTimer !== undefined) {
            window.clearTimeout(loadSafetyTimer);
            loadSafetyTimer = undefined;
          }
          requestAnimationFrame(() => {
            if (!cancelled) globeReady = true;
          });
        };

        g.backgroundColor(BG)
          .showGlobe(true)
          .globeTileEngineUrl(cartoDarkAllTileUrl)
          .globeTileEngineMaxLevel(6)
          .showAtmosphere(true)
          .atmosphereColor("rgb(80, 130, 190)")
          .atmosphereAltitude(0.16)
          .enablePointerInteraction(true);

        g.pointOfView({ lat: 12, lng: -25, altitude: 2.28 }, 0);

        const ctrls = g.controls();
        ctrls.enableDamping = true;
        ctrls.dampingFactor = 0.07;
        ctrls.minPolarAngle = 0.001;
        ctrls.maxPolarAngle = Math.PI - 0.001;
        ctrls.autoRotate = false;
        ctrls.enablePan = true;
        ctrls.rotateSpeed = 0.65;
        ctrls.zoomSpeed = 0.7;

        ro = new ResizeObserver(() => {
          if (!root) return;
          const { width, height } = root.getBoundingClientRect();
          if (width > 0 && height > 0) g.width(width).height(height);
        });
        if (root) {
          const { width, height } = root.getBoundingClientRect();
          g.width(Math.max(2, width)).height(Math.max(2, height));
          ro.observe(root);
        }

        g.pathTransitionDuration(0);

        /**
         * OrbitControl wheel zoom is disabled unless Ctrl (or ⌘) is held — same idea as
         * MapLibre `cooperativeGestures`. Stopping delivery to the canvas avoids
         * `preventDefault` so the shell main column can scroll; when the modifier
         * is down, the canvas receives the wheel and zooms.
         */
        onWheelBlock = (e: WheelEvent) => {
          if (!e.ctrlKey && !e.metaKey) e.stopImmediatePropagation();
        };
        if (root) {
          root.addEventListener("wheel", onWheelBlock, { capture: true, passive: true });
        }

        g.onPointClick((pt: object | null) => {
          if (!pt) return;
          const p = pt as GlobeEventPoint;
          if (p.kind === "event" && p.id) {
            navigate(`/events/${encodeURIComponent(p.id)}`);
          }
        });
        g.onPointHover((pt: object | null) => {
          if (!onMapPointScreen) return;
          if (!pt) {
            lastHover = null;
            onMapPointScreen(null);
            return;
          }
          const p = pt as GlobeEventPoint;
          if (p.kind === "sun" || p.kind === "tracking") {
            lastHover = null;
            onMapPointScreen(null);
            return;
          }
          lastHover = p;
          const al = p.altitude ?? 0.006;
          const xy = g.getScreenCoords(p.lat, p.lng, al);
          if (xy) {
            onMapPointScreen({ x: xy.x, y: xy.y, id: p.id });
          } else {
            onMapPointScreen(null);
          }
        });

        g.controls().addEventListener("change", () => {
          if (!onMapPointScreen || !lastHover) return;
          const al = lastHover.altitude ?? 0.006;
          const xy = g.getScreenCoords(
            lastHover.lat,
            lastHover.lng,
            al,
          );
          if (xy) {
            onMapPointScreen({ x: xy.x, y: xy.y, id: lastHover.id });
          }
        });

        onLeaveHandler = (): void => {
          if (!onMapPointScreen) return;
          lastHover = null;
          onMapPointScreen(null);
        };
        if (onMapPointScreen && root) {
          root.addEventListener("mouseleave", onLeaveHandler);
        }

        updateLayers();

        const gAny = g as unknown as { onGlobeReady?: (cb: () => void) => GlobeInstance };
        if (typeof gAny.onGlobeReady === "function") {
          gAny.onGlobeReady(markReady);
        } else {
          markReady();
        }
      } catch {
        if (loadSafetyTimer !== undefined) window.clearTimeout(loadSafetyTimer);
        failOpen();
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (loadSafetyTimer !== undefined) window.clearTimeout(loadSafetyTimer);
      if (_layerRaf) {
        cancelAnimationFrame(_layerRaf);
        _layerRaf = 0;
      }
      if (onMapPointScreen) {
        lastHover = null;
        onMapPointScreen(null);
      }
      if (onLeaveHandler && root) {
        root.removeEventListener("mouseleave", onLeaveHandler);
      }
      if (onWheelBlock && root) {
        root.removeEventListener("wheel", onWheelBlock, { capture: true });
      }
      ro?.disconnect();
      ro = null;
      if (globe) {
        try {
          globe._destructor();
        } catch {
          /* */
        }
        globe = null;
      }
    };
  });

  /** Coalesce rapid state churn to one `updateLayers` per animation frame. */
  let _layerRaf: number = 0;
  function scheduleUpdateLayers(): void {
    if (!globe) return;
    if (_layerRaf) cancelAnimationFrame(_layerRaf);
    _layerRaf = requestAnimationFrame(() => {
      _layerRaf = 0;
      updateLayers();
    });
  }

  $effect(() => {
    void dashboard.events;
    void dashboard.recentCausalEdges;
    void mapDomainSet;
    void simUtcMs;
    void showTerminator;
    void showSubsun;
    void showCausal;
    void mode;
    void publicTracking;
    void showWeatherOverlays;
    scheduleUpdateLayers();
  });
</script>

<div class="oa-three-globe-wrap">
  <div
    bind:this={root}
    class="oa-three-globe"
    role="img"
    aria-label="Rotatable three-dimensional Earth globe with data overlays"
  >
    <p class="oa-three-globe-attr" aria-hidden="true">
      © CARTO ·
      <a
        href="https://www.openstreetmap.org/copyright"
        rel="noreferrer"
        target="_blank">OSM</a>
      ·
      <a href="https://celestrak.org" rel="noreferrer" target="_blank">CelesTrak</a> ·
      <a href="https://opensky-network.org" rel="noreferrer" target="_blank">OpenSky</a>
    </p>
  </div>

  <div
    class="oa-globe-load-overlay"
    class:oa-globe-load-overlay--gone={globeReady}
    aria-busy={!globeReady}
    aria-hidden={globeReady}
    aria-live="polite"
  >
    <div class="oa-globe-load-inner">
      <div class="oa-globe-spinner" aria-hidden="true"></div>
      <p class="oa-globe-load-label">Loading globe…</p>
    </div>
  </div>
</div>

<style>
  .oa-three-globe-wrap {
    position: absolute;
    inset: 0;
    z-index: 0;
    min-height: 200px;
    border-radius: inherit;
    overflow: hidden;
  }
  .oa-three-globe {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    border-radius: inherit;
  }
  .oa-three-globe :global(canvas) {
    display: block;
    outline: none;
  }
  .oa-three-globe-attr {
    position: absolute;
    left: 0.4rem;
    bottom: 0.25rem;
    margin: 0;
    z-index: 2;
    max-width: min(12rem, 100%);
    font-size: 0.65rem;
    line-height: 1.2;
    color: rgba(200, 210, 220, 0.55);
    pointer-events: auto;
  }
  .oa-three-globe-attr a {
    color: inherit;
    text-decoration: underline;
    text-decoration-color: rgba(200, 210, 220, 0.45);
  }

  .oa-globe-load-overlay {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    place-items: center;
    background: radial-gradient(
      ellipse 85% 70% at 50% 45%,
      rgba(6, 14, 28, 0.55) 0%,
      rgba(4, 10, 20, 0.92) 62%,
      rgba(2, 6, 14, 0.97) 100%
    );
    backdrop-filter: blur(2px);
    opacity: 1;
    pointer-events: auto;
    transition: opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .oa-globe-load-overlay--gone {
    opacity: 0;
    pointer-events: none;
  }
  .oa-globe-load-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: var(--space-5);
  }
  .oa-globe-spinner {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 3px solid color-mix(in srgb, var(--accent, #38bdf8) 22%, transparent);
    border-top-color: var(--accent, #38bdf8);
    animation: oa-globe-spin 0.72s linear infinite;
  }
  @keyframes oa-globe-spin {
    to {
      transform: rotate(360deg);
    }
  }
  .oa-globe-load-label {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--text-2, #d4d4d8);
  }
</style>
