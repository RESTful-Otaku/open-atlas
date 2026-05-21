import { DOMAIN_CATALOG } from "../colors";

const KEY = "openatlas-map-domains";

const ALL_IDS: readonly string[] = DOMAIN_CATALOG.map((d) => d.id);

const VALID = new Set(ALL_IDS);

export function allDomainIds(): readonly string[] {
  return ALL_IDS;
}

/** First visit: no domain layers until the user opts in. */
export function defaultMapDomainSet(): Set<string> {
  return new Set();
}

/** True when a domain checkbox is on (empty set = none). */
export function isMapDomainEnabled(
  mapDomains: ReadonlySet<string>,
  domainId: string,
): boolean {
  return mapDomains.has(domainId);
}

export function mapDomainsActiveLabel(mapDomains: ReadonlySet<string>): string {
  const total = ALL_IDS.length;
  if (mapDomains.size === 0) return "None";
  if (mapDomains.size >= total) return "All";
  return `${mapDomains.size} of ${total}`;
}

/** Restore last session selection, or none if missing/invalid. */
export function loadMapDomainSet(): Set<string> {
  if (typeof sessionStorage === "undefined") {
    return defaultMapDomainSet();
  }
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return defaultMapDomainSet();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return defaultMapDomainSet();
    const out = new Set<string>();
    for (const x of arr) {
      if (typeof x === "string" && VALID.has(x)) out.add(x);
    }
    return out;
  } catch {
    return defaultMapDomainSet();
  }
}

export function saveMapDomainSet(s: ReadonlySet<string>): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* private mode, quota */
  }
}
