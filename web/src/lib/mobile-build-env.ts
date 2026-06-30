

function trimUrl(raw: string | undefined): string {
  return raw?.trim().replace(/\/$/, "") ?? "";
}

function readEnv(key: string): string {
  const fromMeta = import.meta.env[key as keyof ImportMeta["env"]] as string | undefined;
  if (fromMeta) return trimUrl(fromMeta);
  if (typeof process !== "undefined") {
    const fromProc = (process.env as Record<string, string | undefined>)[key];
    if (fromProc) return trimUrl(fromProc);
  }
  return "";
}

export function buildEnvIngestBase(): string {
  return readEnv("VITE_INGEST_BASE");
}

export function buildEnvLlmBase(): string {
  return readEnv("VITE_LLM_BASE");
}

export function buildEnvStdbUri(): string {
  return readEnv("VITE_STDB_URI");
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
