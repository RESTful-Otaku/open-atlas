/**
 * Map from domain id to a lucide icon component. Centralised so any
 * panel or view that needs the per-domain glyph imports from one place.
 *
 * Icons are chosen to be **distinct from each other** and from common
 * shell affordances (globe, flat map, hub grid, viz gallery, matrices,
 * entities) so the left rail stays scannable at a glance.
 */

import type { Icon as IconComponent } from "@lucide/svelte";
import {
  Baby,
  Bug,
  Coins,
  Cpu,
  Flag,
  Globe,
  HardHat,
  Landmark,
  Mountain,
  Orbit,
  PlugZap,
  Radar,
  RadioTower,
  Satellite,
  Ship,
  Siren,
  Stethoscope,
  ThermometerSun,
} from "@lucide/svelte";

const ICONS: Readonly<Record<string, typeof IconComponent>> = {
  /** Grid / interconnects — not Zap (generic lightning). */
  energy: PlugZap,
  /** Institutions & policy — distinct from matrix `Banknote` / currency motifs. */
  finance: Landmark,
  /** Heat / insolation — not Cloud (ambiguous vs IT “cloud”). */
  climate: ThermometerSun,
  /** Crust / orogeny — not Activity (telemetry sparklines use it). */
  seismic: Mountain,
  /** Corridors & chokepoints — not Truck (transport matrix uses Truck). */
  transport: Ship,
  /** Clinical — not HeartPulse (health matrix uses HeartPulse). */
  health: Stethoscope,
  /** Remote sensing — not Map (2D map route uses Map). */
  geospatial: Satellite,
  /** Macro aggregates — not BarChart3 (viz gallery uses chart icon). */
  economy: Coins,
  /** Sovereignty — not ShieldAlert (threat matrix uses ShieldAlert). */
  geopolitics: Flag,
  /** Findings / vuln — not Shield (generic security chrome). */
  cyber: Bug,
  /** Orbital regime — not Rocket (launch cliché). */
  space: Orbit,
  /** Cohort / population pyramid lens — not Users (demographics matrix). */
  demographics: Baby,
  /** Field / civil works — not Building2 (generic “company”). */
  infrastructure: HardHat,
};

const DEFAULT_ICON = Globe;

export function domainIcon(id: string): typeof IconComponent {
  return ICONS[id] ?? DEFAULT_ICON;
}

/** Icons used by hub / matrix affordances that aren't tied to a domain. */
export const META_ICONS = {
  threatIndex: Siren,
  compute: Cpu,
  /** Mast / feed metaphor — not Database (Entities route uses Boxes). */
  telemetry: RadioTower,
  radar: Radar,
} as const;
