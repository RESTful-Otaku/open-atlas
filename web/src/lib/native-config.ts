/**
 * Service base URLs for Capacitor / custom deployments.
 *
 * Desktop web dev keeps same-origin relative paths (`/status`, `/api/llm`)
 * via the Vite proxy. Native builds must set `VITE_*` at build time — the
 * device cannot reach the dev machine on `127.0.0.1` without host aliases
 * (`10.0.2.2` on Android emulator, LAN IP on physical hardware).
 */

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

/** Web dev: use Vite same-origin proxy instead of absolute loopback URLs. */
function preferViteProxyOnWebDev(base: string): string {
  if (!base || !import.meta.env.DEV || isNativeApp()) return base;
  try {
    if (LOOPBACK_HOSTS.has(new URL(base).hostname.toLowerCase())) return "";
  } catch {
    /* keep base */
  }
  return base;
}

function trimBase(raw: string | undefined): string {
  const t = raw?.trim();
  if (!t) return "";
  return t.replace(/\/$/, "");
}

/** Join an optional absolute base with an API path (always starts with `/`). */
export function joinServiceUrl(base: string, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const b = trimBase(base);
  return b ? `${b}${p}` : p;
}

/** Ingest HTTP base (`openatlas-ingest` on :8080). Empty = same-origin / Vite proxy. */
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

/** LLM bridge base. Defaults to `/api/llm` (Vite proxy in dev). */
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

/** SpacetimeDB module name (build-time or mobile runtime override). */
export function stdbDatabaseName(): string {
  if (deploymentConfigEnabled()) {
    return loadMobileRuntimeConfig().stdbDb;
  }
  return (import.meta.env.VITE_STDB_DB as string | undefined)?.trim() || "openatlas";
}

/** Raw `VITE_STDB_URI` when set at build time (required for native against cloud/LAN). */
export function stdbUriFromEnv(): string | undefined {
  const baked = buildEnvStdbUri();
  if (deploymentConfigEnabled()) {
    return resolveRuntimeStdbUri() || baked || undefined;
  }
  return baked || undefined;
}

/** Ingest HTTP base is set (required on native; empty uses Vite proxy on web). */
export function ingestServiceConfigured(): boolean {
  return Boolean(ingestBaseUrl());
}

/** LLM bridge uses an absolute URL (required on native). */
export function llmServiceConfigured(): boolean {
  const base = llmBaseUrl();
  return base.startsWith("http://") || base.startsWith("https://");
}

/**
 * Whether ingest HTTP probes should run.
 * Without a baked `VITE_INGEST_BASE`, production/Capacitor must not call
 * relative `/status` (resolves to the WebView origin → HTML → JSON errors).
 * Vite dev uses the proxy with an empty base.
 */
export function shouldProbeIngest(): boolean {
  if (ingestServiceConfigured()) return true;
  return import.meta.env.DEV;
}

/**
 * Whether LLM bridge probes should run (same rules as ingest).
 */
export function shouldProbeLlm(): boolean {
  if (llmServiceConfigured()) return true;
  return import.meta.env.DEV;
}

/** Native Capacitor app (runtime; may be false briefly before `initMobileShell`). */
export { isNativeApp };
