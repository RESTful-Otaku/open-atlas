/**
 * Runtime deployment overrides for Capacitor / native builds.
 * Lets one APK switch demo, Maincloud, local STDB, and optional LAN ingest/LLM
 * without rebuilding.
 */

import { isNativeApp } from "./mobile-layout";

const LS_KEY = "openatlas-mobile-runtime-v1";

export const MAINCLOUD_STDB_WS = "wss://maincloud.spacetimedb.com";
export const DEFAULT_STDB_DB = "openatlas";
export const EMULATOR_HOST = "10.0.2.2";
export const DEFAULT_INGEST_PORT = 8080;
export const DEFAULT_LLM_PORT = 3847;
export const DEFAULT_STDB_PORT = 3000;

export type DeploymentProfileId =
  | "demo"
  | "cloud_live"
  /** @deprecated use cloud_ingest_* — still loaded from saved settings */
  | "cloud_lan_ingest"
  | "cloud_ingest_sim"
  | "cloud_ingest_live"
  | "cloud_ingest_hybrid"
  | "local_lan"
  | "local_emulator"
  | "custom";

const CLOUD_INGEST_PROFILES = new Set<DeploymentProfileId>([
  "cloud_lan_ingest",
  "cloud_ingest_sim",
  "cloud_ingest_live",
  "cloud_ingest_hybrid",
]);

export function profileUsesLanIngest(profile: DeploymentProfileId): boolean {
  return CLOUD_INGEST_PROFILES.has(profile) || profile === "local_lan";
}

/** `./dev.sh` ingest mode the operator should run on the dev machine for this profile. */
export function devIngestCommandForProfile(profile: DeploymentProfileId): string | null {
  switch (profile) {
    case "cloud_ingest_sim":
      return "OPENATLAS_INGEST_LAN_BIND=1 ./dev.sh start:cloud:sim";
    case "cloud_ingest_live":
      return "OPENATLAS_INGEST_LAN_BIND=1 ./dev.sh start:cloud:live";
    case "cloud_ingest_hybrid":
      return "OPENATLAS_INGEST_LAN_BIND=1 ./dev.sh start:cloud:hybrid";
    case "cloud_lan_ingest":
      return "OPENATLAS_INGEST_LAN_BIND=1 ./dev.sh start:cloud:hybrid";
    case "local_lan":
      return "OPENATLAS_INGEST_LAN_BIND=1 ./dev.sh start:live";
    case "local_emulator":
      return "./dev.sh start:hybrid";
    default:
      return null;
  }
}

export interface MobileRuntimeConfig {
  profile: DeploymentProfileId;
  /** Used when profile is local_lan, cloud_lan_ingest, or custom ingest. */
  lanHost: string;
  stdbUriCustom: string;
  ingestBaseCustom: string;
  llmBaseCustom: string;
  stdbDb: string;
}

export const DEFAULT_MOBILE_RUNTIME: MobileRuntimeConfig = {
  profile: "cloud_live",
  lanHost: "",
  stdbUriCustom: MAINCLOUD_STDB_WS,
  ingestBaseCustom: "",
  llmBaseCustom: "",
  stdbDb: DEFAULT_STDB_DB,
};

export const DEPLOYMENT_PROFILES: ReadonlyArray<{
  id: DeploymentProfileId;
  label: string;
  description: string;
}> = [
  {
    id: "demo",
    label: "Demo",
    description: "Synthetic data only — no SpacetimeDB or ingest.",
  },
  {
    id: "cloud_live",
    label: "Cloud live",
    description: "Maincloud SpacetimeDB only — live event stream, no ingest HTTP from the phone.",
  },
  {
    id: "cloud_ingest_sim",
    label: "Cloud + LAN ingest (sim)",
    description: "Maincloud STDB + ingest/LLM on your PC. Run start:cloud:sim on the host (same Wi‑Fi).",
  },
  {
    id: "cloud_ingest_live",
    label: "Cloud + LAN ingest (live)",
    description: "Maincloud STDB + ingest/LLM on your PC. Run start:cloud:live on the host.",
  },
  {
    id: "cloud_ingest_hybrid",
    label: "Cloud + LAN ingest (hybrid)",
    description: "Maincloud STDB + ingest/LLM on your PC. Run start:cloud:hybrid on the host.",
  },
  {
    id: "local_lan",
    label: "Local STDB (LAN)",
    description: "SpacetimeDB on dev machine at LAN IP :3000 + optional ingest :8080.",
  },
  {
    id: "local_emulator",
    label: "Local STDB (emulator)",
    description: "Android emulator → host via 10.0.2.2 (:3000 STDB, :8080 ingest).",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Set STDB WebSocket, ingest, and LLM URLs manually.",
  },
] as const;

