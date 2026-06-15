import { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import {
  LAYER_TRACKING,
  LAYER_TRACKING_PATHS,
  SRC_TRACKING,
  SRC_TRACKING_PATHS,
} from "./map-constants";

export function registerTrackingSources(map: MapLibreMap): void {
  map.addSource(SRC_TRACKING, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addSource(SRC_TRACKING_PATHS, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
}

export function registerTrackingLayers(map: MapLibreMap): void {
  map.addLayer({
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
  map.addLayer({
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
}

export function flushTrackingLayers(
  map: MapLibreMap,
  trackingFC: GeoJSON.FeatureCollection,
  trackingPathsFC: GeoJSON.FeatureCollection,
): void {
  const src = map.getSource(SRC_TRACKING) as GeoJSONSource | undefined;
  if (!src) return;
  src.setData(trackingFC);
  const pathSrc = map.getSource(SRC_TRACKING_PATHS) as
    | GeoJSONSource
    | undefined;
  if (pathSrc) pathSrc.setData(trackingPathsFC);
}
