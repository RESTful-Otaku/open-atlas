/**
 * Resolve how a phone/emulator reaches the dev machine (ingest :8080, LLM :3847).
 */

export const EMULATOR_GATEWAY_HOST = "10.0.2.2";

type CapacitorGlobal = {
  getPlatform?: () => string;
};

function capacitorGlobal(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** Capacitor platform id (`android`, `ios`, `web`, …). */
export function capacitorPlatform(): string | undefined {
  return capacitorGlobal()?.getPlatform?.();
}

/**
 * Heuristic: Android emulator WebView (sdk_gphone, etc.).
 * Physical devices return false — they need a real LAN IP.
 */
export function isAndroidEmulator(): boolean {
  if (capacitorPlatform() !== "android") return false;
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /sdk_gphone|sdk_google_phone|Android SDK built for|emulator/i.test(ua);
}

export type DevHostInput = {
  lanHost: string;
  ingestBaseCustom?: string;
  /** When true, prefer 10.0.2.2 if lanHost is empty (Android emulator). */
  preferEmulatorGateway?: boolean;
};

/** Hostname for ingest/LLM on the dev machine (no port). Empty = not configured. */
export function resolveDevMachineHost(input: DevHostInput): string {
  const custom = input.ingestBaseCustom?.trim();
  if (custom) {
    try {
      return new URL(custom).hostname;
    } catch {
      /* ignore invalid custom URL */
    }
  }
  const lan = input.lanHost.trim();
  if (lan) return lan;
  if (input.preferEmulatorGateway ?? isAndroidEmulator()) {
    return EMULATOR_GATEWAY_HOST;
  }
  return "";
}

export function httpHostBase(host: string, port: number): string {
  const h = host.trim();
  if (!h) return "";
  return `http://${h}:${port}`;
}
