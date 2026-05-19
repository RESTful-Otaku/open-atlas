<!--
  3D Earth: Three.js + globe.gl — photoreal day/night, orbit/flight/ship paths,
  zoom-aware layers, causal arcs above the surface.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { GlobeInstance } from "globe.gl";

  import { cartoRasterTileUrl, mapThemeFor } from "../theme-map";
  import { onThemeChange, readThemeFromDocument } from "../theme-events";
  import type { ThemeId } from "../theme.svelte";
  import { debounce } from "../debounce-raf";
  import { isRouteTransitioning } from "../route-transition";
  import { releaseWebGlCanvases } from "../webgl-teardown";
  import { navigate } from "../router.svelte";
  import { dashboardData } from "../dashboard-revision.svelte";
  import { getGeoEventIndex } from "../geo-event-index";
  import { dashboard } from "../state.svelte";
  import { buildDemoWeatherPathsForGlobe, type GlobePathDatum } from "../map/map-weather-globe";
  import {
    GLOBE_STARS_BACKGROUND,
    loadDayNightGlobeMaterial,
    updateDayNightGlobeRotation,
    updateDayNightSun,
    type DayNightGlobeMaterial,
  } from "../map/globe-day-night";
  import {
    heatmapBandwidthForZoom,
    scaledArcStroke,
    scaledPointRadius,
    zoomScaleFromAltitude,
  } from "../map/globe-zoom-scale";
  import { buildAllTrackingPaths } from "../map/tracking-paths";
  import { globeLayerFingerprint } from "../map/globe-layer-fingerprint";
  import {
    buildGlobeArcs,
    buildGlobePoints,
    buildMoonMarkerPoint,
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
    showMoon: boolean;
    showCausal: boolean;
    /** Photoreal day/night shader with city lights (disables raster tiles). */
    showPhotorealEarth?: boolean;
    /** Orbit rings, flight trails, shipping lanes. */
    showTrackingPaths?: boolean;
    mapDomainSet: ReadonlySet<string>;
    simUtcMs: number;
    publicTracking: GlobeEventPoint[];
    trackingPathRows?: readonly import("../tracking/public-tracking").PublicTrackRow[];
    showWeatherOverlays?: boolean;
    onMapPointScreen?: (d: MapPointScreen | null) => void;
  }
  let {
    mode = "both",
    showTerminator = true,
    showSubsun = true,
    showMoon = true,
    showCausal = true,
    showPhotorealEarth = true,
    showTrackingPaths = true,
    mapDomainSet,
    simUtcMs,
    publicTracking = [],
    trackingPathRows = [],
    showWeatherOverlays = true,
    onMapPointScreen = undefined,
  }: Props = $props();

  let root: HTMLDivElement | undefined = $state();
  let ro: ResizeObserver | null = null;
  let globe: GlobeInstance | null = null;
  let lastHover: GlobeEventPoint | null = null;
  let globeReady = $state(false);
  let themeId = $state<ThemeId>(readThemeFromDocument());
  let dayNightMaterial: DayNightGlobeMaterial | null = $state(null);
  let cameraAltitude = $state(2.28);
  let photorealActive = $state(false);
  let lastLayerFingerprint = "";
  let offVisibility: (() => void) | undefined;

  function applyCartoTheme(g: GlobeInstance, theme: ThemeId): void {
    const spec = mapThemeFor(theme);
    g.globeTileEngineMaxLevel(6)
      .globeTileEngineUrl((x, y, level) =>
        cartoRasterTileUrl(theme, x, y, level),
      )
      .backgroundColor(spec.globeBackground)
      .atmosphereColor(spec.globeAtmosphereColor)
      .atmosphereAltitude(0.16);
  }

  function applyPhotorealGlobe(g: GlobeInstance): void {
    if (!dayNightMaterial) return;
    photorealActive = true;
    g.showGlobe(true)
      .globeTileEngineMaxLevel(0)
      .globeMaterial(dayNightMaterial)
      .backgroundImageUrl(GLOBE_STARS_BACKGROUND)
      .atmosphereColor("rgba(120, 180, 255, 0.42)")
      .atmosphereAltitude(0.2);
    updateDayNightSun(dayNightMaterial, simUtcMs);
    const pov = g.pointOfView();
    updateDayNightGlobeRotation(dayNightMaterial, pov.lng ?? 0, pov.lat ?? 0);
  }

  function applyGlobeTheme(g: GlobeInstance, theme: ThemeId): void {
    if (showPhotorealEarth && dayNightMaterial) {
      applyPhotorealGlobe(g);
      return;
    }
    photorealActive = false;
    applyCartoTheme(g, theme);
    g.backgroundImageUrl(null);
  }

  function updateLayers(): void {
    const g = globe;
    if (!g || document.hidden) return;

    const geo = getGeoEventIndex(dashboard.events);
    const fp = globeLayerFingerprint({
      revision: dashboardData.revision,
      simUtcMs,
      mode,
      mapDomains: [...mapDomainSet].sort().join(","),
      showCausal,
      showTerminator,
      showSubsun,
      showMoon,
      showWeather: showWeatherOverlays,
      showTrackingPaths,
      trackingCount: publicTracking.length,
      geoCount: geo.geoEvents.length,
      causalCount: dashboard.recentCausalEdges.length,
    });
    if (fp === lastLayerFingerprint) {
      if (photorealActive && dayNightMaterial) {
        updateDayNightSun(dayNightMaterial, simUtcMs);
      }
      return;
    }
    lastLayerFingerprint = fp;

    if (photorealActive && dayNightMaterial) {
      updateDayNightSun(dayNightMaterial, simUtcMs);
    }

    const z = zoomScaleFromAltitude(cameraAltitude);
    const events = geo.geoEvents;
    const wantPointsMode = mode === "points" || mode === "both";
    const wantHeat = mode === "heat" || mode === "both";

    let eventPts: GlobeEventPoint[] = wantPointsMode
      ? buildGlobePoints(events, mapDomainSet)
      : [];
    if (showSubsun) {
      const sun = buildSunMarkerPoint(simUtcMs);
      if (sun) eventPts = [...eventPts, sun];
    }
    if (showMoon) {
      const moon = buildMoonMarkerPoint(simUtcMs);
      if (moon) eventPts = [...eventPts, moon];
    }
    const tr = publicTracking.length ? publicTracking : [];
    const arcs = buildGlobeArcs(
      geo.events,
      dashboard.recentCausalEdges,
      mapDomainSet,
    );

    const heatData = wantHeat ? buildPerDomainHeatmaps(geo, mapDomainSet) : [];
    g.heatmapsData(heatData)
      .heatmapPoints((d) => (d as GlobeHeatmapDatum).points)
      .heatmapPointLat((p) => (p as [number, number, number])[0])
      .heatmapPointLng((p) => (p as [number, number, number])[1])
      .heatmapPointWeight((p) => (p as [number, number, number])[2] ?? 1)
      .heatmapColorFn(
        (d: object) => (t: number) =>
          heatColorForDomain((d as GlobeHeatmapDatum).color, t),
      )
      .heatmapBandwidth(heatmapBandwidthForZoom(cameraAltitude))
      .heatmapColorSaturation(2.1)
      .heatmapBaseAltitude(0.0048 * Math.min(1.4, z))
      .heatmapTopAltitude(0.0048 * Math.min(1.4, z))
      .heatmapsTransitionDuration(0);

    g.pointsData([...eventPts, ...tr])
      .pointLat("lat")
      .pointLng("lng")
      .pointColor("color")
      .pointAltitude((d) => (d as GlobeEventPoint).altitude ?? 0.006)
      .pointRadius((d) => {
        const p = d as GlobeEventPoint;
        const base = p.r * (p.kind === "sun" ? 1.35 : p.kind === "moon" ? 1.1 : 1);
        return scaledPointRadius(base, cameraAltitude);
      })
      .pointResolution(8)
      .pointLabel((d) => {
        const p = d as GlobeEventPoint;
        if (p.kind === "sun") return "Subsolar point";
        if (p.kind === "moon") return "Moon (approx.)";
        if (p.kind === "tracking" && p.trackLabel)
          return `${p.trackClass ?? "track"} · ${p.trackLabel}`;
        return `${p.domain} · ${p.id.slice(0, 12)}`;
      });

    g.arcsData(showCausal ? arcs : [])
      .arcColor(
        (a: object) =>
          [((a as GlobeArc).color), (a as GlobeArc).color] as [string, string],
      )
      .arcStroke((a: object) =>
        scaledArcStroke((a as GlobeArc).w * 0.5, cameraAltitude),
      )
      .arcAltitude((a: object) => (a as GlobeArc).altitude)
      .arcAltitudeAutoScale(0)
      .arcLabel((a: object) => (a as GlobeArc).id);

    const termCoords: [number, number, number][] = showTerminator
      ? buildTerminatorPath(simUtcMs)
      : [];
    const pathRows: GlobePathDatum[] = [];
    if (termCoords.length > 2) {
      pathRows.push({
        path: termCoords,
        color: mapThemeFor(themeId).terminatorStroke,
        stroke: 0.45 * Math.sqrt(z),
        dashLength: 1,
        dashGap: 0,
      });
    }
    if (showWeatherOverlays) {
      pathRows.push(...buildDemoWeatherPathsForGlobe());
    }
    if (showTrackingPaths) {
      pathRows.push(
        ...buildAllTrackingPaths(new Date(simUtcMs), trackingPathRows),
      );
    }

    g.pathsData(pathRows)
      .pathPoints((d) => (d as GlobePathDatum).path)
      .pathPointLat((p) => (p as [number, number, number])[0])
      .pathPointLng((p) => (p as [number, number, number])[1])
      .pathPointAlt((p) => (p as [number, number, number])[2] ?? 0.0025)
      .pathColor((d: object) => (d as GlobePathDatum).color)
      .pathStroke((d: object) => (d as GlobePathDatum).stroke * Math.sqrt(z))
      .pathDashLength((d) => (d as GlobePathDatum).dashLength ?? 1)
      .pathDashGap((d) => (d as GlobePathDatum).dashGap ?? 0)
      .pathDashInitialGap(0);
  }

  function onCameraChange(g: GlobeInstance): void {
    const pov = g.pointOfView();
    if (Number.isFinite(pov.altitude)) {
      cameraAltitude = pov.altitude;
    }
    if (photorealActive && dayNightMaterial) {
      updateDayNightGlobeRotation(
        dayNightMaterial,
        pov.lng ?? 0,
        pov.lat ?? 0,
      );
    }
    if (onMapPointScreen && lastHover) {
      const al = lastHover.altitude ?? 0.006;
      const xy = g.getScreenCoords(lastHover.lat, lastHover.lng, al);
      if (xy) {
        onMapPointScreen({ x: xy.x, y: xy.y, id: lastHover.id });
      }
    }
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
      loadSafetyTimer = window.setTimeout(failOpen, 14_000);

      try {
        if (showPhotorealEarth) {
          dayNightMaterial = await loadDayNightGlobeMaterial();
        }

        const { default: GConstructor } = await import("globe.gl");
        if (cancelled || !root) {
          if (loadSafetyTimer !== undefined) window.clearTimeout(loadSafetyTimer);
          return;
        }

        const g: GlobeInstance = new GConstructor(root, {
          animateIn: false,
          waitForGlobeReady: true,
          rendererConfig: {
            antialias: true,
            alpha: true,
            powerPreference: "default",
          },
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

        applyGlobeTheme(g, themeId);
        g.showGlobe(true)
          .globeTileEngineMaxLevel(showPhotorealEarth ? 0 : 6)
          .showAtmosphere(true)
          .atmosphereAltitude(showPhotorealEarth ? 0.2 : 0.16)
          .enablePointerInteraction(true);

        g.pointOfView({ lat: 12, lng: -25, altitude: 2.28 }, 0);
        cameraAltitude = 2.28;

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
          if (p.kind === "sun" || p.kind === "moon" || p.kind === "tracking") {
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

        g.onZoom(() => onCameraChange(g));
        g.controls().addEventListener("change", () => onCameraChange(g));

        const renderer = g.renderer();
        const scene = g.scene();
        const camera = g.camera();
        const renderFrame = (): void => {
          ctrls.update();
          renderer.render(scene, camera);
        };
        renderer.setAnimationLoop(renderFrame);
        const onVis = (): void => {
          if (document.hidden) {
            renderer.setAnimationLoop(null);
            ctrls.enabled = false;
          } else {
            renderer.setAnimationLoop(renderFrame);
            ctrls.enabled = true;
            lastLayerFingerprint = "";
            scheduleUpdateLayersThrottled();
          }
        };
        document.addEventListener("visibilitychange", onVis);
        offVisibility = () =>
          document.removeEventListener("visibilitychange", onVis);

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
    const offTheme = onThemeChange((t) => {
      themeId = t;
      if (globe) applyGlobeTheme(globe, t);
      scheduleUpdateLayers();
    });
    return () => {
      scheduleUpdateLayersThrottled.cancel();
      offTheme();
      offVisibility?.();
      offVisibility = undefined;
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
          const renderer = globe.renderer();
          renderer.setAnimationLoop(null);
          globe._destructor();
          renderer.dispose();
        } catch {
          /* */
        }
        globe = null;
      }
      releaseWebGlCanvases(root);
      dayNightMaterial = null;
      photorealActive = false;
    };
  });

  let _layerRaf: number = 0;
  function scheduleUpdateLayers(): void {
    if (!globe || isRouteTransitioning()) return;
    if (_layerRaf) cancelAnimationFrame(_layerRaf);
    _layerRaf = requestAnimationFrame(() => {
      _layerRaf = 0;
      updateLayers();
    });
  }

  /** Coalesce burst STDB updates; camera moves no longer rebuild all layers. */
  const scheduleUpdateLayersThrottled = debounce(scheduleUpdateLayers, 500);

  $effect(() => {
    void showPhotorealEarth;
    void dayNightMaterial;
    if (globe) applyGlobeTheme(globe, themeId);
  });

  $effect(() => {
    void dashboardData.revision;
    void mapDomainSet;
    void showTerminator;
    void showSubsun;
    void showMoon;
    void showCausal;
    void showPhotorealEarth;
    void showTrackingPaths;
    void mode;
    void publicTracking;
    void trackingPathRows;
    void showWeatherOverlays;
    void dayNightMaterial;
    if (!globe || document.hidden) return;
    scheduleUpdateLayersThrottled();
    return () => {
      scheduleUpdateLayersThrottled.cancel();
      if (_layerRaf) {
        cancelAnimationFrame(_layerRaf);
        _layerRaf = 0;
      }
    };
  });
</script>

<div class="oa-three-globe-wrap">
  <div
    bind:this={root}
    class="oa-three-globe"
    role="img"
    aria-label="Rotatable three-dimensional Earth globe with live data overlays"
  >
    <p class="oa-three-globe-attr" aria-hidden="true">
      Earth © NASA / three-globe ·
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
    max-width: min(14rem, 100%);
    font-size: 0.65rem;
    line-height: 1.2;
    color: var(--globe-attrib);
    pointer-events: auto;
  }
  .oa-three-globe-attr a {
    color: inherit;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--globe-attrib) 80%, transparent);
  }

  .oa-globe-load-overlay {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    place-items: center;
    background: radial-gradient(
      ellipse 85% 70% at 50% 45%,
      var(--globe-overlay-from) 0%,
      var(--globe-overlay-mid) 62%,
      var(--globe-overlay-to) 100%
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
