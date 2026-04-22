/**
 * Each domain desk picks a presentation profile so charts, map weight,
 * and “instrument” chrome match how that class of system is consumed.
 */

export type DeskProfile =
  | "geo_operational"
  | "markets"
  | "defensive_digital"
  | "life_sciences"
  | "orbital_regime"
  | "human_systems"
  | "geopolitical_layer";

const BY_DOMAIN: Readonly<Record<string, DeskProfile>> = {
  energy: "geo_operational",
  climate: "geo_operational",
  seismic: "geo_operational",
  transport: "geo_operational",
  geospatial: "geo_operational",
  infrastructure: "geo_operational",
  finance: "markets",
  economy: "markets",
  cyber: "defensive_digital",
  health: "life_sciences",
  space: "orbital_regime",
  demographics: "human_systems",
  geopolitics: "geopolitical_layer",
};

export function deskProfileForDomain(domainId: string): DeskProfile {
  return BY_DOMAIN[domainId] ?? "geo_operational";
}
