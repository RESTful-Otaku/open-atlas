import { requestGeminiInsight } from "./gemini-client";
import { LLM_SYSTEM_PROMPT, parseApiError, cudaIncompatibilityHint } from "./llm-shared";
import {
  loadLlmProviderSettings,
  type LlmProviderId,
  type LlmProviderSettings,
} from "./llm-providers-persist";
import { llmBaseUrl, llmServiceConfigured, shouldProbeLlm } from "../native-config";
import { probeFetch } from "../probe-fetch";
import type { LlmInsightResponse } from "../llm";

export { loadLlmProviderSettings, saveLlmProviderSettings, DEFAULT_LLM_PROVIDER_SETTINGS } from "./llm-providers-persist";
export type { LlmProviderId, LlmProviderSettings } from "./llm-providers-persist";

export function activeLlmProviderLabel(id: LlmProviderId): string {
  switch (id) {
    case "gemini":
      return "Google Gemini";
    case "openai_compat":
      return "OpenAI-compatible";
    default:
      return "Local bridge (Ollama)";
  }
}

export function usesClientSideLlm(settings = loadLlmProviderSettings()): boolean {
  return settings.provider === "gemini" || settings.provider === "openai_compat";
}

export async function checkLlmProviderReady(
  settings = loadLlmProviderSettings(),
): Promise<boolean> {
  if (settings.provider === "gemini") {
    return Boolean(settings.geminiApiKey.trim());
  }
  if (settings.provider === "openai_compat") {
    return Boolean(settings.openaiApiKey.trim() && settings.openaiBaseUrl.trim());
  }
  if (!shouldProbeLlm()) return false;
  try {
    const r = await probeFetch(`${llmBaseUrl()}/v1/ready`, { method: "GET" }, 8_000);
    return r.ok;
  } catch {
    return false;
  }
}

async function requestOpenAiCompatInsight(
  settings: LlmProviderSettings,
  snapshot: Record<string, unknown>,
  userPrompt?: string,
): Promise<LlmInsightResponse> {
  const base = settings.openaiBaseUrl.replace(/\/$/, "");
  const key = settings.openaiApiKey.trim();
  const model = settings.openaiModel.trim() || "gpt-4o-mini";
  if (!key) throw new Error("OpenAI API key is empty");

  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        { role: "system", content: LLM_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            (userPrompt?.trim() ? `${userPrompt.trim()}\n\n` : "") +
            JSON.stringify(snapshot),
        },
      ],
    }),
  });

  if (!r.ok) {
    const detail = await parseApiError(r);
    throw new Error(`OpenAI API ${r.status}: ${detail}`);
  }

  const body = (await r.json()) as {
    choices?: { message?: { content?: string } }[];
    model?: string;
  };
  const text = body.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("OpenAI returned an empty response");
  return { text, model: body.model ?? model, ollama_base: base };
}

async function requestBridgeInsight(
  snapshot: Record<string, unknown>,
  userPrompt?: string,
  settings = loadLlmProviderSettings(),
): Promise<LlmInsightResponse> {
  const url = `${llmBaseUrl()}/v1/insight`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      snapshot,
      user_prompt: userPrompt?.trim() || undefined,
      cpu_only: settings.cpuOnly || undefined,
    }),
  });
  if (!r.ok) {
    const msg = await parseApiError(r);
    const cuda = cudaIncompatibilityHint(msg);
    throw new Error(cuda ? `${msg} — ${cuda}` : msg);
  }
  return (await r.json()) as LlmInsightResponse;
}

export async function requestProviderLlmInsight(
  snapshot: Record<string, unknown>,
  userPrompt?: string,
  settings = loadLlmProviderSettings(),
): Promise<LlmInsightResponse> {
  switch (settings.provider) {
    case "gemini": {
      const g = await requestGeminiInsight(
        settings.geminiApiKey,
        settings.geminiModel,
        snapshot,
        userPrompt,
      );
      return { text: g.text, model: g.model, ollama_base: "gemini" };
    }
    case "openai_compat":
      return await requestOpenAiCompatInsight(settings, snapshot, userPrompt);
    default:
      return await requestBridgeInsight(snapshot, userPrompt, settings);
  }
}

export function llmProviderStatusLine(settings = loadLlmProviderSettings()): string {
  if (settings.provider === "gemini") {
    return settings.geminiApiKey.trim()
      ? `Gemini · ${settings.geminiModel}`
      : "Gemini — add API key in Settings";
  }
  if (settings.provider === "openai_compat") {
    return settings.openaiApiKey.trim()
      ? `OpenAI-compat · ${settings.openaiModel}`
      : "OpenAI-compat — add API key in Settings";
  }
  if (llmServiceConfigured()) {
    return `Bridge · ${llmBaseUrl()}`;
  }
  return "Bridge · /api/llm (dev proxy)";
}
