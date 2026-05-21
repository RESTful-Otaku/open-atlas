import type { Component } from "svelte";
import {
  BookOpen,
  Cpu,
  FlaskConical,
  Radio,
  Settings as SettingsIcon,
} from "@lucide/svelte";

export type SettingsSectionId =
  | "stdb"
  | "ops"
  | "appearance"
  | "demo"
  | "ingest"
  | "llm"
  | "feeds";

export type SettingsSectionMeta = {
  id: SettingsSectionId;
  title: string;
  icon: Component;
  /** Desktop-only anchor id (e.g. ops console). */
  anchorId?: string;
  class?: string;
};

export const SETTINGS_SECTIONS: readonly SettingsSectionMeta[] = [
  { id: "stdb", title: "SpacetimeDB stream", icon: Radio, anchorId: "stdb", class: "settings-group" },
  {
    id: "ops",
    title: "Operations console",
    icon: Radio,
    anchorId: "ops-console",
    class: "card--wide card--ops settings-group",
  },
  { id: "appearance", title: "Appearance", icon: SettingsIcon, class: "settings-group" },
  { id: "demo", title: "Demo / test data (no backend)", icon: FlaskConical },
  { id: "ingest", title: "Ingest service", icon: Radio },
  { id: "llm", title: "LLM providers", icon: Cpu, class: "settings-group" },
  { id: "feeds", title: "Public APIs & live feeds", icon: BookOpen },
] as const;
