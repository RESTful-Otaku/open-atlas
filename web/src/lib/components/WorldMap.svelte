<script lang="ts">
  import { onMount, tick } from "svelte";
  import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
  import { debounce, rafCoalesce } from "../debounce-raf";
  import { useNarrativeSubscription } from "../narrative-subscription";

  useNarrativeSubscription();
  import {
    Flame,
    Globe as GlobeIcon,
    Grid3x3,
    Layers,
    Link2,
    MapPin,
    Moon,
    Plane,
    Sun,
    SunDim,
    Wind,
  } from "@lucide/svelte";

  import {
    buildCausalLineCollection,
    isGeoEvent,
  } from "../map/map-causal-geojson";
  import { buildDemoMapCollection } from "../map/map-demo-geojson";
  import {
    allDomainIds,
    loadMapDomainSet,
    saveMapDomainSet,
  } from "../map/map-domains-persist";
  import {
    LAYER_CAUSAL,
    LAYER_DEMO_CONTOUR,
    LAYER_DEMO_TRANSPORT,
    LAYER_DEMO_WIND,
    LAYER_POINTS,
    LAYER_SUN,
    LAYER_TERM,
    LAYER_TRACKING,
    LAYER_TRACKING_PATHS,
    layerHeatId,
    SRC_CAUSAL,
    SRC_DEMO,
    SRC_EVENTS,
    SRC_SOLAR,
    SRC_TRACKING,
    SRC_TRACKING_PATHS,
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
    buildSunPointFeature,
    buildTerminatorLine,
    subsolarPoint,
  } from "../map/solar-geometry";
  import { dashboardData } from "../dashboard-revision.svelte";
  import { getGeoEventIndex } from "../geo-event-index";
  import { dashboard, matchesSelectedDomain } from "../state.svelte";
  import { navigate } from "../router.svelte";
  import { DOMAIN_CATALOG, domainColor, hexToRgba } from "../colors";
  import type { UiEvent } from "../types";

  import EventMapHoverCard from "./EventMapHoverCard.svelte";
  import Panel from "./Panel.svelte";
  import ThreeGlobe from "./ThreeGlobe.svelte";

  interface Props {
    /**
     * When `false`, render a full-bleed map: 3D globe (MapLibre) or
     * flat Mercator (see `projection`). When `true`, use the
     * overview `Panel` wrapper.
     */
    embedded?: boolean;
    /** 12-column grid span when `embedded` and wrapped in a Panel. */
    panelSpan?: number;
    /**
     * When `embedded` is `false`, choose globe vs a North-up 2D map. The
     * `/map` route uses `mercator`; the home route uses `globe`.
     */
    projection?: "globe" | "mercator";
  }
  let { embedded = true, panelSpan = 12, projection = "globe" }: Props =
    $props();

  const useWebGlGlobe = $derived(!embedded && projection === "globe");

  let mapSurfaceEl: HTMLDivElement | undefined = $state();
  type MapPointHover = { x: number; y: number; id: string };
  let mapPointHover = $state<MapPointHover | null>(null);
  const mapHoverEvent = $derived.by(() => {
    const m = mapPointHover;
    if (!m) return null;
    void dashboardData.revision;
    return getGeoEventIndex(dashboard.events).eventById.get(m.id) ?? null;
  });

  type Mode = "heat" | "points" | "both";

  let container: HTMLDivElement | undefined = $state();
  let map = $state<MapLibreMap | null>(null);
  let loaded = $state(false);
  let mode = $state<Mode>("both");
  function utcDayStart(t: number): number {
    const d = new Date(t);
    return Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
    );
  }
  let simDayStart = $state(utcDayStart(Date.now()));
  let simMinOfDay = $state(
    (() => {
      const d = new Date();
      return d.getUTCHours() * 60 + d.getUTCMinutes();
    })(),
  );
  const simUtcMs = $derived(simDayStart + simMinOfDay * 60_000);
  let showTerminator = $state(true);
  let showSubsun = $state(true);
  let showMoon = $state(true);
  let showCausal = $state(true);
  /** NASA day/night textures + city lights (3D globe only). */
  let showPhotorealEarth = $state(true);
  /** Optional transport glyphs (separate from wind + pressure lines). */
  let showDemoLayers = $state(false);
  /** Wind segments + isobar-style contours (2D and 3D globe). */
  let showWeatherOverlays = $state(true);
  /** NORAD (TLE) + STDB aircraft + bundled maritime — see `/public/tracking/`. */
  let showPublicTracking = $state(true);
  let tleCacheReady = $state(false);
  /** Demo-only OpenSky poll; live mode uses SpacetimeDB transport events. */
  let airTrackingRowsDemo = $state<PublicTrackRow[]>([]);
  let shipTrackingRows = $state<PublicTrackRow[]>([]);
  /** Which of the 13 catalog domains to plot on the map (session-persisted). */
  let mapDomainSet = $state<Set<string>>(loadMapDomainSet());
  const domainPickOrder = $derived(
    [...DOMAIN_CATALOG].sort((a, b) => a.label.localeCompare(b.label)),
  );
  function setMapDomain(id: string, on: boolean): void {
    const n = new Set(mapDomainSet);
    if (on) n.add(id);
    else n.delete(id);
    mapDomainSet = n;
    saveMapDomainSet(n);
  }
  function selectAllMapDomains(): void {
    mapDomainSet = new Set(allDomainIds());
    saveMapDomainSet(mapDomainSet);
  }
  function clearMapDomains(): void {
    mapDomainSet = new Set();
    saveMapDomainSet(mapDomainSet);
  }

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

  const locatedCount = $derived.by(() => {
    void dashboardData.revision;
    let n = 0;
    for (const e of getGeoEventIndex(dashboard.events).geoEvents) {
      if (matchesSelectedDomain(e.domain) && mapDomainSet.has(e.domain)) n++;
    }
    return n;
  });
  const mapDomainsActiveLabel = $derived(
    mapDomainSet.size === 0
      ? "none"
      : mapDomainSet.size === allDomainIds().length
        ? "all"
        : `${mapDomainSet.size} of ${allDomainIds().length}`,
  );

  function heatColorRampForDomain(domainId: string): unknown[] {
    const c = domainColor(domainId);
    return [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      hexToRgba(c, 0),
      0.1,
      hexToRgba(c, 0.16),
      0.35,
      hexToRgba(c, 0.45),
      0.65,
      hexToRgba(c, 0.68),
      1,
      hexToRgba(c, 0.92),
    ];
  }

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
      mapPointHover = null;
      ro?.disconnect();
      ro = null;
      m?.remove();
      m = null;
      map = null;
      loaded = false;
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
        /** Wheel zoom only with Ctrl (⌃) or, on macOS, ⌘ — so plain scroll can move the page. */
        cooperativeGestures: true,
        dragRotate: !emb,
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
        inst.addSource(SRC_EVENTS, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      inst.addSource(SRC_CAUSAL, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      inst.addSource(SRC_SOLAR, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      inst.addSource(SRC_DEMO, {
        type: "geojson",
        data: buildDemoMapCollection(),
      });
      inst.addSource(SRC_TRACKING, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      inst.addSource(SRC_TRACKING_PATHS, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      for (const dom of DOMAIN_CATALOG) {
        inst.addLayer({
          id: layerHeatId(dom.id),
          type: "heatmap",
          source: SRC_EVENTS,
          filter: ["==", ["get", "domain"], dom.id],
          maxzoom: 14,
          paint: {
            "heatmap-weight": [
              "interpolate",
              ["linear"],
              ["get", "w"],
              0,
              0.1,
              1,
              1.1,
            ],
            "heatmap-intensity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              0.5,
              1,
              0.5,
              2,
              0.55,
              4,
              0.75,
              6,
              0.95,
              8,
              1.12,
              10,
              1.4,
              12,
              1.65,
              14,
              1.9,
            ],
            "heatmap-color": heatColorRampForDomain(dom.id) as never,
            "heatmap-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              48,
              1,
              44,
              2,
              40,
              3,
              32,
              4,
              28,
              5,
              24,
              7,
              20,
              9,
              16,
              11,
              12,
              13,
              9,
              14,
              6,
            ],
            "heatmap-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              0.62,
              2,
              0.7,
              5,
              0.78,
              9,
              0.85,
              12,
              0.9,
              14,
              0.91,
            ],
          },
        });
      }

      inst.addLayer({
        id: LAYER_DEMO_CONTOUR,
        type: "line",
        source: SRC_DEMO,
        filter: ["==", ["get", "kind"], "contour"],
        paint: {
          "line-color": "rgba(148, 163, 184, 0.4)",
          "line-width": 1,
          "line-dasharray": [3, 3],
          "line-opacity": 0.5,
        },
        layout: { visibility: "none" },
      });
      inst.addLayer({
        id: LAYER_DEMO_WIND,
        type: "line",
        source: SRC_DEMO,
        filter: ["==", ["get", "kind"], "wind"],
        paint: {
          "line-color": "rgba(56, 189, 248, 0.55)",
          "line-width": 2.5,
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["get", "strength"],
            0.4,
            0.25,
            1,
            0.6,
          ],
        },
        layout: { "line-cap": "round", visibility: "none" },
      });
      inst.addLayer({
        id: LAYER_CAUSAL,
        type: "line",
        source: SRC_CAUSAL,
        paint: {
          "line-color": ["get", "sourceColor"],
          "line-width": [
            "*",
            [
              "interpolate",
              ["linear"],
              ["get", "influence"],
              0,
              1.1,
              1,
              3.6,
            ],
            [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              0.45,
              2,
              0.7,
              4,
              0.95,
              8,
              1.2,
              12,
              1.3,
              14,
              1.4,
            ],
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            0.35,
            1,
            0.5,
            2,
            0.6,
            4,
            0.7,
            7,
            0.75,
            10,
            0.8,
            14,
            0.85,
          ],
          "line-blur": 0.2,
        },
        layout: { "line-cap": "round" },
      });
      inst.addLayer({
        id: LAYER_TRACKING_PATHS,
        type: "line",
        source: SRC_TRACKING_PATHS,
        paint: {
          "line-color": ["get", "color"],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            0.6,
            4,
            1.2,
            8,
            2.0,
            12,
            2.8,
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            0.45,
            6,
            0.65,
            12,
            0.8,
          ],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      inst.addLayer({
        id: LAYER_TRACKING,
        type: "circle",
        source: SRC_TRACKING,
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            1.4,
            2,
            2.2,
            5,
            3.0,
            10,
            4.2,
            14,
            5.0,
          ],
          "circle-stroke-color": "rgba(10, 12, 18, 0.9)",
          "circle-stroke-width": 1.0,
          "circle-opacity": 0.9,
        },
        layout: { visibility: "visible" },
      });
      inst.addLayer({
        id: LAYER_POINTS,
        type: "circle",
        source: SRC_EVENTS,
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": [
            "*",
            [
              "interpolate",
              ["linear"],
              ["get", "w"],
              0,
              0.25,
              1,
              1.05,
            ],
            [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              0.8,
              1,
              0,
              2,
              1.0,
              3,
              2.6,
              5,
              3.6,
              7,
              4.5,
              9,
              5.5,
              11,
              6.4,
              14,
              8.2,
            ],
          ],
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            0.35,
            1,
            0.15,
            2,
            0.45,
            3,
            0.6,
            4,
            0.8,
            6,
            0.9,
            10,
            0.92,
            14,
            0.95,
          ],
          "circle-stroke-color": "rgba(255, 255, 255, 0.9)",
          "circle-stroke-width": 2,
        },
      });
      inst.addLayer({
        id: LAYER_DEMO_TRANSPORT,
        type: "symbol",
        source: SRC_DEMO,
        filter: ["==", ["get", "kind"], "transport"],
        layout: {
          "text-field": ["get", "glyph"],
          "text-size": 13,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          visibility: "none",
        },
        paint: {
          "text-color": ["get", "color"],
          "text-halo-color": "rgba(7, 9, 14, 0.92)",
          "text-halo-width": 1.6,
          "text-opacity": 0.9,
        },
      });
      inst.addLayer({
        id: LAYER_TERM,
        type: "line",
        source: SRC_SOLAR,
        filter: ["==", ["get", "kind"], "terminator"],
        paint: {
          "line-color": "rgba(200, 220, 255, 0.4)",
          "line-width": 2.2,
          "line-blur": 1.2,
          "line-opacity": 0.7,
        },
        layout: { "line-cap": "round" },
      });
      inst.addLayer({
        id: LAYER_SUN,
        type: "circle",
        source: SRC_SOLAR,
        filter: ["==", ["get", "kind"], "subsun"],
        paint: {
          "circle-color": "rgba(253, 224, 71, 0.95)",
          "circle-radius": 6,
          "circle-opacity": 0.85,
          "circle-stroke-color": "rgba(37, 28, 6, 0.55)",
          "circle-stroke-width": 1.5,
          "circle-blur": 0.2,
        },
      });

      loaded = true;
      applyMode(inst, mode);

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
        if (id) navigate(`/events/${encodeURIComponent(id)}`);
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
            mapPointHover = null;
            return;
          }
          inst.getCanvas().style.cursor = "pointer";
          const pr = top.properties;
          const id = pr && "id" in pr ? pr.id : null;
          if (id != null) {
            mapPointHover = {
              x: e.point.x,
              y: e.point.y,
              id: String(id),
            };
          } else {
            mapPointHover = null;
          }
        } else {
          inst.getCanvas().style.cursor = "";
          mapPointHover = null;
        }
      };
      const onMapOut = (): void => {
        mapPointHover = null;
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
      offTheme();
      teardownMap();
    };
  });

  function applyMode(m: MapLibreMap, next: Mode): void {
    const heatVisible = next === "heat" || next === "both";
    const pointVisible = next === "points" || next === "both";
    for (const dom of DOMAIN_CATALOG) {
      const hid = layerHeatId(dom.id);
      if (m.getLayer(hid)) {
        m.setLayoutProperty(
          hid,
          "visibility",
          heatVisible ? "visible" : "none",
        );
      }
    }
    if (m.getLayer(LAYER_POINTS)) {
      m.setLayoutProperty(
        LAYER_POINTS,
        "visibility",
        pointVisible ? "visible" : "none",
      );
    }
  }

  const flushEventAndCausalLayers = rafCoalesce(() => {
    const currentMap = map;
    if (!currentMap || !loaded) return;
    const events = dashboard.events;
    const edges = dashboard.recentCausalEdges;
    const eventsSrc = currentMap.getSource(SRC_EVENTS) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (eventsSrc) {
      eventsSrc.setData(toFeatureCollection(events));
    }
    const causalSrc = currentMap.getSource(SRC_CAUSAL) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (causalSrc) {
      causalSrc.setData(
        buildCausalLineCollection(events, edges, { mapDomains: mapDomainSet }),
      );
    }
  });

  const flushTrackingLayers = debounce(() => {
    const currentMap = map;
    if (!currentMap || !loaded) return;
    const src = currentMap.getSource(SRC_TRACKING) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    src.setData(trackingFeatureCollection);
    const pathSrc = currentMap.getSource(SRC_TRACKING_PATHS) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (pathSrc) pathSrc.setData(trackingPathsCollection);
  }, 250);

  function syncMapOverlays(m: MapLibreMap): void {
    const setVis = (id: string, on: boolean): void => {
      if (!m.getLayer(id)) return;
      m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    };
    setVis(LAYER_DEMO_CONTOUR, showWeatherOverlays);
    setVis(LAYER_DEMO_WIND, showWeatherOverlays);
    setVis(LAYER_DEMO_TRANSPORT, showDemoLayers);
    setVis(LAYER_CAUSAL, showCausal);
    setVis(LAYER_TERM, showTerminator);
    setVis(LAYER_SUN, showSubsun);
    setVis(LAYER_TRACKING, showPublicTracking);
    setVis(LAYER_TRACKING_PATHS, showPublicTracking);
  }

  $effect(() => {
    if (useWebGlGlobe) return;
    void dashboardData.revision;
    void dashboard.recentCausalEdges;
    void mapDomainSet;
    flushEventAndCausalLayers();
  });

  $effect(() => {
    const currentMap = map;
    if (!currentMap || !loaded) return;
    const when = new Date(simUtcMs);
    void showTerminator;
    void showSubsun;
    const sub = subsolarPoint(when);
    const f: GeoJSON.Feature[] = [];
    if (showTerminator) f.push(buildTerminatorLine(sub));
    if (showSubsun) f.push(buildSunPointFeature(sub));
    const s = currentMap.getSource(SRC_SOLAR) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (s) s.setData({ type: "FeatureCollection", features: f });
  });

  $effect(() => {
    const currentMap = map;
    if (!currentMap || !loaded) return;
    applyMode(currentMap, mode);
  });

  $effect(() => {
    const currentMap = map;
    if (!currentMap || !loaded) return;
    void showDemoLayers;
    void showWeatherOverlays;
    void showCausal;
    void showTerminator;
    void showSubsun;
    void showPublicTracking;
    syncMapOverlays(currentMap);
  });

  $effect(() => {
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

  function selectMode(next: Mode): void {
    mode = next;
  }

  function snapSimToNow(): void {
    const n = Date.now();
    simDayStart = utcDayStart(n);
    const d = new Date(n);
    simMinOfDay = d.getUTCHours() * 60 + d.getUTCMinutes();
  }

  onMount(() => {
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
  });
</script>

{#snippet modeButtons()}
  <div class="map-mode">
    <button
      type="button"
      class:is-active={mode === "heat"}
      onclick={() => selectMode("heat")}
      aria-pressed={mode === "heat"}
      title="Heatmap only"
    >
      <Flame size={14} strokeWidth={1.75} />
      Heat
    </button>
    <button
      type="button"
      class:is-active={mode === "points"}
      onclick={() => selectMode("points")}
      aria-pressed={mode === "points"}
      title="Points only"
    >
      <MapPin size={14} strokeWidth={1.75} />
      Points
    </button>
    <button
      type="button"
      class:is-active={mode === "both"}
      onclick={() => selectMode("both")}
      aria-pressed={mode === "both"}
      title="Overlay both"
    >
      <Grid3x3 size={14} strokeWidth={1.75} />
      Both
    </button>
  </div>
{/snippet}

{#snippet overlayToggles()}
  <div class="map-ovl" role="group" aria-label="Map overlays">
    <label class="map-ovl-item" title="Day/night boundary">
      <input type="checkbox" bind:checked={showTerminator} />
      <Sun size={13} strokeWidth={1.75} />
      <span>Term</span>
    </label>
    <label class="map-ovl-item" title="Subsolar point">
      <input type="checkbox" bind:checked={showSubsun} />
      <SunDim size={13} strokeWidth={1.75} />
      <span>Subsol</span>
    </label>
    {#if useWebGlGlobe}
      <label class="map-ovl-item" title="Approximate moon position">
        <input type="checkbox" bind:checked={showMoon} />
        <Moon size={13} strokeWidth={1.75} />
        <span>Moon</span>
      </label>
      <label
        class="map-ovl-item"
        title="Day/night Earth shader with city lights on the night side"
      >
        <input type="checkbox" bind:checked={showPhotorealEarth} />
        <GlobeIcon size={13} strokeWidth={1.75} />
        <span>Earth</span>
      </label>
    {/if}
    <label class="map-ovl-item" title="Causal edges when both events have place">
      <input type="checkbox" bind:checked={showCausal} />
      <Link2 size={13} strokeWidth={1.75} />
      <span>Causal</span>
    </label>
    <label class="map-ovl-item" title="Wind segments + isobar-style pressure contours">
      <input type="checkbox" bind:checked={showWeatherOverlays} />
      <Wind size={13} strokeWidth={1.75} />
      <span>Weather</span>
    </label>
    <label class="map-ovl-item" title="Sample transport / hub glyphs (independent)">
      <input type="checkbox" bind:checked={showDemoLayers} />
      <Layers size={13} strokeWidth={1.75} />
      <span>Demo</span>
    </label>
    <label
      class="map-ovl-item"
      title="Celestrak TLEs (NORAD), OpenSky ADS-B, sample AIS-style vessels — public & rate-limited"
    >
      <input type="checkbox" bind:checked={showPublicTracking} />
      <Plane size={13} strokeWidth={1.75} />
      <span>Orbits & traffic</span>
    </label>
  </div>
{/snippet}

{#snippet domainDataToggles()}
  <div
    class="map-domains"
    role="group"
    aria-label="Data domains shown on the map (heatmap and points). Zoomed-out views use broader heat; points strengthen as you zoom in."
  >
    <div class="map-domains-head">
      <span class="map-domains-title">Data domains</span>
      <span class="map-domains-badge">{mapDomainsActiveLabel}</span>
      <button
        type="button"
        class="map-domains-ctl"
        onclick={selectAllMapDomains}
      >
        All
      </button>
      <button type="button" class="map-domains-ctl" onclick={clearMapDomains}>
        None
      </button>
    </div>
    <div class="map-domains-grid">
      {#each domainPickOrder as d (d.id)}
        <label class="map-dom-ch" title="Toggle {d.label} events on this map">
          <input
            type="checkbox"
            checked={mapDomainSet.has(d.id)}
            onchange={(ev) => {
              const t = ev.currentTarget as HTMLInputElement;
              setMapDomain(d.id, t.checked);
            }}
          />
          <span
            class="map-dom-swatch"
            style:background={d.color}
            aria-hidden="true"
          ></span>
          <span class="map-dom-txt">{d.label}</span>
        </label>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet timeControl()}
  <div class="map-time" role="group" aria-label="Simulated UTC time for solar layer">
    <span class="map-time-lbl" title="ISO UTC, scrubbed for terminator">{simUtcLabel} UTC</span>
    <input
      class="map-time-sl"
      type="range"
      min="0"
      max="1439"
      bind:value={simMinOfDay}
    />
    <button type="button" class="map-time-now" onclick={snapSimToNow} title="Use current time">
      Now
    </button>
  </div>
{/snippet}

{#if embedded}
  <Panel title="Global event map" span={panelSpan}>
    {#snippet header()}
      <div class="map-head-stack">
        <div class="map-head-tools">
          {@render modeButtons()}
          {@render overlayToggles()}
          {@render timeControl()}
        </div>
        {@render domainDataToggles()}
      </div>
    {/snippet}

    <div class="map-wrap" bind:this={mapSurfaceEl}>
      <div bind:this={container} class="map"></div>
      <EventMapHoverCard
        event={mapHoverEvent}
        x={mapPointHover?.x ?? 0}
        y={mapPointHover?.y ?? 0}
        container={mapSurfaceEl ?? null}
      />
    </div>
  </Panel>
{:else}
  <section
    class="map-globe-root"
    aria-label={projection === "mercator"
      ? "2D global operations map"
      : "Three.js operable 3D Earth globe"}
  >
    <header class="map-globe-head">
      <div class="map-globe-titles">
        <span class="map-globe-kicker"
          >{projection === "mercator"
            ? "North-up · pan & zoom"
            : "SpacetimeDB · drag to orbit · scroll to zoom"}</span
        >
        <h2 class="map-globe-title">
          {projection === "mercator" ? "Global 2D map" : "Global 3D Earth (WebGL)"}
        </h2>
        <p class="map-globe-meta">
          {locatedCount} geo-located point{locatedCount === 1 ? "" : "s"} in
          view · layers: {mapDomainsActiveLabel}
          {#if dashboard.selectedDomain}
            (global filter: {dashboard.selectedDomain})
          {/if}
        </p>
      </div>
      <div class="map-globe-tools">
        <div class="map-globe-tools-row">
          {@render modeButtons()}
          {@render overlayToggles()}
          {@render timeControl()}
        </div>
        {@render domainDataToggles()}
      </div>
    </header>
    <div class="map-wrap map-wrap-globe" bind:this={mapSurfaceEl}>
      {#if useWebGlGlobe}
        <ThreeGlobe
          {mode}
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
          onMapPointScreen={(d) => {
            mapPointHover = d;
          }}
        />
      {:else}
        <div bind:this={container} class="map"></div>
      {/if}
      <EventMapHoverCard
        event={mapHoverEvent}
        x={mapPointHover?.x ?? 0}
        y={mapPointHover?.y ?? 0}
        container={mapSurfaceEl ?? null}
      />
    </div>
  </section>
{/if}

<style>
  .map-head-stack {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
  }
  .map-head-tools,
  .map-globe-tools-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    justify-content: flex-end;
  }
  .map-globe-tools {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
    min-width: 0;
  }
  .map-domains {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 0 2px;
    border-top: 1px solid var(--border-1);
    max-width: 100%;
  }
  .map-domains-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }
  .map-domains-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-3);
  }
  .map-domains-badge {
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--text-3);
  }
  .map-domains-ctl {
    font-size: 10px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: calc(var(--radius) - 2px);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-2);
    cursor: pointer;
  }
  .map-domains-ctl:hover {
    color: var(--text-1);
  }
  .map-domains-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
    gap: 2px 8px;
    max-height: 7.2rem;
    overflow-y: auto;
    padding: 2px 0;
  }
  .map-dom-ch {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--text-2);
    cursor: pointer;
    user-select: none;
  }
  .map-dom-ch input {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    accent-color: var(--accent);
  }
  .map-dom-swatch {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    flex-shrink: 0;
    box-shadow: 0 0 0 1px var(--map-swatch-ring);
  }
  .map-dom-txt {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .map-ovl {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    font-size: 10px;
    color: var(--text-3);
  }
  .map-ovl-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px 2px 0;
    cursor: pointer;
    user-select: none;
  }
  .map-ovl-item input {
    width: 12px;
    height: 12px;
    accent-color: var(--accent);
  }

  .map-time {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    max-width: 100%;
  }
  .map-time-lbl {
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--text-3);
    white-space: nowrap;
  }
  .map-time-sl {
    flex: 1 1 120px;
    min-width: 100px;
    max-width: 200px;
    accent-color: var(--accent);
  }
  .map-time-now {
    font-size: 10px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: calc(var(--radius) - 2px);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-2);
    cursor: pointer;
  }
  .map-time-now:hover {
    color: var(--text-1);
    border-color: var(--border-2);
  }

  .map-wrap {
    position: relative;
    width: 100%;
    height: 480px;
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

  .map-mode {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
  }
  .map-mode button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    color: var(--text-2);
    font-size: 11px;
    font-weight: 500;
    padding: 4px 10px;
    border: 0;
    border-radius: calc(var(--radius) - 4px);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease),
      color var(--motion-fast) var(--ease);
  }
  .map-mode button:hover {
    color: var(--text-1);
    background: var(--overlay);
  }
  .map-mode button.is-active {
    background: var(--bg-3);
    color: var(--text-1);
    box-shadow: inset 0 0 0 1px var(--border-2);
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
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .map-globe-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--border-1);
    background: var(--bg-glass);
    backdrop-filter: blur(8px);
  }
  .map-globe-titles {
    min-width: 0;
  }
  .map-globe-kicker {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-3);
    margin: 0 0 var(--space-1);
  }
  .map-globe-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-1);
    letter-spacing: -0.02em;
  }
  .map-globe-meta {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-2);
  }
  .map-wrap-globe {
    flex: 1 1 auto;
    width: 100%;
    min-height: max(55vh, 320px);
    height: auto;
  }
  .map-globe-tools {
    flex-shrink: 0;
  }
</style>
