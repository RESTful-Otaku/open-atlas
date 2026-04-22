/**
 * Mapping between the numeric `u8` domain tag stored in SpacetimeDB and
 * the string ids used throughout the UI.
 *
 * # Why a separate module?
 *
 * The SpacetimeDB schema stores `domain` as a `u8` to keep the row shape
 * small and stable across wire-format changes (adding a new domain is a
 * pure additive evolution). The UI, however, was designed around string
 * ids so components can use them directly as CSS selector values,
 * React/Svelte keys, and look-up keys in `DOMAIN_CATALOG`.
 *
 * Keeping the mapping in one module means:
 *   * a single place to update when a new domain is added;
 *   * the rest of the UI never sees the numeric tag; and
 *   * the mapping is trivially unit-testable.
 *
 * The order below mirrors `openatlas_core::Domain` and the
 * `domain_to_u8` helper on the Rust ingest side (see
 * `openatlas-ingest/src/stdb.rs::domain_to_u8`). Changing the order in
 * one place without the other will silently miscategorise events.
 */

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

/**
 * Translate a numeric domain tag into the canonical UI id.
 * Returns `"unknown"` if the tag is outside the declared range — we
 * never panic in the UI; render a sentinel instead.
 */
export function domainIdFromTag(tag: number): string {
  return DOMAIN_BY_TAG[tag] ?? "unknown";
}

/**
 * Inverse of {@link domainIdFromTag}. Used by the filter control to
 * translate a selected domain id into a SpacetimeDB filter clause when
 * we construct a SQL subscription.
 */
export function tagFromDomainId(id: string): number | undefined {
  return TAG_BY_ID.get(id);
}

/**
 * Assertion that the two domain registries are in lockstep. Runs on
 * module load so a divergence is caught at page-load time rather than
 * silently dropping events.
 */
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
