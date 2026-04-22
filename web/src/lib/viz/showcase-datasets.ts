/**
 * Realistic static datasets for the `/viz` gallery — logistics, traffic,
 * energy, and orbital paths — so charts and maps can be reviewed without
 * SpacetimeDB or external API keys.
 */
import { chartPalette } from "./chart-theme";

export const WEEKS = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"] as const;

export const portThroughputKteu = {
  weeks: [...WEEKS],
  shanghai: [412, 428, 405, 438, 451, 462, 448, 470],
  rotterdam: [198, 201, 195, 204, 210, 208, 215, 218],
  los_angeles: [176, 168, 182, 171, 179, 185, 190, 188],
} as const;

export const crossDockMinutes = {
  label: "Avg dwell (min)",
  sites: [
    { name: "NRT-1", value: 38 },
    { name: "FRA-3", value: 44 },
    { name: "ORD-H", value: 52 },
    { name: "DFW-2", value: 47 },
    { name: "SIN-7", value: 31 },
  ] as const,
};

export const trafficByHour = {
  hours: Array.from({ length: 24 }, (_, h) => `${h.toString().padStart(2, "0")}:00`),
  /** index-hour vehicles / 100 for downtown ring road */
  volume: [
    12, 9, 7, 6, 8, 18, 42, 68, 72, 58, 52, 55, 56, 54, 59, 64, 78, 92, 88, 70,
    55, 40, 28, 18,
  ],
} as const;

export const marketShare = [
  { name: "Carrier A", value: 28 },
  { name: "Carrier B", value: 22 },
  { name: "Carrier C", value: 18 },
  { name: "Other", value: 32 },
] as const;

export const logisticsSankey = {
  nodes: [
    { name: "Sourcing" },
    { name: "Ningbo" },
    { name: "Rotterdam" },
    { name: "LA/LB" },
    { name: "Inland" },
    { name: "Retail" },
  ],
  links: [
    { source: "Sourcing", target: "Ningbo", value: 38 },
    { source: "Sourcing", target: "Rotterdam", value: 22 },
    { source: "Ningbo", target: "LA/LB", value: 24 },
    { source: "Ningbo", target: "Rotterdam", value: 14 },
    { source: "Rotterdam", target: "Inland", value: 28 },
    { source: "LA/LB", target: "Inland", value: 20 },
    { source: "Inland", target: "Retail", value: 40 },
  ],
} as const;

export const orgTree = {
  name: "OpenAtlas",
  children: [
    {
      name: "Surface",
      children: [
        { name: "Truck" },
        { name: "Last mile" },
      ],
    },
    {
      name: "Maritime",
      children: [
        { name: "Linehaul" },
        { name: "Transship" },
      ],
    },
    { name: "Air", children: [{ name: "Express" }, { name: "Charter" }] },
  ],
} as const;

export const treemapHier = {
  name: "Regions",
  children: [
    {
      name: "APAC",
      children: [
        { name: "CN", value: 42 },
        { name: "JP", value: 18 },
        { name: "AU", value: 11 },
      ],
    },
    {
      name: "EMEA",
      children: [
        { name: "DE", value: 20 },
        { name: "NL", value: 14 },
        { name: "UK", value: 16 },
      ],
    },
    { name: "AMER", children: [{ name: "US", value: 35 }, { name: "CA", value: 9 }] },
  ],
} as const;

export const sunburstHier = treemapHier;

export const parallelMetrics = [
  { name: "SIN-AM", punctuality: 0.91, cost: 0.62, risk: 0.35, co2: 0.28 },
  { name: "SHA-EU", punctuality: 0.78, cost: 0.71, risk: 0.42, co2: 0.55 },
  { name: "LAX-ORD", punctuality: 0.85, cost: 0.58, risk: 0.31, co2: 0.45 },
  { name: "FRA-HEL", punctuality: 0.88, cost: 0.65, risk: 0.22, co2: 0.32 },
] as const;

export const ohlcWeek = {
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  data: [
    [102, 108, 101, 106],
    [106, 110, 104, 107],
    [107, 112, 105, 109],
    [109, 111, 103, 104],
    [104, 106, 99, 101],
  ] as [number, number, number, number][],
} as const;

export const boxplotRuns = {
  category: "Latency (ms)",
  data: [12, 14, 15, 16, 18, 19, 21, 24, 28, 31, 35, 38, 42, 55, 120],
} as const;

