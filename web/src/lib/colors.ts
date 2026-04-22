/**
 * Canonical set of domain ids the UI knows about, paired with their
 * accent colour. Mirrors `openatlas_core::Domain` so filter values
 * match server-side event domains without runtime translation.
 *
 * Adding a new domain = add one entry here; panels pick it up through
 * {@link domainColor} and {@link DOMAIN_CATALOG}.
 */

export interface DomainEntry {
  readonly id: string;
  readonly label: string;
  readonly color: string;
}

export const DOMAIN_CATALOG: readonly DomainEntry[] = [
  { id: "energy", label: "Energy", color: "#f59e0b" },
  { id: "finance", label: "Finance", color: "#22c55e" },
  { id: "climate", label: "Climate", color: "#3b82f6" },
  { id: "seismic", label: "Seismic", color: "#ef4444" },
  { id: "transport", label: "Transport", color: "#14b8a6" },
  { id: "health", label: "Health", color: "#e11d48" },
  { id: "geospatial", label: "Geospatial", color: "#a855f7" },
  { id: "economy", label: "Economy", color: "#84cc16" },
  { id: "geopolitics", label: "Geopolitics", color: "#f97316" },
  { id: "cyber", label: "Cyber", color: "#ec4899" },
  { id: "space", label: "Space", color: "#6366f1" },
  { id: "demographics", label: "Demographics", color: "#fb7185" },
  { id: "infrastructure", label: "Infrastructure", color: "#0ea5e9" },
];

const FALLBACK_COLOR = "#cbd5e1";

const COLOR_BY_ID: ReadonlyMap<string, string> = new Map(
  DOMAIN_CATALOG.map((entry) => [entry.id, entry.color]),
);

export function domainColor(id: string): string {
  return COLOR_BY_ID.get(id) ?? FALLBACK_COLOR;
}

/** Parse `#RRGGBB` to rgba for MapLibre / canvas stops. */
export function hexToRgba(hex: string, alpha: number): string {
  if (hex.length === 7 && hex[0] === "#") {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return `rgba(148, 163, 184,${alpha})`;
}

export function domainLabel(id: string): string {
  return DOMAIN_CATALOG.find((entry) => entry.id === id)?.label ?? id;
}
