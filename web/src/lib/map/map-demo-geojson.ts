import { chartPalette } from "../viz/chart-theme";

type AssetClass = "civ" | "com" | "mil";
type TMode = "air" | "sea" | "road";

export function transportGlyph(
  mode: TMode,
  assetClass: AssetClass,
): string {
  if (mode === "air") {
    if (assetClass === "mil") return "▲";
    if (assetClass === "com") return "◆";
    return "○";
  }
  if (mode === "sea") {
    if (assetClass === "mil") return "⬡";
    if (assetClass === "com") return "◇";
    return "◯";
  }
  if (assetClass === "mil") return "■";
  if (assetClass === "com") return "▣";
  return "□";
}

export function buildDemoMapCollection(): GeoJSON.FeatureCollection {
  const contours: GeoJSON.Feature<GeoJSON.LineString>[] = [
    {
      type: "Feature",
      properties: { kind: "contour", level: 1008 },
      geometry: {
        type: "LineString",
        coordinates: ringAround(-40, 45, 6, 12),
      },
    },
    {
      type: "Feature",
      properties: { kind: "contour", level: 1012 },
      geometry: {
        type: "LineString",
        coordinates: ringAround(-35, 48, 5.5, 10),
      },
    },
    {
      type: "Feature",
      properties: { kind: "contour", level: 1020 },
      geometry: {
        type: "LineString",
        coordinates: ringAround(135, 35, 8, 14),
      },
    },
    {
      type: "Feature",
      properties: { kind: "contour", level: 1015 },
      geometry: {
        type: "LineString",
        coordinates: ringAround(12, 48, 5, 9),
      },
    },
  ];

  const wind: GeoJSON.Feature<GeoJSON.LineString>[] = [
    segmentWithArrow(-8, 50, 55, 38, 0.75),
    segmentWithArrow(-60, 15, 40, 25, 0.55),
    segmentWithArrow(100, 5, 40, 15, 0.65),
    segmentWithArrow(-150, 60, 35, 32, 0.5),
    segmentWithArrow(12, 30, 32, 22, 0.62),
    segmentWithArrow(160, -30, 15, 20, 0.48),
  ];

  const transport: GeoJSON.Feature<GeoJSON.Point>[] = [
    tp(125.0, 31.2, "sea", "com", "SHA"),
    tp(4.4, 51.9, "sea", "civ", "RTM"),
    tp(139.7, 35.6, "sea", "mil", "YOK"),
    tp(-77.0, 38.9, "air", "com", "IAD"),
    tp(2.5, 49.0, "air", "civ", "CDG"),
    tp(116.6, 40.1, "air", "mil", "PEK?"),
    tp(-0.1, 51.4, "road", "civ", "LON"),
    tp(12.4, 41.8, "road", "com", "ROM"),
  ];

  return {
    type: "FeatureCollection",
    features: [...contours, ...wind, ...transport],
  };
}

function ringAround(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n = 48,
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = (2 * Math.PI * i) / n;
    out.push([cx + rx * Math.cos(t), cy + (ry * Math.sin(t)) / 1.2]);
  }
  return out;
}

function segmentWithArrow(
  lon0: number,
  lat0: number,
  spanLon: number,
  spanLat: number,
  strength: number,
): GeoJSON.Feature<GeoJSON.LineString> {
  const n = 8;
  const coords: [number, number][] = [];
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    coords.push([lon0 + spanLon * u, lat0 + spanLat * u * (0.7 + 0.15 * Math.sin(u * Math.PI))]);
  }
  return {
    type: "Feature",
    properties: { kind: "wind", strength },
    geometry: { type: "LineString", coordinates: coords },
  };
}

function tp(
  lon: number,
  lat: number,
  mode: TMode,
  assetClass: AssetClass,
  label: string,
): GeoJSON.Feature<GeoJSON.Point> {
  const palette =
    assetClass === "mil"
      ? 5
      : assetClass === "com"
        ? 2
        : 0;
  return {
    type: "Feature",
    properties: {
      kind: "transport",
      mode,
      assetClass,
      label,
      glyph: transportGlyph(mode, assetClass),
      color: chartPalette[palette % chartPalette.length] ?? "#94a3b8",
    },
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}
