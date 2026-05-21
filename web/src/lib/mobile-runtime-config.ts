/**
 * Runtime deployment overrides for Capacitor / native builds.
 * Lets one APK switch demo, Maincloud, local STDB, and optional LAN ingest/LLM
 * without rebuilding.
 */

import { buildEnvIngestBase, buildEnvLlmBase, buildEnvStdbUri } from "./mobile-build-env";
import {
  EMULATOR_GATEWAY_HOST,
  httpHostBase,
  isAndroidEmulator,
  resolveDevMachineHost,
} from "./dev-machine-host";
import { isNativeApp } from "./mobile-layout";

const LS_KEY = "openatlas-mobile-runtime-v1";

export const MAINCLOUD_STDB_WS = "wss://maincloud.spacetimedb.com";

/** Infer deployment profile from baked capacitor env (emulator vs LAN vs cloud-only). */
export function inferProfileFromBakedEnv(
  ingestBase = buildEnvIngestBase(),
  stdbUri = buildEnvStdbUri(),
): DeploymentProfileId {
  if (!ingestBase) {
    return "cloud_live";
  }
  try {
    const host = new URL(ingestBase).hostname;
    if (stdbUri.includes("maincloud") || stdbUri.includes("spacetimedb.com")) {
      return host === EMULATOR_GATEWAY_HOST ? "cloud_ingest_hybrid" : "cloud_ingest_live";
    }
    if (host === EMULATOR_GATEWAY_HOST) return "local_emulator";
    return "local_lan";
  } catch {
    return "cloud_ingest_hybrid";
  }
}
export const DEFAULT_STDB_DB = "openatlas";
/** @deprecated use EMULATOR_GATEWAY_HOST */
export const EMULATOR_HOST = EMULATOR_GATEWAY_HOST;
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
  | "local_sim"
  | "local_live"
  | "local_hybrid"
  | "local_lan"
  | "local_emulator"
  | "custom";

/** Loopback host for web dev (Vite proxies ingest/LLM on same origin). */
export const WEB_DEV_HOST = "127.0.0.1";

const CLOUD_INGEST_PROFILES = new Set<DeploymentProfileId>([
  "cloud_lan_ingest",
  "cloud_ingest_sim",
  "cloud_ingest_live",
  "cloud_ingest_hybrid",
]);

const LOCAL_INGEST_PROFILES = new Set<DeploymentProfileId>([
  "local_sim",
  "local_live",
  "local_hybrid",
  "local_lan",
  "local_emulator",
]);

