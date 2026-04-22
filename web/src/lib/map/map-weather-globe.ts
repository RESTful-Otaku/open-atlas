/**
 * Build globe.gl `pathsData` from the same static demo weather GeoJSON
 * (wind + isobar-like contours) used by the MapLibre `SRC_DEMO` source.
 */
import { buildDemoMapCollection } from "./map-demo-geojson";

export type GlobePathDatum = {
  path: [number, number, number][];
  color: string;
  /** Stroke width in degrees (0 = hairline) */
  stroke: number;
  dashLength?: number;
  dashGap?: number;
  dashInitialGap?: number;
};

function lineCoordsToGlobePath(
  coords: [number, number][],
  alt: number,
): [number, number, number][] {
  return coords.map(
    ([lon, lat]) => [lat, lon, alt] as [number, number, number],
  );
}

/**
 * One entry per line feature for per-path color/dash in globe.gl.
 */
export function buildDemoWeatherPathsForGlobe(): GlobePathDatum[] {
  const fc = buildDemoMapCollection();
  const out: GlobePathDatum[] = [];
  for (const f of fc.features) {
    if (f.geometry.type !== "LineString") continue;
    const kind =
      f.properties && typeof f.properties === "object" && "kind" in f.properties
        ? (f.properties as { kind?: string }).kind
        : undefined;
    if (kind !== "wind" && kind !== "contour") continue;
    const coords = f.geometry.coordinates as [number, number][];
    if (kind === "wind") {
      out.push({
        path: lineCoordsToGlobePath(coords, 0.0062),
        color: "rgba(56, 189, 248, 0.62)",
        stroke: 0.38,
      });
    } else {
      out.push({
        path: lineCoordsToGlobePath(coords, 0.0036),
        color: "rgba(148, 163, 184, 0.48)",
        stroke: 0.22,
        dashLength: 0.1,
        dashGap: 0.07,
      });
    }
  }
  return out;
}
