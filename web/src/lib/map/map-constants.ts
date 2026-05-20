/** MapLibre source / layer ids (z-order: first listed ≈ below). */

export const SRC_EVENTS = "openatlas-events";
export const SRC_CAUSAL = "openatlas-causal";
export const SRC_SOLAR = "openatlas-solar";
export const SRC_NIGHT = "openatlas-night";
export const SRC_ADMIN = "openatlas-admin";
export const SRC_DEMO = "openatlas-demo-layers";
/** Open-Meteo climate samples in the sim window (temperature field on 2D map). */
export const SRC_CLIMATE_WEATHER = "openatlas-climate-weather";
/** Public NORAD TLE, OpenSky ADS-B, sample maritime (see `/public/tracking/`). */
export const SRC_TRACKING = "openatlas-public-tracking";
export const SRC_TRACKING_PATHS = "openatlas-public-tracking-paths";

/** @deprecated use {@link layerHeatId} */
export const LAYER_HEAT = "openatlas-heat";
export const layerHeatId = (domainId: string): string =>
  `openatlas-heat-${domainId}`;
export const LAYER_DEMO_CONTOUR = "openatlas-demo-contour";
export const LAYER_DEMO_WIND = "openatlas-demo-wind";
export const LAYER_CLIMATE_TEMP = "openatlas-climate-temp";
export const LAYER_CAUSAL = "openatlas-causal-edges";
export const LAYER_POINTS = "openatlas-points";
export const LAYER_DEMO_TRANSPORT = "openatlas-demo-transport";
export const LAYER_TERM = "openatlas-terminator";
export const LAYER_NIGHT = "openatlas-night-fill";
export const LAYER_SUN = "openatlas-subsun";
export const LAYER_ADMIN_FILL = "openatlas-admin-fill";
export const LAYER_ADMIN_LINE = "openatlas-admin-line";
export const LAYER_ADMIN_HOVER = "openatlas-admin-hover";
export const LAYER_TRACKING = "openatlas-public-tracking";
export const LAYER_TRACKING_PATHS = "openatlas-public-tracking-paths";
