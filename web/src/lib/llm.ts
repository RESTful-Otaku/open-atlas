/**
 * Client for the optional `openatlas-llm-bridge` service, which talks to
 * a self-hosted Ollama instance (OpenAI-compatible `chat/completions`).
 *
 * The bridge is not part of SpacetimeDB: reducers stay deterministic;
 * this path is for operator-facing narrative analysis only.
 */

import { llmBaseUrl } from "./native-config";
import { probeFetch } from "./probe-fetch";

/** Default insight timeout (slow CPU models). Override: VITE_LLM_INSIGHT_TIMEOUT_MS */
export { llmBaseUrl };

export interface LlmInsightResponse {
  readonly text: string;
  readonly model: string;
  readonly ollama_base: string;
}

export async function requestLlmInsight(
  snapshot: Record<string, unknown>,
  userPrompt?: string,
  options?: { retries?: number },
): Promise<LlmInsightResponse> {
  const { requestProviderLlmInsight } = await import("./llm/llm-providers");
  const retries = options?.retries ?? 2;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
      return await requestProviderLlmInsight(snapshot, userPrompt);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt >= retries) break;
    }
  }
  throw lastErr ?? new Error("LLM request failed");
}

/**
 * `GET /v1/ready` — Ollama HTTP is up (fast; does not run inference).
 */
export async function checkLlmBridgePing(): Promise<boolean> {
  try {
    const r = await probeFetch(`${llmBaseUrl()}/v1/ready`, { method: "GET" }, 8_000);
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * `GET /v1/capable` — runs a tiny model completion (catches CUDA / load errors).
 * Used for Hub gating; may take up to ~2 minutes on cold CPU load.
 */
export async function checkLlmBridgeCapable(): Promise<boolean> {
  try {
    const r = await fetch(`${llmBaseUrl()}/v1/capable`, {
      method: "GET",
      signal: AbortSignal.timeout(130_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}


