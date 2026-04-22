import { describe, expect, it } from "bun:test";
import { buildDemoWeatherPathsForGlobe } from "./map-weather-globe";

describe("map-weather-globe", () => {
  it("converts demo wind and contour features to per-path globe rows", () => {
    const rows = buildDemoWeatherPathsForGlobe();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.path.length).toBeGreaterThan(1);
      for (const p of r.path) {
        expect(p[2]).toBeDefined();
        expect(p[0] >= -90 && p[0] <= 90).toBe(true);
        expect(p[1] >= -180 && p[1] <= 180).toBe(true);
      }
    }
  });
});
