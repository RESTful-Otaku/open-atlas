/**
 * Operator LLM provider settings (localStorage). Used on mobile/desktop when
 * no local Ollama bridge is reachable — e.g. Gemini API from the device.
 */

import { isNativeApp } from "../mobile-layout";

export type LlmProviderId = "bridge" | "gemini" | "openai_compat";

export interface LlmProviderSettings {
  provider: LlmProviderId;
  geminiApiKey: string;
  geminiModel: string;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
  /** Force CPU-only inference on the Ollama bridge (num_gpu: 0). */
  cpuOnly: boolean;
}

const KEY = "openatlas-llm-providers";

export const DEFAULT_LLM_PROVIDER_SETTINGS: LlmProviderSettings = {
  provider: "bridge",
  geminiApiKey: "",
  geminiModel: "gemini-2.0-flash",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  cpuOnly: true,
};

function capacitorPlatform(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.();
}

/** First-run defaults: Gemini on native builds only (not web dev with baked VITE_*). */
export function defaultLlmProviderSettings(): LlmProviderSettings {
  const base = { ...DEFAULT_LLM_PROVIDER_SETTINGS };
  const native =
    isNativeApp() ||
    capacitorPlatform() === "android" ||
    capacitorPlatform() === "ios";
  if (!native) return base;
  const baked = (import.meta.env.VITE_NATIVE_DEFAULT_LLM as string | undefined)?.trim();
  if (baked === "gemini" || baked === "openai_compat") {
    return { ...base, provider: baked };
  }
  if (capacitorPlatform() === "android") {
    return { ...base, provider: "gemini" };
  }
  return base;
}

export function loadLlmProviderSettings(): LlmProviderSettings {
  const fallback = defaultLlmProviderSettings();
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<LlmProviderSettings>;
    return {
      ...DEFAULT_LLM_PROVIDER_SETTINGS,
      ...parsed,
      provider:
        parsed.provider === "gemini" ||
        parsed.provider === "openai_compat" ||
        parsed.provider === "bridge"
          ? parsed.provider
          : DEFAULT_LLM_PROVIDER_SETTINGS.provider,
    };
  } catch {
    return fallback;
  }
}

export function saveLlmProviderSettings(s: LlmProviderSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* */
  }
}
