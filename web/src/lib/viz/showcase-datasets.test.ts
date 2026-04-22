import { describe, expect, it } from "bun:test";
import {
  boxplotFromSample,
  demoFreightRoutes,
  demoLeoOrbitLine,
  demoPointFeatures,
  sumGeoPoints,
} from "./showcase-datasets";

describe("showcase-datasets", () => {
  it("boxplotFromSample computes order statistics", () => {
    const b = boxplotFromSample([1, 2, 3, 100]);
    expect(b.min).toBe(1);
    expect(b.median).toBeGreaterThanOrEqual(2);
    expect(b.max).toBe(100);
  });

  it("GeoJSON features are valid and finite", () => {
    const pts = demoPointFeatures();
    expect(pts.type).toBe("FeatureCollection");
    expect(pts.features.length).toBeGreaterThan(0);
    for (const f of pts.features) {
      const c = f.geometry.coordinates;
      expect(Number.isFinite(c[0]) && Number.isFinite(c[1])).toBe(true);
    }
    expect(sumGeoPoints(pts)).toBe(pts.features.length);

    const orbit = demoLeoOrbitLine();
    expect(orbit.geometry.type).toBe("LineString");
    expect(orbit.geometry.coordinates.length).toBeGreaterThan(8);

    const routes = demoFreightRoutes();
    expect(routes.features.length).toBe(2);
  });
});
