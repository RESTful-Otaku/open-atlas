/**
 * Light coordination during route changes — cancel pending dashboard work.
 * WebGL teardown is handled in each view's onDestroy (ThreeGlobe, WorldMap, etc.).
 */
import { cancelScheduledDashboardFlush } from "./dashboard-flush";

let routeTransitioning = false;

/** Whether a route change is in progress (charts idle briefly). */
export function isRouteTransitioning(): boolean {
  return routeTransitioning;
}

/** Call before swapping routes; always completes (never throws). */
export function beginRouteTransition(): void {
  routeTransitioning = true;
  cancelScheduledDashboardFlush();
}

export function endRouteTransition(): void {
  routeTransitioning = false;
}

/** Yield one frame so Svelte can run destroy hooks before the next mount. */
export function waitForRouteTeardown(): Promise<void> {
  beginRouteTransition();
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        endRouteTransition();
        resolve();
      });
    });
  });
}