export function profileUsesLanIngest(profile: DeploymentProfileId): boolean {
  return CLOUD_INGEST_PROFILES.has(profile) || LOCAL_INGEST_PROFILES.has(profile);
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
    case "local_sim":
      return "./dev.sh start:sim";
    case "local_live":
      return "./dev.sh start:live";
    case "local_hybrid":
      return "./dev.sh start:hybrid";
    case "local_lan":
      return "./dev.sh start:live";
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
    id: "local_sim",
    label: "Local STDB (sim)",
    description: "SpacetimeDB on this machine :3000 + ingest :8080 in sim mode.",
  },
  {
    id: "local_live",
    label: "Local STDB (live)",
    description: "SpacetimeDB on this machine :3000 + ingest :8080 with live feeds.",
  },
  {
    id: "local_hybrid",
    label: "Local STDB (hybrid)",
    description: "SpacetimeDB on this machine :3000 + ingest :8080 in hybrid mode.",
  },
  {
    id: "local_lan",
    label: "Local STDB (LAN)",
    description: "SpacetimeDB on dev machine at LAN IP :3000 + ingest :8080 (physical device / remote browser).",
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

/** True when Settings should expose deployment profiles (web + native). */
export function deploymentConfigEnabled(): boolean {
  if (import.meta.env.VITE_MOBILE_RUNTIME_CONFIG === "1") return true;
  if (isNativeApp()) return true;
  return typeof window !== "undefined";
}

/** @deprecated use {@link deploymentConfigEnabled} */
export function mobileRuntimeConfigEnabled(): boolean {
  return deploymentConfigEnabled();
}

/** Profiles shown in Settings for the current platform (hide emulator-only on web). */
export function deploymentProfilesForPlatform(): typeof DEPLOYMENT_PROFILES {
  if (isNativeApp()) return DEPLOYMENT_PROFILES;
  return DEPLOYMENT_PROFILES.filter((p) => p.id !== "local_emulator");
}

function defaultLanHostForPlatform(): string {
  if (isAndroidEmulator()) return EMULATOR_GATEWAY_HOST;
  if (!isNativeApp()) return WEB_DEV_HOST;
  return "";
}

/** Default deployment when nothing is saved (web → local live + Vite proxy). */
export function configDefaultForPlatform(): MobileRuntimeConfig {
  if (isNativeApp()) return configFromBuildEnv();
  return normalizeMobileRuntimeConfig(
    configForProfile("local_live", {
      ...DEFAULT_MOBILE_RUNTIME,
      lanHost: WEB_DEV_HOST,
    }),
  );
}

function trimUrl(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

function hostForLanProfiles(cfg: MobileRuntimeConfig): string {
  const resolved = resolveDevMachineHost({
    lanHost: cfg.lanHost,
    ingestBaseCustom: cfg.ingestBaseCustom,
    preferEmulatorGateway: isAndroidEmulator(),
  });
  if (resolved) return resolved;
  if (!isNativeApp()) return defaultLanHostForPlatform();
  return "";
}

/** Build a deployment config matching the APK's baked Vite env. */
export function configFromBuildEnv(): MobileRuntimeConfig {
  const ingest = buildEnvIngestBase();
  const profile = inferProfileFromBakedEnv(ingest, buildEnvStdbUri());
  let lanHost = "";
  if (ingest) {
    try {
      lanHost = new URL(ingest).hostname;
    } catch {
      /* use profile defaults */
    }
  }
  return normalizeMobileRuntimeConfig(
    configForProfile(profile, {
      ...DEFAULT_MOBILE_RUNTIME,
      lanHost,
      stdbUriCustom: buildEnvStdbUri() || MAINCLOUD_STDB_WS,
      ingestBaseCustom: ingest,
      llmBaseCustom: buildEnvLlmBase(),
    }),
  );
}

/**
 * When the APK baked ingest/LLM URLs but saved runtime profile is cloud_live (no ingest),
 * align so probes and feeds use the dev machine.
 */
export function alignConfigWithBuildEnv(cfg: MobileRuntimeConfig): MobileRuntimeConfig {
  const ingestBaked = buildEnvIngestBase();
  if (!ingestBaked) return normalizeMobileRuntimeConfig(cfg);
  if (resolveIngestBaseFromConfig(cfg)) return normalizeMobileRuntimeConfig(cfg);
  return configFromBuildEnv();
}

/** First launch / APK upgrade: seed or repair localStorage from baked env. */
export function seedRuntimeConfigFromBuildEnv(): void {
  if (!deploymentConfigEnabled() || typeof localStorage === "undefined") return;
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) {
    saveMobileRuntimeConfig(configDefaultForPlatform());
    return;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<MobileRuntimeConfig>;
    const rawProfile = parsed.profile as DeploymentProfileId;
    const profile =
      rawProfile === "cloud_lan_ingest"
        ? "cloud_ingest_hybrid"
        : DEPLOYMENT_PROFILES.some((p) => p.id === rawProfile)
          ? rawProfile
          : DEFAULT_MOBILE_RUNTIME.profile;
    const loaded: MobileRuntimeConfig = {
      ...DEFAULT_MOBILE_RUNTIME,
      ...parsed,
      profile,
      lanHost: String(parsed.lanHost ?? "").trim(),
      stdbUriCustom: trimUrl(String(parsed.stdbUriCustom ?? MAINCLOUD_STDB_WS)),
      ingestBaseCustom: trimUrl(String(parsed.ingestBaseCustom ?? "")),
      llmBaseCustom: trimUrl(String(parsed.llmBaseCustom ?? "")),
      stdbDb: String(parsed.stdbDb ?? DEFAULT_STDB_DB).trim() || DEFAULT_STDB_DB,
    };
    const aligned = alignConfigWithBuildEnv(loaded);
    saveMobileRuntimeConfig(aligned);
  } catch {
    saveMobileRuntimeConfig(configFromBuildEnv());
  }
}

export function loadMobileRuntimeConfig(): MobileRuntimeConfig {
  if (typeof localStorage === "undefined") return configDefaultForPlatform();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return configDefaultForPlatform();
    const parsed = JSON.parse(raw) as Partial<MobileRuntimeConfig>;
    const rawProfile = parsed.profile as DeploymentProfileId;
    const profile =
      rawProfile === "cloud_lan_ingest"
        ? "cloud_ingest_hybrid"
        : DEPLOYMENT_PROFILES.some((p) => p.id === rawProfile)
          ? rawProfile
          : DEFAULT_MOBILE_RUNTIME.profile;
    const loaded: MobileRuntimeConfig = {
      ...DEFAULT_MOBILE_RUNTIME,
      ...parsed,
      profile,
      lanHost: String(parsed.lanHost ?? "").trim(),
      stdbUriCustom: trimUrl(String(parsed.stdbUriCustom ?? MAINCLOUD_STDB_WS)),
      ingestBaseCustom: trimUrl(String(parsed.ingestBaseCustom ?? "")),
      llmBaseCustom: trimUrl(String(parsed.llmBaseCustom ?? "")),
      stdbDb: String(parsed.stdbDb ?? DEFAULT_STDB_DB).trim() || DEFAULT_STDB_DB,
    };
    if (
      loaded.ingestBaseCustom.includes("192.168.1.1") &&
      profileUsesLanIngest(profile)
    ) {
      loaded.lanHost = "";
      loaded.ingestBaseCustom = "";
      loaded.llmBaseCustom = "";
    }
    return alignConfigWithBuildEnv(normalizeMobileRuntimeConfig(loaded));
  } catch {
    return configDefaultForPlatform();
  }
}

