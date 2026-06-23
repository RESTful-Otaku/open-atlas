

import type { Icon as IconComponent } from "@lucide/svelte";
import {
  Bug,
  Coins,
  Cpu,
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
  energy: PlugZap,
  finance: Landmark,
  climate: ThermometerSun,
  seismic: Mountain,
  transport: Ship,
  health: Stethoscope,
  geospatial: Satellite,
  economy: Coins,
  cyber: Bug,
  space: Orbit,
  infrastructure: HardHat,
};

const DEFAULT_ICON = Globe;

export function domainIcon(id: string): typeof IconComponent {
  return ICONS[id] ?? DEFAULT_ICON;
}

export const META_ICONS = {
  threatIndex: Siren,
  compute: Cpu,
  telemetry: RadioTower,
  radar: Radar,
} as const;
