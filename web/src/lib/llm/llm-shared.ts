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
