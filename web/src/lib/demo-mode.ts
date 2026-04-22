/**
 * Demo / test mode: drive the full UI from generated rows without
 * SpacetimeDB or ingest. Enable with `?demo=1`, `localStorage`, or
 * `VITE_DEMO_DATA=1` (build-time). When active, `dashboard.dataMode` is
 * `"demo"` (see `demo-install.svelte.ts`).
 */

const LS_KEY = "openatlas-demo-mode";

/**
 * Test mode: use URL `?demo=1`, `localStorage` openatlas-demo-mode=1, or
 * Vite `VITE_DEMO_DATA=1`.
 */
export function isDemoModeRequested(): boolean {
  if (import.meta.env.VITE_DEMO_DATA === "1") return true;
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("demo") === "1") {
    return true;
  }
  return window.localStorage.getItem(LS_KEY) === "1";
}

/**
 * Persist demo preference and reload (clears in-page STDB state).
 */
export function enableDemoModeAndReload(): void {
  localStorage.setItem(LS_KEY, "1");
  const u = new URL(window.location.href);
  u.searchParams.set("demo", "1");
  window.location.assign(u.toString());
}

/**
 * Return to live SpacetimeDB on next load.
 */
export function exitDemoModeAndReload(): void {
  localStorage.removeItem(LS_KEY);
  const u = new URL(window.location.href);
  u.searchParams.delete("demo");
  window.location.assign(u.toString());
}
