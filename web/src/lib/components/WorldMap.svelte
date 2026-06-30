<script lang="ts">
  import { onMount, tick, type Component } from "svelte";
  import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
  import { debounce, rafCoalesce } from "../debounce-raf";
  import { releaseWebGlCanvases } from "../webgl-teardown";
  import { isCompactLayout, subscribeMobileLayout } from "../mobile-layout";
  import {
    dismissMapEmptyHint,
    isMapEmptyHintDismissed,
  } from "../map/map-empty-dismiss";
  import { acquireNarrativeSubscription } from "../connection.svelte";
  import { ChevronDown, Flame, Grid3x3, Layers, MapPin } from "@lucide/svelte";

  $effect(() => {
    if (embedded) return;
    return acquireNarrativeSubscription();
  });

  import {
    buildCausalLineCollection,
    isGeoEvent,
  } from "../map/map-causal-geojson";
  import {
    allDomainIds,
    loadMapViewState,
    mapDomainsActiveLabel as formatMapDomainsLabel,
    saveMapViewState,
    type MapDisplayMode,
  } from "../map/map-view-persist";
  import {
    LAYER_ADMIN_FILL,
    LAYER_ADMIN_LINE,
    LAYER_CAUSAL,
    LAYER_CLIMATE_TEMP,
    LAYER_DEMO_CONTOUR,
    LAYER_DEMO_TRANSPORT,
    LAYER_DEMO_WIND,
    LAYER_NIGHT,
    LAYER_POINTS,
    LAYER_SUN,
    LAYER_TERM,
    SRC_ADMIN,
    LAYER_TRACKING,
    LAYER_TRACKING_PATHS,
  } from "../map/map-constants";
  import {
    buildAllTrackingPaths,
    trackingPathsToFeatureCollection,
  } from "../map/tracking-paths";
  import {
    ensureTleCache,
    loadMaritimeSample,
    loadOpenSkyAircraft,
    satelliteRowsAtTime,
    toTrackingGeoJson,
    toTrackingGlobePoints,
    type PublicTrackRow,
  } from "../tracking/public-tracking";
  import { aircraftRowsFromTransportEvents } from "../tracking/stdb-aircraft";
  import { applyMapPresentation } from "../map/map-presentation";
  import { mapThemeFor } from "../theme-map";
  import { onThemeChange, readThemeFromDocument } from "../theme-events";
  import {
    registerSolarLayers,
    registerSolarSources,
    updateSolarLayers,
  } from "../map/register-solar-layers";
  import {
    flushClimateWeatherLayers as flushWeatherLayers,
    registerWeatherLayers,
    registerWeatherSources,
  } from "../map/register-weather-layers";
  import {
    flushTrackingLayers as flushTrackingLayerData,
    registerTrackingLayers,
    registerTrackingSources,
  } from "../map/register-tracking-layers";
  import {
    applyMapMode,
    flushEventAndCausalLayers as flushEventCausalData,
    registerCausalLayer,
    registerEventSources,
    registerHeatLayers,
    registerPointsLayer,
  } from "../map/register-event-layers";
  import { eventsForMapDisplay } from "../map/map-sim-time";
  import { loadAdminBoundaries } from "../map/globe-admin-boundaries";
  import { dashboardData } from "../dashboard-revision.svelte";
  import { getGeoEventIndex } from "../geo-event-index";
  import { dashboard, matchesSelectedDomain } from "../state.svelte";
  import { navigate } from "../router.svelte";
  import { DOMAIN_CATALOG, domainColor } from "../colors";
  import type { UiEvent } from "../types";

  import CompactNumber from "./CompactNumber.svelte";
  import EventMapHoverCard from "./EventMapHoverCard.svelte";
  import {
    isEventPinned,
    MAX_MAP_PINS_DESKTOP,
    prunePinnedInspectors,
    togglePinInspector,
    unpinInspector,
    unpinLastInspector,
    type PinnedMapInspector,
  } from "../map/map-pinned-inspectors";
  import MapLayersPanel from "./MapLayersPanel.svelte";
  import MapMobileSheet from "./MapMobileSheet.svelte";
  import OpsStrip from "./OpsStrip.svelte";
  import Panel from "./Panel.svelte";

  interface Props {
    embedded?: boolean;
    panelSpan?: number;
    projection?: "globe" | "mercator";
  }
  let { embedded = true, panelSpan = 12, projection = "globe" }: Props =
    $props();

  const useWebGlGlobe = $derived(!embedded && projection === "globe");

  let mapSurfaceEl: HTMLDivElement | undefined = $state();
  type MapPointHover = { x: number; y: number; id: string };
  let mapPointHover = $state<MapPointHover | null>(null);
  /** Last point hover while moving toward the card (map may fire leave first). */
  let stickyMapPointHover = $state<MapPointHover | null>(null);
  /** Pointer over the hover card — do not dismiss while true. */
  let hoverCardPointerInside = $state(false);
  let stickyHoverClearTimer: ReturnType<typeof setTimeout> | undefined;
  const mapViewPersisted = loadMapViewState();

  let pinnedInspectors = $state<PinnedMapInspector[]>(mapViewPersisted.pins);

  const shownMapPointHover = $derived(
    mapPointHover ?? stickyMapPointHover,
  );

  function cancelStickyHoverClear(): void {
    if (stickyHoverClearTimer !== undefined) {
      clearTimeout(stickyHoverClearTimer);
      stickyHoverClearTimer = undefined;
    }
  }

  function setMapPointHover(next: MapPointHover | null): void {
    cancelStickyHoverClear();
    if (next) {
      mapPointHover = next;
      stickyMapPointHover = next;
      return;
    }
    mapPointHover = null;
    if (hoverCardPointerInside) return;
    if (compactLayout && pinnedInspectors.length > 0) return;
    stickyHoverClearTimer = setTimeout(() => {
      stickyHoverClearTimer = undefined;
      if (!hoverCardPointerInside && !(compactLayout && pinnedInspectors.length > 0)) {
        stickyMapPointHover = null;
      }
    }, 320);
  }

  function dismissMapPointHover(): void {
    cancelStickyHoverClear();
    mapPointHover = null;
    stickyMapPointHover = null;
    hoverCardPointerInside = false;
  }

  function clearMapPointHover(): void {
    setMapPointHover(null);
  }

  const mapHoverEvent = $derived.by(() => {
    const m = shownMapPointHover;
    if (!m) return null;
    void dashboardData.revision;
    return getGeoEventIndex(mapDisplayEvents).eventById.get(m.id) ?? null;
  });

  const geoEventIndex = $derived.by(() => {
    void dashboardData.revision;
    return getGeoEventIndex(mapDisplayEvents);
  });

  const pinnedInspectorEvents = $derived.by(() => {
    const idx = geoEventIndex;
    return pinnedInspectors
      .map((pin) => {
        const event = idx.eventById.get(pin.eventId) ?? null;
        return event ? { pin, event } : null;
      })
      .filter((row): row is { pin: PinnedMapInspector; event: UiEvent } => row !== null);
  });

  const floatingHoverEvent = $derived.by(() => {
    if (compactLayout) return null;
    const ev = mapHoverEvent;
    if (!ev || isEventPinned(pinnedInspectors, ev.id)) return null;
    return ev;
  });

  const compactInspectorEvent = $derived.by(() => {
    if (!compactLayout) return null;
    const pin = pinnedInspectors[0];
    if (pin) return geoEventIndex.eventById.get(pin.eventId) ?? mapHoverEvent;
    return mapHoverEvent;
  });

  const compactInspectorPos = $derived.by(() => {
    const pin = pinnedInspectors[0];
    if (pin) return { x: pin.x, y: pin.y };
    const m = shownMapPointHover;
    return { x: m?.x ?? 0, y: m?.y ?? 0 };
  });

  function handlePinChange(
    eventId: string,
    x: number,
    y: number,
    wantPinned: boolean,
  ): void {
    if (!wantPinned) {
      pinnedInspectors = unpinInspector(pinnedInspectors, eventId);
      return;
    }
    const r = togglePinInspector(
      pinnedInspectors,
      { eventId, x, y },
      compactLayout,
    );
    if (r.ok) {
      pinnedInspectors = r.pins;
      cancelStickyHoverClear();
    }
  }

  function dismissAllInspectors(): void {
    pinnedInspectors = [];
    dismissMapPointHover();
  }

  function dismissFloatingInspector(): void {
    dismissMapPointHover();
  }

  function openEventInspectorAt(x: number, y: number, id: string): void {
    cancelStickyHoverClear();
    const hover = { x, y, id };
    mapPointHover = hover;
    stickyMapPointHover = hover;
    const r = togglePinInspector(pinnedInspectors, { eventId: id, x, y }, true);
    if (r.ok) pinnedInspectors = r.pins;
  }

  $effect(() => {
    const ids = new Set(geoEventIndex.eventById.keys());
    const pruned = prunePinnedInspectors(pinnedInspectors, ids);
    if (pruned.length !== pinnedInspectors.length) {
      pinnedInspectors = pruned;
    }
  });

  let container: HTMLDivElement | undefined = $state();
  let mapLayersOpen = $state(false);
  let compactLayout = $state(isCompactLayout());
  let mapEmptyDismissed = $state(isMapEmptyHintDismissed());
  let map = $state<MapLibreMap | null>(null);
  let loaded = $state(false);
  let mode = $state<MapDisplayMode>(mapViewPersisted.mode);
  function utcDayStart(t: number): number {
    const d = new Date(t);
    return Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
    );
  }
  let simDayStart = $state(mapViewPersisted.simDayStart);
  let simMinOfDay = $state(mapViewPersisted.simMinOfDay);
  const simUtcMs = $derived(simDayStart + simMinOfDay * 60_000);
  let showTerminator = $state(mapViewPersisted.showTerminator);
  const map2DNightVisible = $derived(
    !useWebGlGlobe && !embedded && projection === "mercator",
  );
  let showSubsun = $state(mapViewPersisted.showSubsun);
  let showMoon = $state(mapViewPersisted.showMoon);
  let showCausal = $state(mapViewPersisted.showCausal);
  let showPhotorealEarth = $state(mapViewPersisted.showPhotorealEarth);
  let showDemoLayers = $state(mapViewPersisted.showDemoLayers);
  let showWeatherOverlays = $state(mapViewPersisted.showWeatherOverlays);
  let showPublicTracking = $state(mapViewPersisted.showPublicTracking);
  let tleCacheReady = $state(false);
  let airTrackingRowsDemo = $state<PublicTrackRow[]>([]);
  let shipTrackingRows = $state<PublicTrackRow[]>([]);
  let mapDomainSet = $state<Set<string>>(mapViewPersisted.domains);
  const domainPickOrder = $derived(
    [...DOMAIN_CATALOG].sort((a, b) => a.label.localeCompare(b.label)),
  );
  function persistMapViewState(): void {
    saveMapViewState({
      domains: mapDomainSet,
      mode,
      showTerminator,
      showSubsun,
      showMoon,
      showCausal,
      showPhotorealEarth,
      showDemoLayers,
      showWeatherOverlays,
      showPublicTracking,
      simDayStart,
      simMinOfDay,
      pins: pinnedInspectors,
    });
  }

  function setMapDomain(id: string, on: boolean): void {
    const n = new Set(mapDomainSet);
    if (on) n.add(id);
    else n.delete(id);
    mapDomainSet = n;
    persistMapViewState();
  }
  function selectAllMapDomains(): void {
    mapDomainSet = new Set(allDomainIds());
    persistMapViewState();
  }
  function clearMapDomains(): void {
    mapDomainSet = new Set();
    persistMapViewState();
  }

  $effect(() => {
    void mapDomainSet;
    void mode;
    void showTerminator;
    void showSubsun;
    void showMoon;
    void showCausal;
    void showPhotorealEarth;
    void showDemoLayers;
    void showWeatherOverlays;
    void showPublicTracking;
    void simDayStart;
    void simMinOfDay;
    void pinnedInspectors;
    persistMapViewState();
  });

  let ThreeGlobeComponent: Component | undefined | null = $state(null);
  let globeLoadError = $state<string | null>(null);

  $effect(() => {
    if (useWebGlGlobe) {
      import("./ThreeGlobe.svelte")
        .then((mod) => {
          ThreeGlobeComponent = mod.default as unknown as Component;
          globeLoadError = null;
        })
        .catch((err) => {
          globeLoadError = err instanceof Error ? err.message : String(err);
          ThreeGlobeComponent = null;
        });
    } else {
      ThreeGlobeComponent = null;
      globeLoadError = null;
    }
  });

  function toFeatureCollection(
    events: readonly UiEvent[],
  ): GeoJSON.FeatureCollection<GeoJSON.Point> {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    for (const event of events) {
      if (!matchesSelectedDomain(event.domain)) continue;
      if (!mapDomainSet.has(event.domain)) continue;
      if (!isGeoEvent(event)) continue;
      const sev = event.severity_score;
      const w = Number.isFinite(sev) ? Math.max(0.12, sev) : 0.25;
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [event.location.lon, event.location.lat],
        },
        properties: {
          domain: event.domain,
          severity: sev,
          w,
          color: domainColor(event.domain),
          id: event.id,
          timestamp: event.timestamp,
        },
      });
    }
    return { type: "FeatureCollection", features };
  }

  const simDate = $derived(new Date(simUtcMs));
  const simUtcLabel = $derived(
    simDate.toISOString().slice(0, 16).replace("T", " "),
  );

