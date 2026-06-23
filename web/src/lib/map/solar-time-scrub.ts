export type SimMinOfDay = number;

export interface SolarPhase {
  readonly label: string;
  readonly icon: "moon" | "sunrise" | "sun" | "sunset";
}

export function formatUtcTimeLabel(minOfDay: SimMinOfDay): string {
  const h = Math.floor(minOfDay / 60);
  const m = minOfDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function solarPhaseForMin(minOfDay: SimMinOfDay): SolarPhase {
  const h = minOfDay / 60;
  if (h < 5 || h >= 21) return { label: "Night", icon: "moon" };
  if (h < 7) return { label: "Dawn", icon: "sunrise" };
  if (h < 17) return { label: "Day", icon: "sun" };
  if (h < 20) return { label: "Dusk", icon: "sunset" };
  return { label: "Night", icon: "moon" };
}

export function scrubPercent(minOfDay: SimMinOfDay): number {
  return (minOfDay / 1439) * 100;
}

export const SOLAR_TRACK_GRADIENT = `linear-gradient(
  to right,
  #0c1222 0%,
  #141c33 4%,
  #2a3560 6%,
  #c45c2a 8%,
  #f0a54a 10%,
  #fde68a 12%,
  #7dd3fc 18%,
  #38bdf8 28%,
  #5eb8f0 42%,
  #38bdf8 58%,
  #7dd3fc 72%,
  #fde68a 84%,
  #f0a54a 88%,
  #c45c2a 91%,
  #5b3a6e 94%,
  #1e2848 97%,
  #0c1222 100%
)`;
