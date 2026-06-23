

const LS_KEY = "openatlas-demo-mode";


export function isDemoModeRequested(): boolean {
  if (import.meta.env.VITE_DEMO_DATA === "1") return true;
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("demo") === "1") {
    return true;
  }
  return window.localStorage.getItem(LS_KEY) === "1";
}


export function enableDemoModeAndReload(): void {
  localStorage.setItem(LS_KEY, "1");
  const u = new URL(window.location.href);
  u.searchParams.set("demo", "1");
  window.location.assign(u.toString());
}


export function exitDemoModeAndReload(): void {
  localStorage.removeItem(LS_KEY);
  const u = new URL(window.location.href);
  u.searchParams.delete("demo");
  window.location.assign(u.toString());
}
