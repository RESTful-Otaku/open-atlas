import type { ClimateWeatherPoint } from "./map-sim-time";
import type { GlobeHeatmapDatum } from "./three-globe-data";

/** Temperature field heatmap (°C) for globe.gl when weather overlays are on. */
export function buildTemperatureHeatmap(
  points: readonly ClimateWeatherPoint[],
): GlobeHeatmapDatum | null {
  if (points.length === 0) return null;
  const pts: [number, number, number][] = points.map((p) => {
    const w = Math.max(0.15, Math.min(1, (p.tempC + 30) / 60));
    return [p.lat, p.lon, w];
  });
  return {
    domain: "climate-temp",
    color: "#f97316",
    points: pts,
  };
}

export function tempHeatColor(t: number): string {
  const cold = { r: 56, g: 189, b: 248 };
  const mid = { r: 250, g: 204, b: 21 };
  const hot = { r: 239, g: 68, b: 68 };
  let r: number;
  let g: number;
  let b: number;
  if (t < 0.5) {
    const u = t / 0.5;
    r = cold.r + (mid.r - cold.r) * u;
    g = cold.g + (mid.g - cold.g) * u;
    b = cold.b + (mid.b - cold.b) * u;
  } else {
    const u = (t - 0.5) / 0.5;
    r = mid.r + (hot.r - mid.r) * u;
    g = mid.g + (hot.g - mid.g) * u;
    b = mid.b + (hot.b - mid.b) * u;
  }
  const a = Math.min(0.85, Math.cbrt(t) * 0.82);
  if (a < 0.03) return "rgba(0,0,0,0)";
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}
