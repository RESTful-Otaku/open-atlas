/**
 * Map / globe presentation tokens per UI theme. Basemaps, skies, and canvas
 * fills stay aligned with `data-theme` on `<html>`.
 */
import type { LightSpecification, SkySpecification } from "maplibre-gl";

import type { ThemeId } from "./theme.svelte";

const CARTO_SUBS = ["a", "b", "c", "d"] as const;

export interface MapThemeSpec {
  basemapGlStyle: string;
  /** CARTO raster XYZ for globe.gl (Web Mercator). */
  cartoRasterPrefix: string;
  globeBackground: string;
  globeAtmosphereColor: string;
  mapCanvasBackground: string;
  terminatorStroke: string;
  /** Max atmosphere thickness in globe-radius units (subtle halo). */
  globeAtmosphereAltitude: number;
  skyGlobe: SkySpecification;
  lightGlobe: LightSpecification;
  lightMercator: LightSpecification;
}

function cartoRasterUrl(prefix: string, x: number, y: number, level: number): string {
  const s = CARTO_SUBS[(x + y + level) % CARTO_SUBS.length];
  return `https://${s}.basemaps.cartocdn.com/${prefix}/${level}/${x}/${y}.png`;
}

const DARK: MapThemeSpec = {
  basemapGlStyle:
    "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  cartoRasterPrefix: "dark_all",
  globeBackground: "#040a14",
  globeAtmosphereColor: "rgba(56, 189, 248, 0.22)",
  mapCanvasBackground: "#0a1524",
  terminatorStroke: "rgba(180, 210, 255, 0.5)",
  globeAtmosphereAltitude: 0.11,
  skyGlobe: {
    "sky-color": "#060d18",
    "horizon-color": "#4a6fa0",
    "sky-horizon-blend": 0.42,
    "horizon-fog-blend": 0.3,
    "fog-color": "#020810",
    "fog-ground-blend": 0.14,
    "atmosphere-blend": 0.92,
  },
  lightGlobe: {
    anchor: "map",
    color: "#ffffff",
    intensity: 0.48,
    position: [1.2, 80, 50],
  },
  lightMercator: {
    anchor: "map",
    color: "#e8f0ff",
    intensity: 0.35,
    position: [1.0, 90, 30],
  },
};

const DIM: MapThemeSpec = {
  ...DARK,
  basemapGlStyle:
    "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  cartoRasterPrefix: "dark_all",
  globeBackground: "#0c1220",
  globeAtmosphereColor: "rgba(94, 234, 212, 0.18)",
  mapCanvasBackground: "#101828",
  globeAtmosphereAltitude: 0.11,
  skyGlobe: {
    "sky-color": "#0a1018",
    "horizon-color": "#3d5a80",
    "sky-horizon-blend": 0.4,
    "horizon-fog-blend": 0.28,
    "fog-color": "#060a12",
    "fog-ground-blend": 0.12,
    "atmosphere-blend": 0.9,
  },
};

const LIGHT: MapThemeSpec = {
  basemapGlStyle:
    "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  cartoRasterPrefix: "light_all",
  globeBackground: "#e8eef5",
  globeAtmosphereColor: "rgba(56, 130, 190, 0.24)",
  mapCanvasBackground: "#dce4ef",
  terminatorStroke: "rgba(30, 64, 120, 0.55)",
  globeAtmosphereAltitude: 0.13,
  skyGlobe: {
    "sky-color": "#c5e3f6",
    "horizon-color": "#94a3b8",
    "sky-horizon-blend": 0.35,
    "horizon-fog-blend": 0.2,
    "fog-color": "#e2e8f0",
    "fog-ground-blend": 0.08,
    "atmosphere-blend": 0.85,
  },
  lightGlobe: {
    anchor: "map",
    color: "#ffffff",
    intensity: 0.65,
    position: [1.15, 75, 45],
  },
  lightMercator: {
    anchor: "map",
    color: "#f8fafc",
    intensity: 0.5,
    position: [1.0, 88, 35],
  },
};

const SPECS: Record<ThemeId, MapThemeSpec> = {
  dark: DARK,
  dim: DIM,
  light: LIGHT,
};

export function mapThemeFor(theme: ThemeId): MapThemeSpec {
  return SPECS[theme] ?? DARK;
}

export function cartoRasterTileUrl(
  theme: ThemeId,
  x: number,
  y: number,
  level: number,
): string {
  return cartoRasterUrl(mapThemeFor(theme).cartoRasterPrefix, x, y, level);
}

/** @deprecated use mapThemeFor(theme).basemapGlStyle */
export const CARTO_DARK_MATTER_GL = DARK.basemapGlStyle;
