import type { Map } from "maplibre-gl";

import { mapThemeFor } from "../theme-map";
import { readThemeFromDocument } from "../theme-events";

export { CARTO_DARK_MATTER_GL } from "../theme-map";

export function applyMapPresentation(
  map: Map,
  mode: { projection: "globe" | "mercator" },
  theme = readThemeFromDocument(),
): void {
  const spec = mapThemeFor(theme);
  if (mode.projection === "globe") {
    try {
      map.setSky(spec.skyGlobe);
    } catch {
      /* old builds / no sky */
    }
    try {
      map.setLight(spec.lightGlobe);
    } catch {
      /* */
    }
  } else {
    try {
      map.setLight(spec.lightMercator);
    } catch {
      /* */
    }
  }
}
