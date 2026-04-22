/**
 * Shared MapLibre presentation: working CARTO basemap URL, globe sky, and
 * light. The 3D “Earth” is MapLibre’s WebGL globe (vector + atmosphere), not
 * a separate three.js scene — same stack used in production geo UIs.
 */
import type { LightSpecification, Map, SkySpecification } from "maplibre-gl";

/**
 * CARTO Dark Matter for MapLibre GL **with labels** (stronger land/water read).
 * Note: `…/dark-matter-no-labels-gl-style/…` currently 404s on CARTO’s CDN; a
 * failed style load shows only the frame background and looks “blank”.
 */
export const CARTO_DARK_MATTER_GL =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/** Space + horizon: dark theme but not a featureless black void. */
const SKY_GLOBE_DARK: SkySpecification = {
  "sky-color": "#060d18",
  "horizon-color": "#4a6fa0",
  "sky-horizon-blend": 0.42,
  "horizon-fog-blend": 0.3,
  "fog-color": "#020810",
  "fog-ground-blend": 0.14,
  "atmosphere-blend": 0.92,
};

const LIGHT_GLOBE: LightSpecification = {
  anchor: "map",
  color: "#ffffff",
  intensity: 0.48,
  position: [1.2, 80, 50],
};

const LIGHT_MERCATOR: LightSpecification = {
  anchor: "map",
  color: "#e8f0ff",
  intensity: 0.35,
  position: [1.0, 90, 30],
};

export function applyMapPresentation(
  map: Map,
  mode: { projection: "globe" | "mercator" },
): void {
  if (mode.projection === "globe") {
    try {
      map.setSky(SKY_GLOBE_DARK);
    } catch {
      /* old builds / no sky */
    }
    try {
      map.setLight(LIGHT_GLOBE);
    } catch {
      /* */
    }
  } else {
    try {
      map.setLight(LIGHT_MERCATOR);
    } catch {
      /* */
    }
  }
}
