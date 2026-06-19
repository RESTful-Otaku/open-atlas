/**
 * Light coordination during route changes.
 * WebGL teardown is handled in each view's onDestroy (ThreeGlobe, WorldMap, etc.).
 */

let routeTransitioning = false;

/** Whether a route change is in progress (charts idle briefly). */
export function isRouteTransitioning(): boolean {
  return routeTransitioning;
}



