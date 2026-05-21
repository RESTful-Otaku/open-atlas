/**
 * Bounded-timeout fetch for ingest/LLM health probes (avoids hung requests on mobile WebViews).
 */

const DEFAULT_PROBE_TIMEOUT_MS = 12_000;

export async function probeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}
