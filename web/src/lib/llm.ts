/**
 * Client for the optional `openatlas-llm-bridge` service, which talks to
 * a self-hosted Ollama instance (OpenAI-compatible `chat/completions`).
 *
 * The bridge is not part of SpacetimeDB: reducers stay deterministic;
 * this path is for operator-facing narrative analysis only.
 */

const DEFAULT_BASE = "/api/llm";
/** Match openatlas-llm-bridge default timeout (300s) with headroom. */
const INSIGHT_TIMEOUT_MS = 320_000;

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
function cudaIncompatibilityHint(message: string): string {
  const lower = message.toLowerCase();
  if (
    !lower.includes("cuda error") &&
    !lower.includes("architectural feature absent")
  ) {
    return "";
  }
  return (
    " Your GPU is incompatible with this Ollama CUDA build (common on GTX 10xx). " +
    "Stop the running `ollama serve`, then start CPU-only: `./scripts/ollama-serve-cpu.sh` " +
    "or `CUDA_VISIBLE_DEVICES=\"\" ollama serve`. Restart `./dev.sh llm:start` afterward."
  );
}

function llmFailureHint(status: number, message: string): string {
  const cuda = cudaIncompatibilityHint(message);
  if (cuda) return cuda;
  if (status === 404 || status === 502 || status === 503) {
    return " Start the bridge with ./dev.sh llm:start (or ./dev.sh up). In dev, Vite proxies /api/llm → :3847.";
  }
  if (status === 504) {
    return " The model may still be loading — try again or use a smaller Ollama model.";
  }
  return "";
}

export async function requestLlmInsight(
  snapshot: Record<string, unknown>,
  userPrompt?: string,
): Promise<LlmInsightResponse> {
  const url = `${llmBaseUrl()}/v1/insight`;
  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(INSIGHT_TIMEOUT_MS),
      body: JSON.stringify({
        snapshot,
        user_prompt: userPrompt?.trim() || undefined,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `${msg}. Is openatlas-llm-bridge running? Try ./dev.sh llm:start and ensure Vite dev proxies /api/llm.`,
    );
  }
  if (!r.ok) {
    let msg = r.statusText;
    try {
      const body = (await r.json()) as LlmInsightErrorBody;
      if (body.error) msg = body.error;
    } catch {
      /* use status */
    }
    throw new Error(`${msg}${llmFailureHint(r.status, msg)}`);
  }
  return (await r.json()) as LlmInsightResponse;
}

/**
 * `GET /v1/ready` — Ollama HTTP is up (fast; does not run inference).
 */
export async function checkLlmBridgePing(): Promise<boolean> {
  try {
    const r = await fetch(`${llmBaseUrl()}/v1/ready`, { method: "GET" });
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

/** Bridge + Ollama HTTP up (fast; does not run inference). */
export async function checkLlmBridgeReady(): Promise<boolean> {
  return checkLlmBridgePing();
}
