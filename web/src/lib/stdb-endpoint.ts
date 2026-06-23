import { stdbUriFromEnv } from "./native-config";

const STDB_PORT = 3000;

/** Hostnames that should use IPv4 loopback when STDB binds `127.0.0.1` only. */
const LOOPBACK_ALIASES = new Set(["localhost", "::1", "[::1]"]);

export function normalizeStdbHost(pageHost: string): string {
  const trimmed = pageHost.trim();
  if (LOOPBACK_ALIASES.has(trimmed.toLowerCase())) {
    return "127.0.0.1";
  }
  return trimmed;
}

export function normalizeWebSocketUri(uri: string): string {
  try {
    const url = new URL(uri);
    if (
      (url.protocol === "ws:" || url.protocol === "wss:") &&
      LOOPBACK_ALIASES.has(url.hostname.toLowerCase())
    ) {
      url.hostname = "127.0.0.1";
      return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
    }
  } catch {

  }
  return uri;
}

export function resolveStdbWebSocketUri(pageHost?: string): string {
  const fromEnv = stdbUriFromEnv();
  if (fromEnv) return normalizeWebSocketUri(fromEnv);

  const host =
    pageHost ??
    (typeof window !== "undefined" ? window.location.hostname : "127.0.0.1");
  const stdbHost = normalizeStdbHost(host);

  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return `wss://${stdbHost}:${STDB_PORT}`;
  }
  return `ws://${stdbHost}:${STDB_PORT}`;
}
