/**
 * @vitest-environment jsdom
 */

import { describe, expect, test, beforeEach } from "bun:test";
import {
  DEFAULT_LLM_PROVIDER_SETTINGS,
  defaultLlmProviderSettings,
  loadLlmProviderSettings,
  saveLlmProviderSettings,
} from "./llm-providers-persist";

// Provide a minimal localStorage shim so the persist layer can round-trip.
beforeEach(() => {
  const store = new Map<string, string>();
  // @ts-ignore
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
  } satisfies Storage;
});

describe("DEFAULT_LLM_PROVIDER_SETTINGS", () => {
  test("defaults to bridge provider", () => {
    expect(DEFAULT_LLM_PROVIDER_SETTINGS.provider).toBe("bridge");
  });

  test("has all required fields", () => {
    expect(DEFAULT_LLM_PROVIDER_SETTINGS.geminiApiKey).toBeString();
    expect(DEFAULT_LLM_PROVIDER_SETTINGS.geminiModel).toBeString();
    expect(DEFAULT_LLM_PROVIDER_SETTINGS.openaiBaseUrl).toBeString();
    expect(DEFAULT_LLM_PROVIDER_SETTINGS.openaiApiKey).toBeString();
    expect(DEFAULT_LLM_PROVIDER_SETTINGS.openaiModel).toBeString();
    expect(DEFAULT_LLM_PROVIDER_SETTINGS.cpuOnly).toBeBoolean();
  });

  test("cpuOnly defaults to true (safe default for mobile)", () => {
    expect(DEFAULT_LLM_PROVIDER_SETTINGS.cpuOnly).toBe(true);
  });
});

describe("defaultLlmProviderSettings", () => {
  test("returns bridge for non-native environment", () => {
    const s = defaultLlmProviderSettings();
    expect(s.provider).toBe("bridge");
  });

  test("returns a copy, not the original object", () => {
    const s = defaultLlmProviderSettings();
    s.provider = "gemini";
    expect(DEFAULT_LLM_PROVIDER_SETTINGS.provider).toBe("bridge");
  });
});

describe("saveLlmProviderSettings / loadLlmProviderSettings", () => {
  test("round-trips settings through localStorage", () => {
    const saved = {
      ...DEFAULT_LLM_PROVIDER_SETTINGS,
      provider: "gemini" as const,
      geminiApiKey: "test-key-123",
    };
    saveLlmProviderSettings(saved);
    const loaded = loadLlmProviderSettings();
    expect(loaded.provider).toBe("gemini");
    expect(loaded.geminiApiKey).toBe("test-key-123");
  });

  test("returns defaults when no settings saved", () => {
    localStorage.removeItem("openatlas-llm-providers");
    const loaded = loadLlmProviderSettings();
    expect(loaded.provider).toBe("bridge");
  });

  test("handles corrupt JSON gracefully", () => {
    localStorage.setItem("openatlas-llm-providers", "not-json-at-all");
    const loaded = loadLlmProviderSettings();
    expect(loaded.provider).toBe("bridge");
  });

  test("validates provider field against known values", () => {
    localStorage.setItem(
      "openatlas-llm-providers",
      JSON.stringify({ provider: "unknown_provider" }),
    );
    const loaded = loadLlmProviderSettings();
    expect(loaded.provider).toBe("bridge");
  });

  test("preserves all fields on partial save", () => {
    saveLlmProviderSettings({ provider: "openai_compat" } as any);
    const loaded = loadLlmProviderSettings();
    expect(loaded.provider).toBe("openai_compat");
    expect(loaded.geminiApiKey).toBe(
      DEFAULT_LLM_PROVIDER_SETTINGS.geminiApiKey,
    );
  });
});