/** True when Settings should expose deployment profiles (native app or explicit build flag). */
export function mobileRuntimeConfigEnabled(): boolean {
  if (import.meta.env.VITE_MOBILE_RUNTIME_CONFIG === "1") return true;
  return isNativeApp();
}

function trimUrl(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

export function loadMobileRuntimeConfig(): MobileRuntimeConfig {
  if (typeof localStorage === "undefined") return { ...DEFAULT_MOBILE_RUNTIME };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_MOBILE_RUNTIME };
    const parsed = JSON.parse(raw) as Partial<MobileRuntimeConfig>;
    const rawProfile = parsed.profile as DeploymentProfileId;
    const profile =
      rawProfile === "cloud_lan_ingest"
        ? "cloud_ingest_hybrid"
        : DEPLOYMENT_PROFILES.some((p) => p.id === rawProfile)
          ? rawProfile
          : DEFAULT_MOBILE_RUNTIME.profile;
    return {
      ...DEFAULT_MOBILE_RUNTIME,
      ...parsed,
      profile,
      lanHost: String(parsed.lanHost ?? "").trim(),
      stdbUriCustom: trimUrl(String(parsed.stdbUriCustom ?? MAINCLOUD_STDB_WS)),
      ingestBaseCustom: trimUrl(String(parsed.ingestBaseCustom ?? "")),
      llmBaseCustom: trimUrl(String(parsed.llmBaseCustom ?? "")),
      stdbDb: String(parsed.stdbDb ?? DEFAULT_STDB_DB).trim() || DEFAULT_STDB_DB,
    };
  } catch {
    return { ...DEFAULT_MOBILE_RUNTIME };
  }
}

export function saveMobileRuntimeConfig(cfg: MobileRuntimeConfig): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  } catch {
    /* private mode */
  }
}

function lanHostOrDefault(host: string): string {
  const h = host.trim();
  return h || "192.168.1.1";
}

function httpBase(host: string, port: number): string {
  return `http://${lanHostOrDefault(host)}:${port}`;
}

/** Resolve STDB URI from a config object (testable without native shell). */
export function resolveStdbUriFromConfig(cfg: MobileRuntimeConfig): string | undefined {
  if (cfg.profile === "demo") return undefined;
  switch (cfg.profile) {
    case "cloud_live":
    case "cloud_lan_ingest":
    case "cloud_ingest_sim":
    case "cloud_ingest_live":
    case "cloud_ingest_hybrid":
      return MAINCLOUD_STDB_WS;
    case "local_emulator":
      return `ws://${EMULATOR_HOST}:${DEFAULT_STDB_PORT}`;
    case "local_lan":
      return `ws://${lanHostOrDefault(cfg.lanHost)}:${DEFAULT_STDB_PORT}`;
    case "custom":
      return cfg.stdbUriCustom || MAINCLOUD_STDB_WS;
    default:
      return MAINCLOUD_STDB_WS;
  }
}

/** Resolved STDB WebSocket URI when runtime config is active on native builds. */
export function resolveRuntimeStdbUri(cfg = loadMobileRuntimeConfig()): string | undefined {
  if (!mobileRuntimeConfigEnabled()) return undefined;
  return resolveStdbUriFromConfig(cfg);
}

