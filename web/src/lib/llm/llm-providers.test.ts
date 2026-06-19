import { describe, expect, test, mock } from "bun:test";
import {
  activeLlmProviderLabel,
  usesClientSideLlm,
  checkLlmProviderReady,
  llmProviderStatusLine,
} from "./llm-providers";
import type { LlmProviderSettings } from "./llm-providers-persist";

const defaultSettings: LlmProviderSettings = {
  provider: "bridge",
  geminiApiKey: "",
  geminiModel: "gemini-2.0-flash",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  cpuOnly: true,
};

describe("activeLlmProviderLabel", () => {
  test('gemini → "Google Gemini"', () => {
    expect(activeLlmProviderLabel("gemini")).toBe("Google Gemini");
  });

  test('openai_compat → "OpenAI-compatible"', () => {
    expect(activeLlmProviderLabel("openai_compat")).toBe("OpenAI-compatible");
  });

  test('bridge → "Local bridge (Ollama)"', () => {
    expect(activeLlmProviderLabel("bridge")).toBe("Local bridge (Ollama)");
  });
});

describe("usesClientSideLlm", () => {
  test("gemini provider is client-side", () => {
    expect(usesClientSideLlm({ ...defaultSettings, provider: "gemini" })).toBe(
      true,
    );
  });

  test("openai_compat provider is client-side", () => {
    expect(
      usesClientSideLlm({ ...defaultSettings, provider: "openai_compat" }),
    ).toBe(true);
  });

  test("bridge provider is not client-side", () => {
    expect(usesClientSideLlm({ ...defaultSettings, provider: "bridge" })).toBe(
      false,
    );
  });
});

describe("checkLlmProviderReady", () => {
  test("gemini is ready when API key is set", async () => {
    const ready = await checkLlmProviderReady({
      ...defaultSettings,
      provider: "gemini",
      geminiApiKey: "AIza...",
    });
    expect(ready).toBe(true);
  });

  test("gemini is not ready when API key is empty", async () => {
    const ready = await checkLlmProviderReady({
      ...defaultSettings,
      provider: "gemini",
      geminiApiKey: "",
    });
    expect(ready).toBe(false);
  });

  test("gemini is not ready when API key is only whitespace", async () => {
    const ready = await checkLlmProviderReady({
      ...defaultSettings,
      provider: "gemini",
      geminiApiKey: "   ",
    });
    expect(ready).toBe(false);
  });

  test("openai_compat is ready when API key and URL are set", async () => {
    const ready = await checkLlmProviderReady({
      ...defaultSettings,
      provider: "openai_compat",
      openaiApiKey: "sk-...",
      openaiBaseUrl: "https://api.openai.com/v1",
    });
    expect(ready).toBe(true);
  });

  test("openai_compat is not ready when API key is empty", async () => {
    const ready = await checkLlmProviderReady({
      ...defaultSettings,
      provider: "openai_compat",
      openaiApiKey: "",
      openaiBaseUrl: "https://api.openai.com/v1",
    });
    expect(ready).toBe(false);
  });

  test("openai_compat is not ready when base URL is empty", async () => {
    const ready = await checkLlmProviderReady({
      ...defaultSettings,
      provider: "openai_compat",
      openaiApiKey: "sk-...",
      openaiBaseUrl: "",
    });
    expect(ready).toBe(false);
  });
});

describe("llmProviderStatusLine", () => {
  test("gemini with key shows model name", () => {
    const line = llmProviderStatusLine({
      ...defaultSettings,
      provider: "gemini",
      geminiApiKey: "key",
      geminiModel: "gemini-2.0-flash",
    });
    expect(line).toContain("Gemini");
    expect(line).toContain("gemini-2.0-flash");
  });

  test("gemini without key shows add key hint", () => {
    const line = llmProviderStatusLine({
      ...defaultSettings,
      provider: "gemini",
      geminiApiKey: "",
    });
    expect(line).toContain("add API key");
  });

  test("openai_compat with key shows model", () => {
    const line = llmProviderStatusLine({
      ...defaultSettings,
      provider: "openai_compat",
      openaiApiKey: "sk-...",
      openaiModel: "gpt-4o-mini",
    });
    expect(line).toContain("OpenAI-compat");
    expect(line).toContain("gpt-4o-mini");
  });

  test("openai_compat without key shows add key hint", () => {
    const line = llmProviderStatusLine({
      ...defaultSettings,
      provider: "openai_compat",
      openaiApiKey: "",
    });
    expect(line).toContain("add API key");
  });

  test("bridge shows dev proxy by default", () => {
    const line = llmProviderStatusLine({
      ...defaultSettings,
      provider: "bridge",
    });
    expect(line).toContain("Bridge");
    expect(line).toContain("/api/llm");
  });
});
