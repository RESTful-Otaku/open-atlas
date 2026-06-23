

export async function readResponseJson<T>(
  r: Response,
): Promise<{ ok: true; data: T } | { ok: false; err: string }> {
  const ct = (r.headers.get("content-type") ?? "").toLowerCase();
  const text = await r.text();
  const trimmed = text.trimStart();

  if (
    trimmed.startsWith("<") ||
    (!ct.includes("json") && trimmed.length > 0 && trimmed[0] !== "{" && trimmed[0] !== "[")
  ) {
    const hint =
      r.url && !r.url.startsWith("http")
        ? "Rebuild with VITE_INGEST_BASE (see docs/MOBILE.md)."
        : `Unexpected response from ${r.url || "service"}`;
    return {
      ok: false,
      err: `${hint} (${r.status} ${r.statusText || "non-JSON"})`,
    };
  }

  if (!trimmed) {
    return { ok: false, err: `Empty response (${r.status})` };
  }

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, err: `Invalid JSON: ${msg}` };
  }
}