export function saveMobileRuntimeConfig(cfg: MobileRuntimeConfig): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  } catch {
    /* private mode */
  }
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
    case "local_sim":
    case "local_live":
    case "local_hybrid":
    case "local_emulator":
      return `ws://${hostForLanProfiles(cfg) || WEB_DEV_HOST}:${DEFAULT_STDB_PORT}`;
    case "local_lan": {
      const host = hostForLanProfiles(cfg);
      return host ? `ws://${host}:${DEFAULT_STDB_PORT}` : undefined;
    }
    case "custom":
      return cfg.stdbUriCustom || MAINCLOUD_STDB_WS;
    default:
      return MAINCLOUD_STDB_WS;
  }
}

/** Resolved STDB WebSocket URI when runtime config is active on native builds. */
export function resolveRuntimeStdbUri(cfg = loadMobileRuntimeConfig()): string | undefined {
  if (!deploymentConfigEnabled()) return undefined;
  return resolveStdbUriFromConfig(cfg);
}

export function resolveIngestBaseFromConfig(cfg: MobileRuntimeConfig): string {
  if (cfg.profile === "demo") return "";
  const custom = trimUrl(cfg.ingestBaseCustom);
  if (custom) return custom;
  switch (cfg.profile) {
    case "cloud_live":
      return "";
    case "cloud_lan_ingest":
    case "cloud_ingest_sim":
    case "cloud_ingest_live":
    case "cloud_ingest_hybrid":
    case "local_sim":
    case "local_live":
    case "local_hybrid":
    case "local_lan":
    case "local_emulator": {
      const host = hostForLanProfiles(cfg);
      return httpHostBase(host, DEFAULT_INGEST_PORT);
    }
    case "custom":
      return "";
    default:
      return "";
  }
}

