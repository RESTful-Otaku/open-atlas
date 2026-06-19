<!--
  3D Earth: globe.gl — CARTO-aligned “instrument” look by default,
  CARTO monochrome tiles; optional solar shell (shade + city lights) or NASA photoreal.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { GlobeInstance } from "globe.gl";
  import type { Group, Material } from "three";

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
    createStylizedCloudLayer,
    disposeStylizedCloudLayer,
    minimalGlobeBackdropDataUrl,
  } from "../map/globe-stylized-visuals";
  import {
    loadDayNightGlobeMaterial,
    updateDayNightGlobeRotation,
    updateDayNightSun,
    type DayNightGlobeMaterial,
  } from "../map/globe-day-night";
  import {
    applyMonochromeSolarTheme,
    createMonochromeSolarShell,
    disposeMonochromeSolarShell,
    loadMonochromeSolarOverlay,
    updateMonochromeSolarRotation,
    updateMonochromeSolarSun,
    type MonochromeSolarOverlay,
  } from "../map/globe-solar-overlay";
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
  import {
    climateWeatherPoints,
    eventsForMapDisplay,
  } from "../map/map-sim-time";
  import {
    buildTemperatureHeatmap,
    tempHeatColor,
  } from "../map/globe-weather-layers";
  import {
    adminLabel,
    loadAdminBoundaries,
    type AdminFeature,
  } from "../map/globe-admin-boundaries";

  type Mode = "heat" | "points" | "both";

  export type MapPointScreen = { x: number; y: number; id: string };

  interface Props {
    mode: Mode;
    showTerminator: boolean;
    showSubsun: boolean;
    showMoon: boolean;
    showCausal: boolean;
    /** NASA day/night textures (replaces CARTO tiles). */
    showPhotorealEarth?: boolean;
    /** Orbit rings, flight trails, shipping lanes. */
    showTrackingPaths?: boolean;
    mapDomainSet: ReadonlySet<string>;
    simUtcMs: number;
    publicTracking: GlobeEventPoint[];
    trackingPathRows?: readonly import("../tracking/public-tracking").PublicTrackRow[];
    showWeatherOverlays?: boolean;
    /** Terminator shade + city lights over CARTO tiles (off when photoreal is on). */
    showSolarShading?: boolean;
    onMapPointScreen?: (d: MapPointScreen | null) => void;
    /** Compact/mobile: tap event point → show inspector instead of navigating. */
    onEventPointTap?: (d: MapPointScreen) => void;
    /** Fired when the user taps the globe without hitting an event point (mobile dismiss). */
    onMapBackgroundTap?: () => void;
  }
  let {
    mode = "points",
    showSolarShading = true,
    showTerminator = false,
    showSubsun = false,
    showMoon = false,
    showCausal = false,
    showPhotorealEarth = false,
    showTrackingPaths = false,
    mapDomainSet,
    simUtcMs,
    publicTracking = [],
    trackingPathRows = [],
    showWeatherOverlays = false,
    onMapPointScreen = undefined,
    onEventPointTap = undefined,
    onMapBackgroundTap = undefined,
  }: Props = $props();

  let root: HTMLDivElement | undefined = $state();
  let ro: ResizeObserver | null = null;
  let globe: GlobeInstance | null = null;
  let lastHover: GlobeEventPoint | null = null;
  let globeReady = $state(false);
  let themeId = $state<ThemeId>(readThemeFromDocument());
  let dayNightMaterial: DayNightGlobeMaterial | null = $state(null);
  let solarOverlay: MonochromeSolarOverlay | null = $state(null);
  /** Default globe.gl material — restored when leaving photoreal shader. */
  let cartoGlobeMaterial: Material | null = null;
  let solarShellRoot: Group | null = null;
  let lastSolarShellSig = "";
  /** Latest scrub instant — read from the render loop so solar uniforms never miss a frame. */
  let solarSimUtcMs = 0;
  let cameraAltitude = $state(2.28);
  let lastLayerFingerprint = "";
  let offVisibility: (() => void) | undefined;
  /** Stylized cloud shell — rotates slowly when weather overlays are on. */
  let cloudStylizedRoot: Group | null = null;
  let lastCloudSyncSig = "";
  let adminFeatures = $state<AdminFeature[]>([]);
  let hoverAdmin: AdminFeature | null = $state(null);

  function syncStylizedCloudLayer(g: GlobeInstance): void {
    const sig = `${themeId}:${showWeatherOverlays}`;
    if (sig === lastCloudSyncSig) return;

    lastCloudSyncSig = sig;

    if (cloudStylizedRoot) {
      try {
        g.scene().remove(cloudStylizedRoot);
      } catch {
        /* */
      }
      disposeStylizedCloudLayer(cloudStylizedRoot);
      cloudStylizedRoot = null;
    }

    if (!showWeatherOverlays) return;

    try {
      const { group } = createStylizedCloudLayer(g.getGlobeRadius(), themeId);
      cloudStylizedRoot = group;
      g.scene().add(group);
    } catch {
      /* */
    }
  }

  function applyCartoTheme(g: GlobeInstance, theme: ThemeId): void {
    const spec = mapThemeFor(theme);
    g.globeTileEngineMaxLevel(6)
      .globeTileEngineUrl((x, y, level) =>
        cartoRasterTileUrl(theme, x, y, level),
      )
      .backgroundColor(spec.globeBackground)
      .atmosphereColor(spec.globeAtmosphereColor)
      .atmosphereAltitude(spec.globeAtmosphereAltitude);
  }

  function removeSolarShell(g: GlobeInstance): void {
    if (!solarShellRoot) return;
    try {
      g.scene().remove(solarShellRoot);
    } catch {
      /* */
    }
    disposeMonochromeSolarShell(solarShellRoot);
    solarShellRoot = null;
    lastSolarShellSig = "";
  }

  function usePhotorealShader(): boolean {
    return Boolean(showPhotorealEarth && dayNightMaterial);
  }

  function wantMonochromeSolarShell(): boolean {
    return Boolean(showSolarShading && !showPhotorealEarth && solarOverlay);
  }

  function syncMonochromeSolarShell(g: GlobeInstance): void {
    const want = wantMonochromeSolarShell();
    const sig = `${themeId}:${want}`;
    if (sig !== lastSolarShellSig || (want && !solarShellRoot)) {
      lastSolarShellSig = sig;
      removeSolarShell(g);
      if (want && solarOverlay) {
        try {
          const { group } = createMonochromeSolarShell(
            g.getGlobeRadius(),
            solarOverlay,
            themeId,
          );
          solarShellRoot = group;
          g.scene().add(group);
        } catch {
          /* */
        }
      }
    }
    if (want && solarOverlay && solarShellRoot) {
      applyMonochromeSolarTheme(solarOverlay, themeId);
      refreshMonochromeSolarUniforms(g);
    }
  }

  function refreshMonochromeSolarUniforms(g: GlobeInstance): void {
    if (!solarOverlay) return;
    updateMonochromeSolarSun(solarOverlay, solarSimUtcMs);
    const pov = g.pointOfView();
    updateMonochromeSolarRotation(solarOverlay, pov.lng ?? 0, pov.lat ?? 0);
  }

  function applyPhotorealGlobe(g: GlobeInstance): void {
    if (!dayNightMaterial) return;
    removeSolarShell(g);
    const spec = mapThemeFor(themeId);
    g.showGlobe(true)
      .globeTileEngineMaxLevel(0)
      .globeMaterial(dayNightMaterial)
      .backgroundImageUrl(minimalGlobeBackdropDataUrl(themeId))
      .backgroundColor(spec.globeBackground)
      .atmosphereColor(spec.globeAtmosphereColor)
      .atmosphereAltitude(Math.min(0.2, spec.globeAtmosphereAltitude * 1.55));
    updateDayNightSun(dayNightMaterial, solarSimUtcMs);
    const pov = g.pointOfView();
    updateDayNightGlobeRotation(dayNightMaterial, pov.lng ?? 0, pov.lat ?? 0);
  }

  function applyCartoGlobe(g: GlobeInstance, theme: ThemeId): void {
    applyCartoTheme(g, theme);
    g.showGlobe(true)
      .globeTileEngineMaxLevel(6)
      .backgroundImageUrl(null);
    if (cartoGlobeMaterial) {
      g.globeMaterial(cartoGlobeMaterial);
    }
    syncMonochromeSolarShell(g);
  }

  function syncSolarUniforms(g: GlobeInstance): void {
    const pov = g.pointOfView();
    const lng = pov.lng ?? 0;
    const lat = pov.lat ?? 0;
    if (usePhotorealShader() && dayNightMaterial) {
      updateDayNightSun(dayNightMaterial, solarSimUtcMs);
      updateDayNightGlobeRotation(dayNightMaterial, lng, lat);
    } else if (wantMonochromeSolarShell() && solarOverlay) {
      refreshMonochromeSolarUniforms(g);
    }
  }

  /** Terminator path + subsun/moon markers — immediate on solar scrub (not debounced). */
  function updateGlobeSolarDecor(g: GlobeInstance): void {
    syncSolarUniforms(g);
    const z = zoomScaleFromAltitude(cameraAltitude);
    const pathRows: GlobePathDatum[] = [];
    if (showTerminator) {
      const termCoords = buildTerminatorPath(simUtcMs);
      if (termCoords.length > 2) {
        pathRows.push({
          path: termCoords,
          color: mapThemeFor(themeId).terminatorStroke,
          stroke: 0.45 * Math.sqrt(z),
          dashLength: 1,
          dashGap: 0,
        });
      }
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

    if (showSubsun || showMoon) {
      scheduleUpdateLayers();
    }
  }

  function applyGlobeTheme(g: GlobeInstance, theme: ThemeId): void {
    if (usePhotorealShader()) {
      applyPhotorealGlobe(g);
    } else {
      applyCartoGlobe(g, theme);
    }
    syncStylizedCloudLayer(g);
  }

  function updateLayers(): void {
    const g = globe;
    if (!g || document.hidden) return;

    const windowed = eventsForMapDisplay(dashboard.events, simUtcMs);
    const geoIdx = getGeoEventIndex(windowed);
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
      geoCount: geoIdx.geoEvents.length,
      causalCount: dashboard.recentCausalEdges.length,
    });
    if (fp === lastLayerFingerprint) {
      syncSolarUniforms(g);
      return;
    }
    lastLayerFingerprint = fp;

    syncSolarUniforms(g);

    const z = zoomScaleFromAltitude(cameraAltitude);
    const events = geoIdx.geoEvents;
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
      geoIdx.events,
      dashboard.recentCausalEdges,
      mapDomainSet,
    );

    const heatData = wantHeat ? buildPerDomainHeatmaps(geoIdx, mapDomainSet) : [];
    if (showWeatherOverlays) {
      const tempHm = buildTemperatureHeatmap(
        climateWeatherPoints(windowed, simUtcMs),
      );
      if (tempHm) heatData.push(tempHm);
    }
    g.heatmapsData(heatData)
      .heatmapPoints((d) => (d as GlobeHeatmapDatum).points)
      .heatmapPointLat((p) => (p as [number, number, number])[0])
      .heatmapPointLng((p) => (p as [number, number, number])[1])
      .heatmapPointWeight((p) => (p as [number, number, number])[2] ?? 1)
      .heatmapColorFn((d: object) => {
        const row = d as GlobeHeatmapDatum;
        return (t: number) =>
          row.domain === "climate-temp"
            ? tempHeatColor(t)
            : heatColorForDomain(row.color, t);
      })
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
        scaledArcStroke((a as GlobeArc).w * 0.95, cameraAltitude),
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

    syncStylizedCloudLayer(g);

    const hover = hoverAdmin;
    g.polygonsData(adminFeatures)
      .polygonCapColor((feat: object) =>
        feat === hover
          ? "rgba(56, 189, 248, 0.38)"
          : "rgba(148, 163, 184, 0.05)",
      )
      .polygonSideColor(() => "rgba(0,0,0,0)")
      .polygonStrokeColor((feat: object) =>
        feat === hover
          ? "rgba(56, 189, 248, 0.9)"
          : "rgba(148, 163, 184, 0.28)",
      )
      .polygonAltitude(0.0018)
      .polygonLabel((feat: object) =>
        adminLabel((feat as AdminFeature).properties),
      );
  }

  function onCameraChange(g: GlobeInstance): void {
    const pov = g.pointOfView();
    if (Number.isFinite(pov.altitude)) {
      cameraAltitude = pov.altitude;
    }
    syncSolarUniforms(g);
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
    let onGlobePointerUp: (() => void) | undefined;
    let onWheelBlock: ((e: WheelEvent) => void) | undefined;
    let onCameraChangeHandler: (() => void) | undefined;
    let loadSafetyTimer: number | undefined;
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
        if (showSolarShading && !showPhotorealEarth) {
          solarOverlay = await loadMonochromeSolarOverlay();
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

        cartoGlobeMaterial = g.globeMaterial() as Material;
        applyGlobeTheme(g, themeId);
        g.showGlobe(true).showAtmosphere(true).enablePointerInteraction(true);

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

        let globeTapHadPoint = false;
        g.onPointClick((pt: object | null) => {
          if (!pt) return;
          const p = pt as GlobeEventPoint;
          if (p.kind !== "event" || !p.id) return;
          globeTapHadPoint = true;
          const al = p.altitude ?? 0.006;
          const xy = g.getScreenCoords(p.lat, p.lng, al);
          if (onEventPointTap && xy) {
            onEventPointTap({ x: xy.x, y: xy.y, id: p.id });
            return;
          }
          navigate(`/events/${encodeURIComponent(p.id)}`);
        });
        onGlobePointerUp = (): void => {
          if (!onMapBackgroundTap) return;
          queueMicrotask(() => {
            if (!globeTapHadPoint) onMapBackgroundTap();
            globeTapHadPoint = false;
          });
        };
        root?.addEventListener("pointerup", onGlobePointerUp);
        g.onPolygonHover((feat: object | null) => {
          hoverAdmin = feat ? (feat as AdminFeature) : null;
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
        onCameraChangeHandler = () => onCameraChange(g);
        g.controls().addEventListener("change", onCameraChangeHandler!);

        const renderer = g.renderer();
        const scene = g.scene();
        const camera = g.camera();
        const renderFrame = (): void => {
          if (cloudStylizedRoot && showWeatherOverlays) {
            cloudStylizedRoot.rotation.y += 0.000095;
          }
          syncSolarUniforms(g);
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

        void loadAdminBoundaries().then((fc) => {
          if (cancelled) return;
          adminFeatures = fc.features as AdminFeature[];
          scheduleUpdateLayers();
        });

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
      if (onGlobePointerUp && root) {
        root.removeEventListener("pointerup", onGlobePointerUp);
      }
      if (onWheelBlock && root) {
        root.removeEventListener("wheel", onWheelBlock, { capture: true });
      }
      ro?.disconnect();
      ro = null;
      if (globe) {
        try {
          if (onCameraChangeHandler) globe.controls()?.removeEventListener("change", onCameraChangeHandler);
          if (cloudStylizedRoot) {
            try {
              globe.scene().remove(cloudStylizedRoot);
            } catch {
              /* */
            }
            disposeStylizedCloudLayer(cloudStylizedRoot);
            cloudStylizedRoot = null;
          }
          removeSolarShell(globe);
          lastCloudSyncSig = "";
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
      solarOverlay = null;
      cartoGlobeMaterial = null;
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

  /** Admin hover only restyles polygons — avoid debounced full layer rebuild. */
  $effect(() => {
    const g = globe;
    if (!g || adminFeatures.length === 0) return;
    const hover = hoverAdmin;
    g.polygonsData(adminFeatures)
      .polygonCapColor((feat: object) =>
        feat === hover
          ? "rgba(56, 189, 248, 0.38)"
          : "rgba(148, 163, 184, 0.05)",
      )
      .polygonStrokeColor((feat: object) =>
        feat === hover
          ? "rgba(56, 189, 248, 0.9)"
          : "rgba(148, 163, 184, 0.28)",
      );
  });

  $effect(() => {
    const g = globe;
    if (!g) return;
    void showPhotorealEarth;
    void showSolarShading;
    void dayNightMaterial;
    void solarOverlay;
    let cancelled = false;
    void (async () => {
      if (showPhotorealEarth && !dayNightMaterial) {
        const mat = await loadDayNightGlobeMaterial();
        if (!cancelled) dayNightMaterial = mat;
      }
      if (showSolarShading && !showPhotorealEarth && !solarOverlay) {
        const overlay = await loadMonochromeSolarOverlay();
        if (!cancelled) solarOverlay = overlay;
      }
      if (!cancelled && globe) applyGlobeTheme(globe, themeId);
    })();
    return () => { cancelled = true; };
  });

  $effect.pre(() => {
    solarSimUtcMs = simUtcMs;
  });

  /** Scrub instant — drives solar uniforms (not debounced, not fingerprint-gated). */
  $effect(() => {
    const g = globe;
    if (!g || document.hidden) return;
    syncMonochromeSolarShell(g);
    syncSolarUniforms(g);
  });

  /** Terminator / tracking paths on the solar scrubber (immediate, not debounced). */
  $effect(() => {
    const g = globe;
    if (!g || document.hidden) return;
    void solarSimUtcMs;
    void showTerminator;
    void showSubsun;
    void showMoon;
    void showWeatherOverlays;
    void showTrackingPaths;
    void trackingPathRows;
    void themeId;
    updateGlobeSolarDecor(g);
  });

  /** Overlay toggles and mode — immediate layer refresh (not debounced). */
  $effect(() => {
    const g = globe;
    if (!g || document.hidden) return;
    void showCausal;
    void mode;
    void mapDomainSet;
    scheduleUpdateLayers();
  });

  $effect(() => {
    void dashboardData.revision;
    void simUtcMs;
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
    void showSolarShading;
    void dayNightMaterial;
    void solarOverlay;
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
    z-index: 1;
    min-height: 200px;
    border-radius: inherit;
    overflow: hidden;
    touch-action: none;
    pointer-events: auto;
    /* Match 2D map canvas fill — no photo skybox visible outside WebGL. */
    background: var(--map-canvas-bg, var(--bg-0));
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
