import { describe, expect, it } from "bun:test";
import { buildDemoMapCollection } from "./map-demo-geojson";

describe("map-demo-geojson", () => {
  it("buildDemoMapCollection has contours, wind, and transport", () => {
    const fc = buildDemoMapCollection();
    expect(fc.type).toBe("FeatureCollection");
    const kinds = new Set(
      fc.features.map((f) => (f.properties as { kind?: string }).kind),
    );
    expect(kinds.has("contour")).toBe(true);
    expect(kinds.has("wind")).toBe(true);
    expect(kinds.has("transport")).toBe(true);
  });
});
