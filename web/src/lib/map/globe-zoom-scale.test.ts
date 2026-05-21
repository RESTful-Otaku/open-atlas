import { describe, expect, test } from "bun:test";
import {
  heatmapBandwidthForZoom,
  zoomScaleFromAltitude,
} from "./globe-zoom-scale";
import { arcAltitudeForGlobe } from "./tracking-paths";

describe("zoomScaleFromAltitude", () => {
  test("increases when zooming in (lower altitude)", () => {
    expect(zoomScaleFromAltitude(0.5)).toBeGreaterThan(zoomScaleFromAltitude(2.28));
  });

  test("clamps extreme values", () => {
    expect(zoomScaleFromAltitude(0.05)).toBeLessThanOrEqual(2.75);
    expect(zoomScaleFromAltitude(10)).toBeGreaterThanOrEqual(0.45);
  });
});

describe("heatmapBandwidthForZoom", () => {
  test("tighter kernel when closer", () => {
    expect(heatmapBandwidthForZoom(0.6)).toBeLessThan(heatmapBandwidthForZoom(2.5));
  });
});

describe("arcAltitudeForGlobe", () => {
  test("longer arcs fly higher above the surface", () => {
    const short = arcAltitudeForGlobe(0, 0, 1, 1);
    const long = arcAltitudeForGlobe(51, -0.1, 40, -74);
    expect(long).toBeGreaterThan(short);
    expect(short).toBeGreaterThanOrEqual(0.08);
    expect(long).toBeLessThanOrEqual(0.29);
  });
});