/** Ingest HTTP base when runtime config is active. */
export function resolveRuntimeIngestBase(cfg = loadMobileRuntimeConfig()): string {
  if (!deploymentConfigEnabled()) return "";
  return resolveIngestBaseFromConfig(cfg);
}

export function resolveLlmBaseFromConfig(cfg: MobileRuntimeConfig): string {
  if (cfg.profile === "demo") return "";
  const llmCustom = trimUrl(cfg.llmBaseCustom);
  if (llmCustom) return llmCustom;
  switch (cfg.profile) {
    case "cloud_lan_ingest":
    case "cloud_ingest_sim":
    case "cloud_ingest_live":
    case "cloud_ingest_hybrid":
    case "local_sim":
    case "local_live":
    case "local_hybrid":
    case "local_lan":
    case "local_emulator": {
      const host = hostForLanProfiles(cfg);
      return httpHostBase(host, DEFAULT_LLM_PORT);
    }
    case "custom":
      return "";
    default:
      return "";
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

/** Fill lanHost + ingest/LLM URLs before save (emulator → 10.0.2.2). */
export function normalizeMobileRuntimeConfig(cfg: MobileRuntimeConfig): MobileRuntimeConfig {
  if (cfg.profile === "demo" || cfg.profile === "cloud_live") return cfg;
  if (cfg.profile === "custom") return cfg;
  const host = hostForLanProfiles(cfg);
  if (!host) return cfg;
  return {
    ...cfg,
    lanHost: host,
    ingestBaseCustom:
      trimUrl(cfg.ingestBaseCustom) || httpHostBase(host, DEFAULT_INGEST_PORT),
    llmBaseCustom: trimUrl(cfg.llmBaseCustom) || httpHostBase(host, DEFAULT_LLM_PORT),
  };
}

export { isAndroidEmulator } from "./dev-machine-host";

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
    case "cloud_ingest_hybrid": {
      const host =
        prev.lanHost.trim() ||
        (isAndroidEmulator() ? EMULATOR_GATEWAY_HOST : "");
      return {
        ...base,
        stdbUriCustom: MAINCLOUD_STDB_WS,
        lanHost: host,
        ingestBaseCustom: host ? httpHostBase(host, DEFAULT_INGEST_PORT) : "",
        llmBaseCustom: host ? httpHostBase(host, DEFAULT_LLM_PORT) : "",
      };
    }
    case "local_lan": {
      const host =
        prev.lanHost.trim() ||
        (isAndroidEmulator() ? EMULATOR_GATEWAY_HOST : "");
      return {
        ...base,
        lanHost: host,
        stdbUriCustom: host ? `ws://${host}:${DEFAULT_STDB_PORT}` : base.stdbUriCustom,
        ingestBaseCustom: host ? httpHostBase(host, DEFAULT_INGEST_PORT) : "",
        llmBaseCustom: host ? httpHostBase(host, DEFAULT_LLM_PORT) : "",
      };
    }
    case "local_sim":
    case "local_live":
    case "local_hybrid": {
      const host = prev.lanHost.trim() || defaultLanHostForPlatform();
      return {
        ...base,
        lanHost: host,
        stdbUriCustom: `ws://${host}:${DEFAULT_STDB_PORT}`,
        ingestBaseCustom: httpHostBase(host, DEFAULT_INGEST_PORT),
        llmBaseCustom: httpHostBase(host, DEFAULT_LLM_PORT),
      };
    }
    case "local_emulator":
      return {
        ...base,
        lanHost: EMULATOR_GATEWAY_HOST,
        stdbUriCustom: `ws://${EMULATOR_GATEWAY_HOST}:${DEFAULT_STDB_PORT}`,
        ingestBaseCustom: httpHostBase(EMULATOR_GATEWAY_HOST, DEFAULT_INGEST_PORT),
        llmBaseCustom: httpHostBase(EMULATOR_GATEWAY_HOST, DEFAULT_LLM_PORT),
      };
    case "custom":
      return base;
    default:
      return base;
  }
}
