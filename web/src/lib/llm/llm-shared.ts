/** Used by all providers: grounds the model to the provided JSON only. */
export const LLM_SYSTEM_PROMPT =
  "You are an operations analyst for OpenAtlas. Ground every claim in the JSON snapshot only. Be concise and quantitative.";

/** Extract a human-readable error message from any provider's JSON error body. */
export async function parseApiError(r: Response): Promise<string> {
  let detail = r.statusText;
  try {
    const err = (await r.json()) as { error?: { message?: string } | string };
    if (typeof err.error === "string") detail = err.error;
    else if (err.error?.message) detail = err.error.message;
  } catch {
    /* response body is not JSON — use statusText */
  }
  return detail;
}

/** Return an actionable hint if an Ollama CUDA error is detected in the message. */
export function cudaIncompatibilityHint(message: string): string {
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