<<<<<<< HEAD
=======
  /** Events shown on map layers (24h replay, fallback to all). */
>>>>>>> 4a07e08 (fix: backoff polling, globe import, reactivity fixes, map defaults)
  const mapDisplayEvents = $derived.by(() => {
    void dashboardData.revision;
    const out = eventsForMapDisplay(dashboard.events, simUtcMs);
    if (dashboard.events.length > 0 && out.length === 0) {
      console.debug("openatlas map: eventsForMapDisplay returned 0 from %d events — check simUtcMs parse", dashboard.events.length);
    }
    return out;
  });
  const airFromStdb = $derived.by(() => {
    void dashboardData.revision;
    return dashboard.dataMode === "live"
      ? aircraftRowsFromTransportEvents(dashboard.events)
      : [];
  });

  const publicTrackingRows = $derived.by((): PublicTrackRow[] => {
    if (!showPublicTracking) return [];
    const when = new Date(simUtcMs);
    const sats = tleCacheReady ? satelliteRowsAtTime(when) : [];
    const air =
      dashboard.dataMode === "live" ? airFromStdb : airTrackingRowsDemo;
    return [...sats, ...air, ...shipTrackingRows];
  });
  const trackingGlobePoints = $derived(
    toTrackingGlobePoints(publicTrackingRows),
  );
  const trackingFeatureCollection = $derived(
    toTrackingGeoJson(publicTrackingRows),
  );
  const trackingPathsCollection = $derived.by(() => {
    if (!showPublicTracking) {
      return { type: "FeatureCollection" as const, features: [] };
    }
    const paths = buildAllTrackingPaths(
      new Date(simUtcMs),
      publicTrackingRows,
    );
    return trackingPathsToFeatureCollection(paths);
  });

  const mapGeoPointCount = $derived.by(() => {
    void dashboardData.revision;
    void simUtcMs;
    void mapDomainSet;
    void dashboard.selectedDomain;
    let n = 0;
    for (const event of mapDisplayEvents) {
      if (!matchesSelectedDomain(event.domain)) continue;
      if (!mapDomainSet.has(event.domain)) continue;
      if (!isGeoEvent(event)) continue;
      n += 1;
    }
    return n;
  });
  const locatedCount = $derived(mapGeoPointCount);
  const mapDomainsActiveLabel = $derived(formatMapDomainsLabel(mapDomainSet));

  onMount(() => {
    if (!embedded && projection === "globe") {
      return;
    }
    const emb = embedded;
    let m: maplibregl.Map | null = null;
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    let setupGen = 0;

    const teardownMap = (): void => {
      setupGen += 1;
      dismissMapPointHover();
      ro?.disconnect();
      ro = null;
      const container = m?.getContainer();
      m?.remove();
      m = null;
      map = null;
      loaded = false;
      if (container) releaseWebGlCanvases(container);
    };

    const setup = async (): Promise<void> => {
      const theme = readThemeFromDocument();
      const basemap = mapThemeFor(theme).basemapGlStyle;
      const gen = ++setupGen;
      await tick();
      if (cancelled || gen !== setupGen) return;
      if (!container) {
        await new Promise<void>((r) => {
          requestAnimationFrame(() => {
            r();
          });
        });
      }
      if (cancelled || gen !== setupGen || !container) return;

      m = new maplibregl.Map({
        container,
        style: basemap,
        center: [0, 20],
        zoom: emb ? 1.4 : 1.2,
        minZoom: 0.5,
        maxZoom: 12,
        attributionControl: { compact: true },
        /**
         * Desktop: wheel zoom needs Ctrl/⌘ so the page can scroll.
         * Mobile: pinch-zoom without a modifier.
         */
        cooperativeGestures: !isCompactLayout(),
        dragRotate: !emb,
        touchPitch: !emb,
        pitchWithRotate: false,
      });
      const inst = m;
      map = m;

      inst.addControl(
        new maplibregl.NavigationControl({
          visualizePitch: false,
          showCompass: !emb,
        }),
        "top-right",
      );

      if (container) {
        ro = new ResizeObserver(() => {
          inst.resize();
        });
        ro.observe(container);
      }

      inst.on("load", () => {
        registerEventSources(inst);
      registerSolarSources(inst);
      inst.addSource(SRC_ADMIN, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        generateId: true,
      });
      registerWeatherSources(inst);
      registerTrackingSources(inst);

      registerHeatLayers(inst);
      inst.addLayer({
        id: LAYER_ADMIN_FILL,
        type: "fill",
        source: SRC_ADMIN,
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            "rgba(56, 189, 248, 0.28)",
            "rgba(148, 163, 184, 0.05)",
          ],
        },
      });
      inst.addLayer({
        id: LAYER_ADMIN_LINE,
        type: "line",
        source: SRC_ADMIN,
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            "rgba(56, 189, 248, 0.9)",
            "rgba(148, 163, 184, 0.32)",
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            2.2,
            0.7,
          ],
        },
      });

      registerWeatherLayers(inst);
      registerCausalLayer(inst);
      registerTrackingLayers(inst);
      registerPointsLayer(inst);
      registerSolarLayers(inst);

      loaded = true;
      applyMapMode(inst, mode);
      flushEventAndCausalLayers();
      flushSolarLayers();
      flushClimateWeatherLayers();
      flushTrackingLayers();
      syncMapOverlays(inst);

      void loadAdminBoundaries().then((fc) => {
        const src = inst.getSource(SRC_ADMIN) as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData(fc);
      });

      let hoveredAdminId: string | number | undefined;
      inst.on("mousemove", LAYER_ADMIN_FILL, (e) => {
        if (!e.features?.length) return;
        const id = e.features[0]?.id;
        if (id === undefined || id === hoveredAdminId) return;
        if (hoveredAdminId !== undefined) {
          inst.removeFeatureState({ source: SRC_ADMIN, id: hoveredAdminId }, "hover");
        }
        hoveredAdminId = id;
        inst.setFeatureState({ source: SRC_ADMIN, id: hoveredAdminId }, { hover: true });
      });
      inst.on("mouseleave", LAYER_ADMIN_FILL, () => {
        if (hoveredAdminId !== undefined) {
          inst.removeFeatureState({ source: SRC_ADMIN, id: hoveredAdminId }, "hover");
          hoveredAdminId = undefined;
        }
      });

      if (!emb) {
        applyMapPresentation(inst, { projection: "mercator" }, theme);
        inst.setMaxPitch(0);
        inst.setPitch(0);
        inst.setBearing(0);
      } else {
        applyMapPresentation(inst, { projection: "mercator" }, theme);
      }

      const doResize = (): void => {
        inst.resize();
      };
      requestAnimationFrame(() => {
        doResize();
        requestAnimationFrame(doResize);
      });
      const onWin = (): void => doResize();
      window.addEventListener("resize", onWin);
      inst.once("remove", () => window.removeEventListener("resize", onWin));
      });

      inst.on("click", LAYER_POINTS, (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties as { id?: string };
        const id = props?.id != null ? String(props.id) : null;
        if (!id) return;
        if (isCompactLayout()) {
          openEventInspectorAt(e.point.x, e.point.y, id);
          return;
        }
        navigate(`/events/${encodeURIComponent(id)}`);
      });
      inst.on("click", LAYER_TRACKING, (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const p = feature.properties as {
          id: string;
          name: string;
          track_class: string;
          h_km: number;
        };
        new maplibregl.Popup({ closeButton: false, className: "oa-popup" })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="oa-popup-inner">
            <strong>${p.track_class}</strong>
            <div>${p.name || p.id}</div>
            <div>~${(p.h_km ?? 0).toFixed(0)} km alt</div>
            <code>${p.id}</code>
          </div>`,
          )
          .addTo(inst);
      });

      const onPointHoverMove: (e: { point: { x: number; y: number } }) => void = (
        e,
      ) => {
        const feats = inst.queryRenderedFeatures(
          [e.point.x, e.point.y] as [number, number],
          { layers: [LAYER_POINTS, LAYER_TRACKING] },
        );
        if (feats.length) {
          const top = feats[0];
          if (top?.layer.id === LAYER_TRACKING) {
            inst.getCanvas().style.cursor = "help";
            clearMapPointHover();
            return;
          }
          inst.getCanvas().style.cursor = "pointer";
          const pr = top.properties;
          const id = pr && "id" in pr ? pr.id : null;
          if (id != null) {
            setMapPointHover({
              x: e.point.x,
              y: e.point.y,
              id: String(id),
            });
          } else {
            clearMapPointHover();
          }
        } else {
          inst.getCanvas().style.cursor = "";
          clearMapPointHover();
        }
      };
      const onMapOut = (): void => {
        clearMapPointHover();
        inst.getCanvas().style.cursor = "";
      };
      inst.on("mousemove", onPointHoverMove);
      inst.on("mouseout", onMapOut);
    };

    void setup();
    const offTheme = onThemeChange(() => {
      if (cancelled) return;
      teardownMap();
      void setup();
    });

    return () => {
      cancelled = true;
      flushTrackingLayers.cancel();
      flushSolarLayers.cancel();
      offTheme();
      teardownMap();
    };
  });

  const flushEventAndCausalLayers = rafCoalesce(() => {
    const currentMap = map;
    if (!currentMap || !loaded) return;
    const events = mapDisplayEvents;
    const edges = dashboard.recentCausalEdges;
    flushEventCausalData(
      currentMap,
      toFeatureCollection(events),
      buildCausalLineCollection(events, edges, { mapDomains: mapDomainSet }),
    );
  });

  const flushTrackingLayers = debounce(() => {
    const currentMap = map;
    if (!currentMap || !loaded) return;
    flushTrackingLayerData(currentMap, trackingFeatureCollection, trackingPathsCollection);
  }, 250);

  const flushSolarLayers = rafCoalesce(() => {
    const currentMap = map;
    if (!currentMap || !loaded) return;
    updateSolarLayers(currentMap, simUtcMs, showSubsun);
  });

  function syncMapOverlays(m: MapLibreMap): void {
    const setVis = (id: string, on: boolean): void => {
      if (!m.getLayer(id)) return;
      m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    };
    setVis(LAYER_DEMO_CONTOUR, showWeatherOverlays);
    setVis(LAYER_DEMO_WIND, showWeatherOverlays);
    setVis(LAYER_CLIMATE_TEMP, showWeatherOverlays);
    setVis(LAYER_DEMO_TRANSPORT, showDemoLayers);
    setVis(LAYER_CAUSAL, showCausal);
    setVis(LAYER_TERM, showTerminator);
    setVis(LAYER_NIGHT, map2DNightVisible);
    setVis(LAYER_SUN, showSubsun);
    setVis(LAYER_TRACKING, showPublicTracking);
    setVis(LAYER_TRACKING_PATHS, showPublicTracking);
  }

  $effect(() => {
    if (useWebGlGlobe) return;
    void loaded;
    void dashboardData.revision;
    void dashboard.recentCausalEdges;
    void mapDomainSet;
    void mapDisplayEvents;
    void simUtcMs;
    flushEventAndCausalLayers();
  });

  const flushClimateWeatherLayers = debounce(() => {
    const currentMap = map;
    if (!currentMap || !loaded) return;
    flushWeatherLayers(currentMap, dashboard.events, simUtcMs);
  }, 200);

  $effect(() => {
    if (useWebGlGlobe) return;
    void loaded;
    void simUtcMs;
    void mapDisplayEvents;
    void showTerminator;
    void map2DNightVisible;
    void showSubsun;
    flushSolarLayers();
  });

  $effect(() => {
    if (useWebGlGlobe) return;
    void loaded;
    void dashboardData.revision;
    void simUtcMs;
    void showWeatherOverlays;
    flushClimateWeatherLayers();
  });

  $effect(() => {
    const currentMap = map;
    if (!currentMap || !loaded) return;
    applyMapMode(currentMap, mode);
  });

  $effect(() => {
    const currentMap = map;
    if (!currentMap || !loaded) return;
    void showDemoLayers;
    void showWeatherOverlays;
    void showCausal;
    void showTerminator;
    void map2DNightVisible;
    void showSubsun;
    void showPublicTracking;
    syncMapOverlays(currentMap);
  });

  $effect(() => {
    if (useWebGlGlobe) return;
    void loaded;
    void tleCacheReady;
    void simUtcMs;
    void airFromStdb;
    void airTrackingRowsDemo;
    void shipTrackingRows;
    void showPublicTracking;
    void publicTrackingRows;
    void trackingFeatureCollection;
    void trackingPathsCollection;
    flushTrackingLayers();
  });

  function selectMode(next: MapDisplayMode): void {
    mode = next;
  }

  function snapSimToNow(): void {
    const n = Date.now();
    simDayStart = utcDayStart(n);
    const d = new Date(n);
    simMinOfDay = d.getUTCHours() * 60 + d.getUTCMinutes();
  }

  function toggleMapLayers(e?: Event): void {
    e?.stopPropagation();
    mapLayersOpen = !mapLayersOpen;
  }
  function closeMapLayers(): void {
    mapLayersOpen = false;
  }

  function dismissMapEmpty(): void {
    dismissMapEmptyHint();
    mapEmptyDismissed = true;
  }

  function onMapSurfacePointerDown(e: PointerEvent): void {
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (
      el.closest(".emhc-wrap") ||
      el.closest("[data-map-inspector-overlay]") ||
      el.closest("#map-layers-panel") ||
      el.closest(".map-float-bar") ||
      el.closest(".map-mobile-controls")
    ) {
      return;
    }

    if (compactLayout) {
      if (mapLayersOpen) closeMapLayers();
      return;
    }

    if (!mapLayersOpen) return;
    closeMapLayers();
  }

  onMount(() => {
    const unsubLayout = subscribeMobileLayout(() => {
      compactLayout = isCompactLayout();
      if (compactLayout) mapLayersOpen = false;
    });
    void (async () => {
      try {
        await ensureTleCache();
        tleCacheReady = true;
        shipTrackingRows = await loadMaritimeSample();
        if (dashboard.dataMode === "demo") {
          airTrackingRowsDemo = await loadOpenSkyAircraft();
        }
      } catch {
        tleCacheReady = true;
        shipTrackingRows = await loadMaritimeSample().catch(() => []);
        if (dashboard.dataMode === "demo") {
          airTrackingRowsDemo = await loadOpenSkyAircraft().catch(() => []);
        }
      }
    })();
    return unsubLayout;
  });
</script>

{#snippet modeButtons(vertical = false)}
  <div class="map-mode" class:map-mode--vertical={vertical}>
    <button
      type="button"
      class:is-active={mode === "heat"}
      onclick={() => selectMode("heat")}
      aria-pressed={mode === "heat"}
      title="Heatmap only"
    >
      <Flame size={vertical ? 16 : 14} strokeWidth={1.75} aria-hidden="true" />
      {#if vertical}<span class="map-rail-lbl">Heat</span>{:else}Heat{/if}
    </button>
    <button
      type="button"
      class:is-active={mode === "points"}
      onclick={() => selectMode("points")}
      aria-pressed={mode === "points"}
      title="Points only"
    >
      <MapPin size={vertical ? 16 : 14} strokeWidth={1.75} aria-hidden="true" />
      {#if vertical}<span class="map-rail-lbl">Points</span>{:else}Points{/if}
    </button>
    <button
      type="button"
      class:is-active={mode === "both"}
      onclick={() => selectMode("both")}
      aria-pressed={mode === "both"}
      title="Overlay both"
    >
      <Grid3x3 size={vertical ? 16 : 14} strokeWidth={1.75} aria-hidden="true" />
      {#if vertical}<span class="map-rail-lbl">Both</span>{:else}Both{/if}
    </button>
  </div>
{/snippet}

{#snippet mapFloatControls()}
  {#if compactLayout}
    <div class="map-mobile-controls" aria-live="polite">
      <MapMobileSheet open={mapLayersOpen} title="Map layers" onclose={closeMapLayers}>
        <MapLayersPanel
          open={true}
          sheet={true}
          onDismiss={closeMapLayers}
          {useWebGlGlobe}
          {mapDomainsActiveLabel}
          {simUtcLabel}
          bind:minOfDay={simMinOfDay}
          bind:showTerminator
          bind:showSubsun
          bind:showMoon
          bind:showPhotorealEarth
          bind:showCausal
          bind:showWeatherOverlays
          bind:showDemoLayers
          bind:showPublicTracking
          {mapDomainSet}
          {domainPickOrder}
          onDomainToggle={setMapDomain}
          onSelectAllDomains={selectAllMapDomains}
          onClearDomains={clearMapDomains}
          onSnapSimToNow={snapSimToNow}
        />
      </MapMobileSheet>
      <nav class="map-mobile-rail" aria-label="Map display controls">
        {@render modeButtons(true)}
        <button
          type="button"
          class="map-mobile-rail-btn"
          class:is-active={mapLayersOpen}
          aria-expanded={mapLayersOpen}
          aria-controls="map-layers-panel"
          onclick={toggleMapLayers}
          title="Domains, overlays, and solar time"
        >
          <Layers size={18} strokeWidth={1.75} aria-hidden="true" />
          <span class="map-rail-lbl">Layers</span>
        </button>
      </nav>
    </div>
  {:else}
    <div class="map-float-ui" aria-live="polite">
      {#if mapLayersOpen}
        <div class="map-layers-backdrop" aria-hidden="true"></div>
      {/if}
      <div class="map-float-anchor">
        <div class="map-float-bar">
          {@render modeButtons()}
          <div class="map-mode">
            <button
              type="button"
              class:is-active={mapLayersOpen}
              aria-expanded={mapLayersOpen}
              aria-controls="map-layers-panel"
              onclick={toggleMapLayers}
              title="Domains, overlays, and solar time"
            >
              <Layers size={14} strokeWidth={1.75} aria-hidden="true" />
              Layers
              <span class="map-layers-chev" class:map-layers-chev-open={mapLayersOpen} aria-hidden="true">
                <ChevronDown size={14} strokeWidth={2} />
              </span>
            </button>
          </div>
        </div>
        <MapLayersPanel
          open={mapLayersOpen}
          onDismiss={closeMapLayers}
          {useWebGlGlobe}
          {mapDomainsActiveLabel}
          {simUtcLabel}
          bind:minOfDay={simMinOfDay}
          bind:showTerminator
          bind:showSubsun
          bind:showMoon
          bind:showPhotorealEarth
          bind:showCausal
          bind:showWeatherOverlays
          bind:showDemoLayers
          bind:showPublicTracking
          {mapDomainSet}
          {domainPickOrder}
          onDomainToggle={setMapDomain}
          onSelectAllDomains={selectAllMapDomains}
          onClearDomains={clearMapDomains}
          onSnapSimToNow={snapSimToNow}
        />
      </div>
    </div>
  {/if}
{/snippet}

{#snippet mapInspectors()}
  {#if !compactLayout && pinnedInspectorEvents.length > 0}
    <div class="map-pinned-dock" aria-label="Pinned event comparisons">
      {#each pinnedInspectorEvents as { pin, event } (pin.eventId)}
        <EventMapHoverCard
          {event}
          x={pin.x}
          y={pin.y}
          container={mapSurfaceEl ?? null}
          pinned={true}
          docked={true}
          dockLayout="flex"
          pinCount={pinnedInspectors.length}
          onPinChange={(next) => handlePinChange(pin.eventId, pin.x, pin.y, next)}
          onDismiss={() => {
            pinnedInspectors = unpinInspector(pinnedInspectors, pin.eventId);
          }}
        />
      {/each}
    </div>
  {/if}
  {#if compactLayout && compactInspectorEvent}
    <div class="map-inspector-overlay" data-map-inspector-overlay>
      <EventMapHoverCard
        event={compactInspectorEvent}
        x={compactInspectorPos.x}
        y={compactInspectorPos.y}
        container={mapSurfaceEl ?? null}
        pinned={pinnedInspectors.length > 0}
        docked={pinnedInspectors.length > 0}
        dockLayout="compact"
        pinCount={pinnedInspectors.length}
        onPinChange={(next) =>
          handlePinChange(compactInspectorEvent.id, compactInspectorPos.x, compactInspectorPos.y, next)}
        onDismiss={dismissAllInspectors}
        onCardPointerChange={(inside) => {
          hoverCardPointerInside = inside;
          if (inside) cancelStickyHoverClear();
          else if (pinnedInspectors.length === 0) dismissMapPointHover();
        }}
      />
    </div>
  {:else if floatingHoverEvent}
    {@const hoverPos = shownMapPointHover ?? { x: 0, y: 0 }}
    <EventMapHoverCard
      event={floatingHoverEvent}
      x={hoverPos.x}
      y={hoverPos.y}
      container={mapSurfaceEl ?? null}
      pinned={false}
      docked={false}
      pinCount={pinnedInspectors.length}
      pinAtCapacity={pinnedInspectors.length >= MAX_MAP_PINS_DESKTOP}
      onPinChange={(next) =>
        handlePinChange(floatingHoverEvent.id, hoverPos.x, hoverPos.y, next)}
      onDismiss={dismissFloatingInspector}
      onCardPointerChange={(inside) => {
        hoverCardPointerInside = inside;
        if (inside) cancelStickyHoverClear();
        else dismissMapPointHover();
      }}
    />
  {/if}
{/snippet}

{#if embedded}
  <Panel title="Global event map" span={panelSpan}>
    <div
      class="map-wrap"
      class:map-wrap--inspector-open={compactLayout && pinnedInspectors.length > 0 && compactInspectorEvent != null}
      bind:this={mapSurfaceEl}
      onpointerdowncapture={onMapSurfacePointerDown}
    >
      {@render mapFloatControls()}
      <div bind:this={container} class="map"></div>
      {@render mapInspectors()}
    </div>
  </Panel>
{:else}
  <section
    class="map-globe-root"
    aria-label={projection === "mercator"
      ? "2D global operations map"
      : "Three.js operable 3D Earth globe"}
  >
    <header class="map-command-bar" aria-label="Map command bar">
      <div class="map-command-titles">
        <span class="map-command-kicker"
          >{projection === "mercator"
            ? "North-up · pan & zoom"
            : "SpacetimeDB · drag to orbit · scroll to zoom"}</span
        >
        <h2 class="map-command-title">
          {projection === "mercator" ? "Global 2D map" : "Global 3D Earth (WebGL)"}
        </h2>
        <p class="map-command-meta">
          <CompactNumber value={locatedCount} /> geo-located point{locatedCount === 1
            ? ""
            : "s"} in
           view · layers: {mapDomainsActiveLabel}
          {#if dashboard.selectedDomain}
            · filter: {dashboard.selectedDomain}
          {/if}
        </p>
      </div>
      <OpsStrip simUtcLabel={simUtcLabel} simMinOfDay={simMinOfDay} embeddedInCommandBar />
    </header>
    <div
      class="map-wrap map-wrap-globe"
      class:map-wrap--inspector-open={compactLayout && pinnedInspectors.length > 0 && compactInspectorEvent != null}
      bind:this={mapSurfaceEl}
      onpointerdowncapture={onMapSurfacePointerDown}
    >
      {@render mapFloatControls()}
      {#if useWebGlGlobe}
        {#if ThreeGlobeComponent}
          <ThreeGlobeComponent
            {mode}
            showSolarShading={true}
            {showTerminator}
            {showSubsun}
            {showMoon}
            {showCausal}
            {showPhotorealEarth}
            showTrackingPaths={showPublicTracking}
            {showWeatherOverlays}
            mapDomainSet={mapDomainSet}
            {simUtcMs}
            publicTracking={trackingGlobePoints}
            trackingPathRows={publicTrackingRows}
            onMapPointScreen={(d: { x: number; y: number; id: string } | null) => {
              if (d) setMapPointHover(d);
              else clearMapPointHover();
            }}
            onEventPointTap={compactLayout
              ? (d: { x: number; y: number; id: string }) => openEventInspectorAt(d.x, d.y, d.id)
              : undefined}
            onMapBackgroundTap={compactLayout
              ? () => {
                  if (pinnedInspectors.length > 0 || shownMapPointHover) {
                    dismissAllInspectors();
                  }
                }
              : undefined}
          />
        {:else if globeLoadError}
          <div class="map-globe-loading" role="alert">
            Could not load 3D globe. Use the 2D map route or refresh.
          </div>
        {:else}
          <div class="map-globe-loading" role="status" aria-busy="true">
            Loading 3D globe…
          </div>
        {/if}
      {:else}
        <div bind:this={container} class="map"></div>
      {/if}
      {#if mapGeoPointCount === 0 && !mapEmptyDismissed}
        <div class="map-empty" role="status">
          <button
            type="button"
            class="map-empty-dismiss"
            aria-label="Dismiss"
            onclick={dismissMapEmpty}
          >
            ×
          </button>
          <p class="map-empty-kicker">Instrument room</p>
          <p class="map-empty-title">No geo-located events in this view</p>
          <p class="map-empty-body">
            Showing the last 24h of events ending at the current UTC time.
            Scrub solar time,
            {#if dashboard.selectedDomain}
              clear the hub domain filter ({dashboard.selectedDomain}), or
            {:else if mapDomainSet.size === 0}
              turn on domains in
            {:else}
              enable more domains in
            {/if}
            <button type="button" class="map-empty-link" onclick={toggleMapLayers}>Layers</button>.
            Check feed health in
            <a class="map-empty-link" href="#/settings">Settings</a>.
          </p>
        </div>
      {/if}
      {@render mapInspectors()}
    </div>
  </section>
{/if}

<svelte:window
  onkeydown={(e) => {
    if (e.key !== "Escape") return;
    if (!compactLayout && (mapPointHover || stickyMapPointHover)) {
      dismissMapPointHover();
      return;
    }
    if (pinnedInspectors.length > 0) {
      pinnedInspectors = unpinLastInspector(pinnedInspectors);
      return;
    }
    closeMapLayers();
  }}
/>

<style>
  .map-float-ui {
    position: absolute;
    inset: 0;
    z-index: 14;
    pointer-events: none;
  }
  .map-float-anchor {
    pointer-events: none;
  }
  .map-float-anchor:has(:global(.map-layers-panel.is-open)) {
    pointer-events: auto;
  }
  .map-float-bar,
  .map-mode {
    pointer-events: auto;
  }
  /* Child MapLayersPanel — must be :global or backdrop steals clicks (z-index 10 vs 12). */
  :global(.map-layers-panel.is-open) {
    position: relative;
    z-index: 2;
    pointer-events: auto;
  }
  :global(.map-layers-panel.is-open .map-layers-panel-inner),
  :global(.map-layers-panel.is-open .map-layers-pill),
  :global(.map-layers-panel.is-open .map-mode-compact button),
  :global(.map-layers-panel.is-open .solar-scrub),
  :global(.map-layers-panel.is-open .solar-scrub *) {
    pointer-events: auto;
  }
  .map-layers-backdrop {
    position: absolute;
    inset: 0;
    z-index: 1;
    margin: 0;
    padding: 0;
    border: none;
    cursor: default;
    /* Visual dim only — map-wrap capture closes; avoids blocking panel hits. */
    pointer-events: none;
    background: color-mix(in srgb, var(--bg-0) 12%, transparent);
  }
  .map-float-anchor {
    position: absolute;
    top: 10px;
    bottom: 10px;
    /* Clear MapLibre NavigationControl (top-right, ~36px + margin). */
    right: 54px;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    width: min(100% - 16px, 22rem);
    max-width: 22rem;
    max-height: calc(100% - 20px);
  }
  .map-float-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    width: 100%;
    padding: 4px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--glass-surface, var(--bg-glass)) 85%, transparent);
    border: 1px solid var(--border-1);
    box-shadow: var(--shadow-sm);
    backdrop-filter: blur(10px);
  }

  .map-layers-chev {
    display: inline-flex;
    margin-left: 2px;
    opacity: 0.7;
    transition: transform 0.28s cubic-bezier(0.33, 1, 0.68, 1);
  }
  .map-layers-chev-open {
    transform: rotate(180deg);
  }

  @media (max-width: 520px) {
    .map-float-anchor {
      left: 8px;
      right: 54px;
      width: auto;
      max-width: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .map-layers-chev {
      transition: none;
    }
  }

  /* Right rail centered inside .map-wrap; biased up so flyout clears bottom nav overlap. */
  .map-mobile-controls {
    position: absolute;
    top: 40%;
    right: max(6px, env(safe-area-inset-right, 0px));
    bottom: auto;
    left: auto;
    transform: translateY(-50%);
    z-index: 12;
    display: flex;
    flex-direction: row-reverse;
    align-items: center;
    gap: 8px;
    max-height: calc(100% - 88px);
    max-width: calc(100% - 12px);
    padding-bottom: 12px;
    box-sizing: border-box;
    pointer-events: none;
  }
  .map-mobile-controls:has(:global(.map-mobile-flyout)) {
    top: 34%;
    transform: translateY(calc(-50% - 28px));
  }

  /**
   * Full-map layer for the event inspector on compact — always above the right rail,
   * MapLibre controls, and layers flyout (z-index 48; nav bar stays at 250).
   */
  .map-inspector-overlay {
    position: absolute;
    inset: 0;
    z-index: 260;
    pointer-events: none;
    isolation: isolate;
    overflow: visible;
  }

  .map-inspector-overlay > :global(.emhc-wrap) {
    pointer-events: auto;
    z-index: 1;
  }

  .map-wrap--inspector-open .map-mobile-controls {
    z-index: 6;
  }

  .map-wrap--inspector-open :global(.maplibregl-ctrl-top-right),
  .map-wrap--inspector-open :global(.maplibregl-ctrl-bottom-right) {
    z-index: 2 !important;
  }

  /* Desktop: up to three pinned comparison cards along the bottom of the map. */
  .map-pinned-dock {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    z-index: 32;
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    gap: 10px;
    max-height: min(48vh, calc(100% - 24px));
    pointer-events: none;
    box-sizing: border-box;
  }

  .map-pinned-dock > :global(.emhc-wrap) {
    pointer-events: auto;
  }
  .map-mobile-rail {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    flex-shrink: 0;
    pointer-events: auto;
  }
  .map-mobile-rail :global(.map-mode--vertical) {
    flex-direction: column;
    gap: 2px;
    padding: 4px;
  }
  .map-mobile-rail :global(.map-mode--vertical button) {
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    min-width: var(--mobile-tap-min, 44px);
    min-height: var(--mobile-tap-min, 44px);
    padding: 6px 4px;
    font-size: 9px;
    font-weight: 600;
    line-height: 1.1;
  }
  .map-rail-lbl {
    display: block;
    max-width: 44px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .map-mobile-rail-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: var(--mobile-tap-min, 44px);
    min-height: var(--mobile-tap-min, 44px);
    padding: 6px 4px;
    border-radius: var(--radius);
    border: 1px solid var(--border-1);
    background: var(--glass-surface, var(--bg-glass));
    color: var(--text-2);
    font-size: 9px;
    font-weight: 600;
    box-shadow: var(--shadow-sm);
    backdrop-filter: blur(10px);
    cursor: pointer;
    touch-action: manipulation;
  }
  .map-mobile-rail-btn.is-active {
    border-color: var(--accent);
    color: var(--accent);
  }
  .map-empty {
    position: absolute;
    left: 50%;
    top: 42%;
    transform: translate(-50%, -50%);
    z-index: 4;
    max-width: min(400px, calc(100% - 32px));
    padding: var(--space-5) var(--space-5) var(--space-4);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-2);
    background: var(--glass-surface, var(--bg-glass));
    box-shadow: var(--shadow), var(--shadow-glow-soft, none);
    backdrop-filter: blur(14px);
    text-align: center;
    pointer-events: auto;
  }
  .map-empty-dismiss {
    position: absolute;
    top: 8px;
    right: 8px;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-3);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    touch-action: manipulation;
  }
  .map-empty-dismiss:hover {
    color: var(--text-1);
    background: color-mix(in srgb, var(--bg-2) 80%, transparent);
  }
  .map-empty-kicker {
    margin: 0 0 var(--space-2);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--accent);
  }
  .map-empty-title {
    margin: 0 0 var(--space-2);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text-1);
  }
  .map-empty-body {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-2);
  }
  .map-empty-link {
    font: inherit;
    font-weight: 600;
    color: var(--accent);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
  }
  a.map-empty-link {
    text-decoration: underline;
  }

  .map-wrap:not(.map-wrap-globe) {
    height: 480px;
  }
  .map-wrap {
    position: relative;
    isolation: isolate;
    container-type: size;
    container-name: map-surface;
    width: 100%;
    min-height: 0;
    flex: 1 1 auto;
    border-radius: var(--radius);
    overflow: visible;
    border: 1px solid var(--border-1);
    /* Slightly above pure black so tile load failures are still readable. */
    background: var(--map-canvas-bg);
    /* Vignette on the *frame* only — no layer on top of the WebGL canvas. */
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border-2) 50%, transparent);
  }

  .map {
    position: absolute;
    inset: 0;
    z-index: 0;
    border-radius: var(--radius);
    overflow: hidden;
  }

  :global(.map-wrap-globe .oa-three-globe-wrap),
  :global(.map-wrap-globe .oa-three-globe) {
    border-radius: var(--radius);
    overflow: hidden;
  }

  /* Globe canvas is full-bleed; while layers are open, do not steal panel hits. */
  .map-wrap:has(:global(.map-layers-panel.is-open)) :global(.oa-three-globe-wrap),
  .map-wrap:has(:global(.map-layers-panel.is-open)) :global(.oa-three-globe),
  .map-wrap:has(:global(.map-layers-panel.is-open)) :global(.oa-three-globe canvas),
  .map-wrap:has(:global(.map-layers-panel.is-open)) .map {
    pointer-events: none;
  }

  .map-mode {
    display: inline-flex;
    gap: 0;
    padding: 3px;
    background: var(--glass-surface, var(--bg-glass));
    border: 1px solid var(--border-1);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-sm);
    backdrop-filter: blur(10px);
  }
  .map-mode button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    color: var(--text-3);
    font-size: 11px;
    font-weight: 500;
    padding: 5px 12px;
    border: 0;
    border-radius: var(--radius-pill);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease),
      color var(--motion-fast) var(--ease),
      box-shadow var(--motion-fast) var(--ease);
  }
  .map-mode button:hover {
    color: var(--text-1);
    background: var(--overlay);
  }
  .map-mode button.is-active {
    background: color-mix(in srgb, var(--accent) 18%, var(--bg-2));
    color: var(--text-1);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent),
      0 0 12px -4px color-mix(in srgb, var(--accent) 40%, transparent);
  }

  :global(.oa-popup .maplibregl-popup-content) {
    background: var(--bg-1);
    color: var(--text-1);
    border: 1px solid var(--border-2);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    font-family: var(--font-sans);
    font-size: 12px;
    padding: var(--space-3);
  }
  :global(.oa-popup .maplibregl-popup-tip) {
    border-top-color: var(--border-2);
  }
  :global(.oa-popup-inner) {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  :global(.oa-popup-inner strong) {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 11px;
    color: var(--accent);
  }
  :global(.oa-popup-inner code) {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-3);
  }
  :global(.oa-popup-ts) {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-3);
  }

  .map-globe-root {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    height: 100%;
  }
  .map-command-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3) var(--space-4);
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--border-1);
    background: var(--glass-surface, var(--bg-glass));
    backdrop-filter: blur(12px);
    box-shadow: 0 1px 0 color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .map-command-bar :global(.ops-strip) {
    flex-shrink: 0;
    align-self: center;
  }
  .map-command-titles {
    min-width: 0;
  }
  .map-command-kicker {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-3);
    margin: 0 0 var(--space-1);
  }
  .map-command-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-1);
    letter-spacing: -0.02em;
  }
  .map-command-meta {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-2);
  }
  .map-wrap-globe {
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
    height: 100%;
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    border-bottom: 0;
  }
  .map-globe-loading {
    display: grid;
    place-items: center;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    font-size: 13px;
    color: var(--text-2);
    background: color-mix(in srgb, var(--bg-1) 92%, transparent);
  }
</style>
