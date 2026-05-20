/**
 * Left-rail width: collapsed (icons) vs expanded (labels + blurb). Persisted
 * so the choice survives reloads.
 */
const KEY = "openatlas-rail-expanded";
const DOMAINS_KEY = "openatlas-rail-domains-open";

function readStorage(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

function readDomainsStorage(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(DOMAINS_KEY) === "1";
}

export const leftRail = $state({
  expanded: readStorage(),
});

/** Collapsible "Domains" group in the left rail (reduces 13-item noise). */
export const domainsRail = $state({
  expanded: readDomainsStorage(),
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

export function toggleDomainsRail(): void {
  setDomainsRailExpanded(!domainsRail.expanded);
}

export function setDomainsRailExpanded(next: boolean): void {
  if (domainsRail.expanded === next) return;
  domainsRail.expanded = next;
  try {
    localStorage.setItem(DOMAINS_KEY, next ? "1" : "0");
  } catch {
    /* private / quota */
  }
}
