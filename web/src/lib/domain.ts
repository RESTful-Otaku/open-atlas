import { DOMAIN_CATALOG } from "./colors";

const DOMAIN_BY_TAG: readonly string[] = [
  "energy",
  "finance",
  "climate",
  "seismic",
  "transport",
  "health",
  "geospatial",
  "economy",
  "geopolitics",
  "cyber",
  "space",
  "demographics",
  "infrastructure",
];

const TAG_BY_ID: ReadonlyMap<string, number> = new Map(
  DOMAIN_BY_TAG.map((id, index) => [id, index]),
);


export function domainIdFromTag(tag: number): string {
  return DOMAIN_BY_TAG[tag] ?? "unknown";
}


export function tagFromDomainId(id: string): number | undefined {
  return TAG_BY_ID.get(id);
}


function assertCatalogAligned(): void {
  const catalogIds = DOMAIN_CATALOG.map((entry) => entry.id);
  const match =
    catalogIds.length === DOMAIN_BY_TAG.length &&
    catalogIds.every((id, idx) => id === DOMAIN_BY_TAG[idx]);
  if (!match) {
    console.error(
      "domain catalog / tag mapping mismatch",
      catalogIds,
      DOMAIN_BY_TAG,
    );
  }
}

assertCatalogAligned();
