import { describe, expect, test } from "bun:test";
import { Vector2 } from "three";
import {
  monochromeSolarThemeParams,
  updateMonochromeSolarSun,
  type MonochromeSolarOverlay,
} from "./globe-solar-overlay";
import { subsolarPoint } from "./solar-geometry";

describe("globe-solar-overlay", () => {
  test("monochromeSolarThemeParams uses stronger night shade on dark theme", () => {
    const light = monochromeSolarThemeParams("light");
    const dark = monochromeSolarThemeParams("dark");
    expect(dark.nightShadeStrength).toBeGreaterThan(light.nightShadeStrength);
    expect(dark.cityLightStrength).toBeGreaterThan(light.cityLightStrength);
  });

  test("updateMonochromeSolarSun moves subsolar uniform when sim instant changes", () => {
    const sun = new Vector2();
    const material = {
      uniforms: { sunPosition: { value: sun } },
    } as MonochromeSolarOverlay;
    const noon = Date.parse("2026-06-21T12:00:00Z");
    const dusk = Date.parse("2026-06-21T18:00:00Z");
    const subNoon = subsolarPoint(new Date(noon));
    const subDusk = subsolarPoint(new Date(dusk));
    expect(subDusk.lon).not.toBe(subNoon.lon);
    updateMonochromeSolarSun(material, noon);
    expect(sun.x).toBe(subNoon.lon);
    updateMonochromeSolarSun(material, dusk);
    expect(sun.x).toBe(subDusk.lon);
  });
});
