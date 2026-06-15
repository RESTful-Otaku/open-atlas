import { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import {
  LAYER_CLIMATE_TEMP,
  LAYER_DEMO_CONTOUR,
  LAYER_DEMO_TRANSPORT,
  LAYER_DEMO_WIND,
  SRC_CLIMATE_WEATHER,
  SRC_DEMO,
} from "./map-constants";
import { buildDemoMapCollection } from "./map-demo-geojson";
import { climateWeatherFeatureCollection, climateWeatherPoints } from "./map-sim-time";
import type { UiEvent } from "../types";

export function registerWeatherSources(map: MapLibreMap): void {
  map.addSource(SRC_DEMO, {
    type: "geojson",
    data: buildDemoMapCollection(),
  });
  map.addSource(SRC_CLIMATE_WEATHER, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
}

export function registerWeatherLayers(map: MapLibreMap): void {
  map.addLayer({
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
  map.addLayer({
    id: LAYER_CLIMATE_TEMP,
    type: "circle",
    source: SRC_CLIMATE_WEATHER,
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        0,
        10,
        4,
        18,
        8,
        28,
      ],
      "circle-color": [
        "interpolate",
        ["linear"],
        ["get", "temp"],
        -20,
        "#38bdf8",
        5,
        "#22d3ee",
        15,
        "#facc15",
        28,
        "#f97316",
        38,
        "#ef4444",
      ],
      "circle-opacity": 0.58,
      "circle-blur": 0.75,
    },
    layout: { visibility: "none" },
  });
  map.addLayer({
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
  map.addLayer({
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
}

export function flushClimateWeatherLayers(
  map: MapLibreMap,
  events: UiEvent[],
  simUtcMs: number,
): void {
  const src = map.getSource(SRC_CLIMATE_WEATHER) as GeoJSONSource | undefined;
  if (!src) return;
  const pts = climateWeatherPoints(events, simUtcMs);
  src.setData(climateWeatherFeatureCollection(pts));
}
