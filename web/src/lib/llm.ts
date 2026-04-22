/**
 * Client for the optional `openatlas-llm-bridge` service, which talks to
 * a self-hosted Ollama instance (OpenAI-compatible `chat/completions`).
 *
 * The bridge is not part of SpacetimeDB: reducers stay deterministic;
 * this path is for operator-facing narrative analysis only.
 */

const DEFAULT_BASE = "/api/llm";

function llmBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_LLM_BASE as string | undefined;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  return DEFAULT_BASE;
}

export interface LlmInsightResponse {
  readonly text: string;
  readonly model: string;
  readonly ollama_base: string;
}

export interface LlmInsightErrorBody {
  readonly error?: string;
}

/**
 * Request a natural-language analysis grounded in the given snapshot
 * (see `buildLlmSnapshot`). Fails if the bridge or Ollama is down.
 */
export async function requestLlmInsight(
  snapshot: Record<string, unknown>,
  userPrompt?: string,
): Promise<LlmInsightResponse> {
  const url = `${llmBaseUrl()}/v1/insight`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      snapshot,
      user_prompt: userPrompt?.trim() || undefined,
    }),
  });
  if (!r.ok) {
    let msg = r.statusText;
    try {
      const body = (await r.json()) as LlmInsightErrorBody;
      if (body.error) msg = body.error;
    } catch {
      /* use status */
    }
    throw new Error(msg);
  }
  return (await r.json()) as LlmInsightResponse;
}

/**
 * `GET /v1/ready` on the bridge — Ollama must be up for this to succeed.
 */
export async function checkLlmBridgeReady(): Promise<boolean> {
  try {
    const r = await fetch(`${llmBaseUrl()}/v1/ready`, { method: "GET" });
    return r.ok;
  } catch {
    return false;
  }
}