export function resolveIngestBaseFromConfig(cfg: MobileRuntimeConfig): string {
  if (cfg.profile === "demo") return "";
  switch (cfg.profile) {
    case "cloud_live":
      return "";
    case "cloud_lan_ingest":
    case "cloud_ingest_sim":
    case "cloud_ingest_live":
    case "cloud_ingest_hybrid":
    case "local_lan":
      return cfg.ingestBaseCustom || httpBase(cfg.lanHost, DEFAULT_INGEST_PORT);
    case "local_emulator":
      return cfg.ingestBaseCustom || httpBase(EMULATOR_HOST, DEFAULT_INGEST_PORT);
    case "custom":
      return cfg.ingestBaseCustom;
    default:
      return "";
  }
}

/** Ingest HTTP base when runtime config is active. */
export function resolveRuntimeIngestBase(cfg = loadMobileRuntimeConfig()): string {
  if (!mobileRuntimeConfigEnabled()) return "";
  return resolveIngestBaseFromConfig(cfg);
}

export function resolveLlmBaseFromConfig(cfg: MobileRuntimeConfig): string {
  if (cfg.profile === "demo") return "";
  const ing = resolveIngestBaseFromConfig(cfg);
  if (!ing && cfg.profile !== "custom") return "";
  switch (cfg.profile) {
    case "cloud_lan_ingest":
    case "cloud_ingest_sim":
    case "cloud_ingest_live":
    case "cloud_ingest_hybrid":
    case "local_lan":
      return cfg.llmBaseCustom || httpBase(cfg.lanHost, DEFAULT_LLM_PORT);
    case "local_emulator":
      return cfg.llmBaseCustom || httpBase(EMULATOR_HOST, DEFAULT_LLM_PORT);
    case "custom":
      return cfg.llmBaseCustom;
    default:
      return cfg.llmBaseCustom;
  }
}

/** LLM bridge base when runtime config is active. */
export function resolveRuntimeLlmBase(cfg = loadMobileRuntimeConfig()): string {
  if (!mobileRuntimeConfigEnabled()) return "";
  return resolveLlmBaseFromConfig(cfg);
}

export function profileWantsDemo(cfg = loadMobileRuntimeConfig()): boolean {
  return cfg.profile === "demo";
}

/** Apply profile fields when user picks a preset (keeps custom URLs when switching to custom). */
export function configForProfile(
  profile: DeploymentProfileId,
  prev: MobileRuntimeConfig,
): MobileRuntimeConfig {
  const base = { ...prev, profile };
  switch (profile) {
    case "demo":
      return base;
    case "cloud_live":
      return {
        ...base,
        stdbUriCustom: MAINCLOUD_STDB_WS,
        ingestBaseCustom: "",
        llmBaseCustom: "",
      };
    case "cloud_lan_ingest":
    case "cloud_ingest_sim":
    case "cloud_ingest_live":
    case "cloud_ingest_hybrid":
      return {
        ...base,
        stdbUriCustom: MAINCLOUD_STDB_WS,
        ingestBaseCustom: prev.lanHost
          ? httpBase(prev.lanHost, DEFAULT_INGEST_PORT)
          : "",
        llmBaseCustom: prev.lanHost ? httpBase(prev.lanHost, DEFAULT_LLM_PORT) : "",
      };
    case "local_lan":
      return {
        ...base,
        stdbUriCustom: prev.lanHost
          ? `ws://${lanHostOrDefault(prev.lanHost)}:${DEFAULT_STDB_PORT}`
          : base.stdbUriCustom,
        ingestBaseCustom: prev.lanHost
          ? httpBase(prev.lanHost, DEFAULT_INGEST_PORT)
          : "",
        llmBaseCustom: prev.lanHost ? httpBase(prev.lanHost, DEFAULT_LLM_PORT) : "",
      };
    case "local_emulator":
      return {
        ...base,
        stdbUriCustom: `ws://${EMULATOR_HOST}:${DEFAULT_STDB_PORT}`,
        ingestBaseCustom: httpBase(EMULATOR_HOST, DEFAULT_INGEST_PORT),
        llmBaseCustom: httpBase(EMULATOR_HOST, DEFAULT_LLM_PORT),
      };
    case "custom":
      return base;
    default:
      return base;
  }
}
