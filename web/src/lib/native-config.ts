import { buildEnvIngestBase, buildEnvLlmBase, buildEnvStdbUri } from "./mobile-build-env";
import { isNativeApp } from "./mobile-layout";
import {
  loadMobileRuntimeConfig,
  deploymentConfigEnabled,
  resolveRuntimeIngestBase,
  resolveRuntimeLlmBase,
  resolveRuntimeStdbUri,
} from "./mobile-runtime-config";

const DEFAULT_LLM_BASE = "/api/llm";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);


function preferViteProxyOnWebDev(base: string): string {
  if (!base || !import.meta.env.DEV || isNativeApp()) return base;
  try {
    if (LOOPBACK_HOSTS.has(new URL(base).hostname.toLowerCase())) return "";
  } catch {
  }
  return base;
}

function trimBase(raw: string | undefined): string {
  const t = raw?.trim();
  if (!t) return "";
  return t.replace(/\/$/, "");
}


export function joinServiceUrl(base: string, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const b = trimBase(base);
  return b ? `${b}${p}` : p;
}


export function ingestBaseUrl(): string {
  const baked = buildEnvIngestBase();
  if (deploymentConfigEnabled()) {
    return preferViteProxyOnWebDev(resolveRuntimeIngestBase() || baked);
  }
  return preferViteProxyOnWebDev(baked);
}

export function ingestUrl(path: string): string {
  return joinServiceUrl(ingestBaseUrl(), path);
}


export function llmBaseUrl(): string {
  const baked = buildEnvLlmBase();
  let base: string;
  if (deploymentConfigEnabled()) {
    base = resolveRuntimeLlmBase() || baked;
  } else {
    base = baked;
  }
  base = preferViteProxyOnWebDev(base);
  return base || DEFAULT_LLM_BASE;
}


export function stdbDatabaseName(): string {
  if (deploymentConfigEnabled()) {
    return loadMobileRuntimeConfig().stdbDb;
  }
  return (import.meta.env.VITE_STDB_DB as string | undefined)?.trim() || "openatlas";
}


export function stdbUriFromEnv(): string | undefined {
  const baked = buildEnvStdbUri();
  if (deploymentConfigEnabled()) {
    return resolveRuntimeStdbUri() || baked || undefined;
  }
  return baked || undefined;
}


export function ingestServiceConfigured(): boolean {
  return Boolean(ingestBaseUrl());
}


export function llmServiceConfigured(): boolean {
  const base = llmBaseUrl();
  return base.startsWith("http://") || base.startsWith("https://");
}


export function shouldProbeIngest(): boolean {
  if (ingestServiceConfigured()) return true;
  return import.meta.env.DEV;
}


export function shouldProbeLlm(): boolean {
  if (llmServiceConfigured()) return true;
  return import.meta.env.DEV;
}


export { isNativeApp };
