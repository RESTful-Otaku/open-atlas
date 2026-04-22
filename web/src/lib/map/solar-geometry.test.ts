import { describe, expect, it } from "bun:test";
import {
  buildSunPointFeature,
  buildTerminatorLine,
  subsolarPoint,
} from "./solar-geometry";

describe("solar-geometry", () => {
  it("subsolarPoint returns in-range lat/lon", () => {
    const p = subsolarPoint(new Date("2017-08-21T18:00:00.000Z"));
    expect(p.lat).toBeGreaterThanOrEqual(-23.5);
    expect(p.lat).toBeLessThanOrEqual(23.5);
    expect(p.lon).toBeGreaterThanOrEqual(-180);
    expect(p.lon).toBeLessThanOrEqual(180);
  });

  it("buildTerminatorLine is a closed great-circle (first ≈ last)", () => {
    const p = subsolarPoint(new Date("2017-03-20T00:00:00.000Z"));
    const t = buildTerminatorLine(p, 64);
    const c = t.geometry.coordinates;
    expect(c.length).toBeGreaterThan(3);
    const a = c[0]!;
    const b = c[c.length - 1]!;
    expect(Math.abs(a[0]! - b[0]!)).toBeLessThan(0.15);
    expect(Math.abs(a[1]! - b[1]!)).toBeLessThan(0.15);
  });

  it("buildSunPointFeature is at requested subsolar", () => {
    const f = buildSunPointFeature({ lat: 5, lon: -120 });
    const c = f.geometry.coordinates;
    expect(c[0]).toBe(-120);
    expect(c[1]).toBe(5);
  });
});
