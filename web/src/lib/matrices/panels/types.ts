// Shared panel data shapes imported by builders.ts and each panel's .svelte.

import type { SeverityLevel, StatusLevel } from "../../primitives/status";

export interface CardListItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly severity?: SeverityLevel;
  readonly severityLabel?: string;
  readonly leftPair?: { label: string; value: string };
  readonly rightPair?: { label: string; value: string };
  readonly accent?: string;
  readonly href?: string;
}

export interface RegionBar {
  readonly label: string;
  readonly value: number;
  readonly tone?: "accent" | "warn" | "danger" | "good";
}

export interface StatusTableRow {
  readonly id: string;
  readonly primary: string;
  readonly secondary?: string;
  readonly status: StatusLevel;
  readonly statusLabel?: string;
  readonly right?: string;
  readonly href?: string;
}

export interface KpiCell {
  readonly label: string;
  readonly value: string;
  readonly valueNumber?: number;
  readonly delta?: number;
  readonly deltaLabel?: string;
  readonly direction?: "up-good" | "up-bad";
  readonly tone?: "default" | "warn" | "danger" | "accent";
}
