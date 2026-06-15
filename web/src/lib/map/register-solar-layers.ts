import { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import {
  LAYER_NIGHT,
  LAYER_SUN,
  LAYER_TERM,
  SRC_NIGHT,
  SRC_SOLAR,
} from "./map-constants";
import {
  buildNightSideDisc,
  buildSunPointFeature,
  buildTerminatorLine,
  subsolarPoint,
} from "./solar-geometry";

const EMPTY_GEOJSON: GeoJSON.GeoJSON = {
  type: "FeatureCollection",
  features: [],
};

export function registerSolarSources(map: MapLibreMap): void {
  map.addSource(SRC_SOLAR, {
    type: "geojson",
    data: EMPTY_GEOJSON,
  });
  map.addSource(SRC_NIGHT, {
    type: "geojson",
    data: EMPTY_GEOJSON,
  });
}

export function registerSolarLayers(map: MapLibreMap): void {
  map.addLayer({
    id: LAYER_NIGHT,
    type: "fill",
    source: SRC_NIGHT,
    paint: {
      "fill-color": "rgba(6, 12, 28, 0.55)",
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        0,
        0.16,
        3,
        0.22,
        8,
        0.28,
      ],
      "fill-antialias": true,
    },
    layout: { visibility: "none" },
  });
  map.addLayer({
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
  map.addLayer({
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
}

export function updateSolarLayers(
  map: MapLibreMap,
  simUtcMs: number,
  showSubsun: boolean,
): void {
  const when = new Date(simUtcMs);
  const sub = subsolarPoint(when);
  const f: GeoJSON.Feature[] = [buildTerminatorLine(sub)];
  if (showSubsun) f.push(buildSunPointFeature(sub));
  const s = map.getSource(SRC_SOLAR) as GeoJSONSource | undefined;
  if (s) s.setData({ type: "FeatureCollection", features: f });
  const nightSrc = map.getSource(SRC_NIGHT) as GeoJSONSource | undefined;
  if (nightSrc) {
    nightSrc.setData({
      type: "FeatureCollection",
      features: [buildNightSideDisc(sub)],
    });
  }
}

export { SRC_NIGHT, SRC_SOLAR, LAYER_NIGHT, LAYER_SUN, LAYER_TERM };
