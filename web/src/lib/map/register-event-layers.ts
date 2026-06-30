import { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import {
  LAYER_CAUSAL,
  LAYER_POINTS,
  SRC_CAUSAL,
  SRC_EVENTS,
  layerHeatId,
} from "./map-constants";
import { DOMAIN_CATALOG, domainColor, hexToRgba } from "../colors";

export function registerEventSources(map: MapLibreMap): void {
  map.addSource(SRC_EVENTS, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addSource(SRC_CAUSAL, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
}

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

export function registerHeatLayers(map: MapLibreMap): void {
  for (const dom of DOMAIN_CATALOG) {
    map.addLayer({
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
          0, 0.1, 1, 1.1,
        ],
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 0.5, 1, 0.5, 2, 0.55, 4, 0.75, 6, 0.95,
          8, 1.12, 10, 1.4, 12, 1.65, 14, 1.9,
        ],
        "heatmap-color": heatColorRampForDomain(dom.id) as never,
        "heatmap-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 48, 1, 44, 2, 40, 3, 32, 4, 28, 5, 24,
          7, 20, 9, 16, 11, 12, 13, 9, 14, 6,
        ],
        "heatmap-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 0.62, 2, 0.7, 5, 0.78, 9, 0.85, 12, 0.9, 14, 0.91,
        ],
      },
    });
  }
}

export function registerCausalLayer(map: MapLibreMap): void {
  map.addLayer({
    id: LAYER_CAUSAL,
    type: "line",
    source: SRC_CAUSAL,
    paint: {
      "line-color": ["get", "sourceColor"],
      "line-width": [
        "interpolate",
        ["linear"],
        ["get", "influence"],
        0, 0.6, 1, 1.6,
      ],
      "line-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        0, 0.35, 1, 0.5, 2, 0.6, 4, 0.7, 7, 0.75,
        10, 0.8, 14, 0.85,
      ],
      "line-blur": 0.1,
    },
    layout: { "line-cap": "round" },
  });
}

export function registerPointsLayer(map: MapLibreMap): void {
  map.addLayer({
    id: LAYER_POINTS,
    type: "circle",
    source: SRC_EVENTS,
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        0, 1.5, 2, 2, 5, 3.5, 8, 5, 12, 6, 14, 7,
      ],
      "circle-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        0, 0.35, 1, 0.15, 2, 0.45, 3, 0.6, 4, 0.8,
        6, 0.9, 10, 0.92, 14, 0.95,
      ],
      "circle-stroke-color": "rgba(255, 255, 255, 0.9)",
      "circle-stroke-width": 1.5,
    },
  });
}

export function flushEventAndCausalLayers(
  map: MapLibreMap,
  eventsFC: GeoJSON.FeatureCollection,
  causalFC: GeoJSON.FeatureCollection,
): void {
  const eventsSrc = map.getSource(SRC_EVENTS) as GeoJSONSource | undefined;
  if (eventsSrc) eventsSrc.setData(eventsFC);
  const causalSrc = map.getSource(SRC_CAUSAL) as GeoJSONSource | undefined;
  if (causalSrc) causalSrc.setData(causalFC);
}

export function applyMapMode(
  map: MapLibreMap,
  mode: "heat" | "points" | "both",
): void {
  const heatVisible = mode === "heat" || mode === "both";
  const pointVisible = mode === "points" || mode === "both";
  for (const dom of DOMAIN_CATALOG) {
    const hid = layerHeatId(dom.id);
    if (map.getLayer(hid)) {
      map.setLayoutProperty(hid, "visibility", heatVisible ? "visible" : "none");
    }
  }
  if (map.getLayer(LAYER_POINTS)) {
    map.setLayoutProperty(LAYER_POINTS, "visibility", pointVisible ? "visible" : "none");
  }
}
