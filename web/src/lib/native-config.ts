/**
 * Service base URLs for Capacitor / custom deployments.
 *
 * Desktop web dev keeps same-origin relative paths (`/status`, `/api/llm`)
 * via the Vite proxy. Native builds must set `VITE_*` at build time — the
 * device cannot reach the dev machine on `127.0.0.1` without host aliases
 * (`10.0.2.2` on Android emulator, LAN IP on physical hardware).
 */

import { isNativeApp } from "./mobile-layout";

const DEFAULT_LLM_BASE = "/api/llm";

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
  return trimBase(import.meta.env.VITE_INGEST_BASE as string | undefined);
}

export function ingestUrl(path: string): string {
  return joinServiceUrl(ingestBaseUrl(), path);
}

/** LLM bridge base. Defaults to `/api/llm` (Vite proxy in dev). */
export function llmBaseUrl(): string {
  const fromEnv = trimBase(import.meta.env.VITE_LLM_BASE as string | undefined);
  return fromEnv || DEFAULT_LLM_BASE;
}

/** SpacetimeDB module name (build-time). */
export function stdbDatabaseName(): string {
  return (import.meta.env.VITE_STDB_DB as string | undefined)?.trim() || "openatlas";
}

/** Raw `VITE_STDB_URI` when set at build time (required for native against cloud/LAN). */
export function stdbUriFromEnv(): string | undefined {
  const raw = (import.meta.env.VITE_STDB_URI as string | undefined)?.trim();
  return raw || undefined;
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
