/**
 * Left-rail width: collapsed (icons) vs expanded (labels + blurb). Persisted
 * so the choice survives reloads.
 */
const KEY = "openatlas-rail-expanded";

function readStorage(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

export const leftRail = $state({
  expanded: readStorage(),
});

export function toggleLeftRail(): void {
  setLeftRailExpanded(!leftRail.expanded);
}

export function setLeftRailExpanded(next: boolean): void {
  if (leftRail.expanded === next) return;
  leftRail.expanded = next;
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* private / quota */
  }
}
