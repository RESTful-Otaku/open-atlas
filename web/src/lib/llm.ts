import { llmBaseUrl } from "./native-config";
import { probeFetch } from "./probe-fetch";


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


export async function checkLlmBridgePing(): Promise<boolean> {
  try {
    const r = await probeFetch(`${llmBaseUrl()}/v1/ready`, { method: "GET" }, 8_000);
    return r.ok;
  } catch {
    return false;
  }
}


export async function checkLlmBridgeCapable(): Promise<boolean> {
  const base = llmBaseUrl();
  if (!base) return false;
  try {
    const r = await fetch(`${base}/v1/capable`, {
      method: "GET",
      signal: AbortSignal.timeout(130_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}


