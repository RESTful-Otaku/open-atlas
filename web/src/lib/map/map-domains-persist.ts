import { DOMAIN_CATALOG } from "../colors";

const KEY = "openatlas-map-domains";

const ALL_IDS: readonly string[] = DOMAIN_CATALOG.map((d) => d.id);

const VALID = new Set(ALL_IDS);

export function allDomainIds(): readonly string[] {
  return ALL_IDS;
}

export function defaultMapDomainSet(): Set<string> {
  return new Set(ALL_IDS);
}

/** Restore last session selection, or all domains if missing/invalid. */
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
    return out.size > 0 ? out : defaultMapDomainSet();
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