export const THEME_RIVER_WEEKS = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"] as const;

export const themeRiverBlocks = (() => {
  const out: { week: string; type: string; value: number }[] = [];
  for (const [i, w] of THEME_RIVER_WEEKS.entries()) {
    out.push(
      { week: w, type: "Grid", value: 12 + (i % 4) * 2 },
      { week: w, type: "Traffic", value: 18 + (i % 5) * 3 },
      { week: w, type: "Logistics", value: 10 + (i % 3) * 2 },
    );
  }
  return out;
})();

export const graphSample = (() => {
  const names = [
    "Edge-A",
    "Edge-B",
    "Hub-1",
    "Hub-2",
    "Leaf-x",
    "Leaf-y",
    "Leaf-z",
  ];
  const nodes = names.map((name, i) => ({
    id: name,
    name,
    value: 3 + (i % 4),
    symbolSize: 14 + (i % 3) * 4,
    category: i < 2 ? "edge" : i < 4 ? "hub" : "leaf",
  }));
  const links: { source: string; target: string; value: number }[] = [
    { source: "Edge-A", target: "Hub-1", value: 2 },
    { source: "Edge-B", target: "Hub-1", value: 2 },
    { source: "Hub-1", target: "Hub-2", value: 3 },
    { source: "Hub-1", target: "Leaf-x", value: 1 },
    { source: "Hub-2", target: "Leaf-y", value: 1 },
    { source: "Hub-2", target: "Leaf-z", value: 2 },
  ];
  return { nodes, links };
})();

function quantiles(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const x = (sorted.length - 1) * p;
  const i = Math.floor(x);
  const f = x - i;
  if (i + 1 < sorted.length) {
    return sorted[i]! + f * (sorted[i + 1]! - sorted[i]!);
  }
  return sorted[i]!;
}

export function boxplotFromSample(values: readonly number[]): {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
} {
  const s = [...values].sort((a, b) => a - b);
  return {
    min: s[0] ?? 0,
    q1: quantiles(s, 0.25),
    median: quantiles(s, 0.5),
    q3: quantiles(s, 0.75),
    max: s[s.length - 1] ?? 0,
  };
}

/** Demo cities with severity-like weights for map heat. */
export function demoPointFeatures(): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const points: [number, number, number][] = [
    [121.47, 31.23, 0.9],
    [4.9, 52.37, 0.55],
    [-118.24, 34.05, 0.72],
    [103.85, 1.29, 0.48],
    [151.2, -33.9, 0.4],
    [139.65, 35.68, 0.62],
    [-74.0, 40.7, 0.85],
    [13.4, 52.5, 0.5],
  ];
  return {
    type: "FeatureCollection",
    features: points.map((p, i) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p[0]!, p[1]!] },
      properties: {
        severity: p[2],
        name: `node-${i}`,
        color: chartPalette[i % chartPalette.length]!,
      },
    })),
  };
}

/** Great-circle-ish polyline: synthetic LEO ground track (not Kepler). */
export function demoLeoOrbitLine(): GeoJSON.Feature<GeoJSON.LineString> {
  const coords: [number, number][] = [];
  for (let i = 0; i <= 64; i += 1) {
    const t = (i / 64) * Math.PI * 2;
    const lon = (t * 180) / Math.PI - 180 + Math.sin(t * 3) * 8;
    const lat = Math.sin(t * 2) * 55 + Math.cos(t) * 6;
    coords.push([lon, Math.max(-85, Math.min(85, lat))]);
  }
  return {
    type: "Feature",
    properties: { id: "leo-track" },
    geometry: { type: "LineString", coordinates: coords },
  };
}

export function demoFreightRoutes(): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { mode: "ocean", name: "Transpac" },
        geometry: {
          type: "LineString",
          coordinates: [
            [125, 30],
            [10, 35],
            [-120, 35],
            [-118, 33],
          ],
        },
      },
      {
        type: "Feature",
        properties: { mode: "road", name: "I-5 spine" },
        geometry: {
          type: "LineString",
          coordinates: [
            [-122.3, 47.6],
            [-122.0, 45.5],
            [-120.0, 36.7],
            [-118.2, 34.0],
          ],
        },
      },
    ],
  };
}

export function sumGeoPoints(fc: GeoJSON.FeatureCollection<GeoJSON.Point>): number {
  return fc.features.length;
}
