

function trimUrl(raw: string | undefined): string {
  return raw?.trim().replace(/\/$/, "") ?? "";
}

export function buildEnvIngestBase(): string {
  return trimUrl(import.meta.env.VITE_INGEST_BASE as string | undefined);
}

export function buildEnvLlmBase(): string {
  return trimUrl(import.meta.env.VITE_LLM_BASE as string | undefined);
}

export function buildEnvStdbUri(): string {
  return trimUrl(import.meta.env.VITE_STDB_URI as string | undefined);
}

export function buildEnvHasMobileRuntimeFlag(): boolean {
  return import.meta.env.VITE_MOBILE_RUNTIME_CONFIG === "1";
}

export function bakedEnvSummary(): string {
  const parts = [
    buildEnvStdbUri() ? `STDB=${buildEnvStdbUri()}` : null,
    buildEnvIngestBase() ? `ingest=${buildEnvIngestBase()}` : null,
    buildEnvLlmBase() ? `llm=${buildEnvLlmBase()}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "no service URLs baked";
}
