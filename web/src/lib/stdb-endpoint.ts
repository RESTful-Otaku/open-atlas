import { stdbUriFromEnv } from "./native-config";

/**
 * Resolves the SpacetimeDB WebSocket URL in the *browser*.
 *
 * If `VITE_STDB_URI` is set, it wins (required for production or custom
 * topologies). Otherwise we connect to the **same host** as the page, port
 * 3000, so Vite on `0.0.0.0:5173` can be opened as `http://<LAN-IP>:5173`
 * and the client still reaches SpacetimeDB on that machine.
 *
 * **Dev note:** `./dev.sh` starts SpacetimeDB on `127.0.0.1:3000` (IPv4
 * loopback only). On many Linux systems `localhost` resolves to `::1` first,
 * so `ws://localhost:3000` fails in Firefox while `ws://127.0.0.1:3000`
 * works. We normalise loopback hostnames to `127.0.0.1` unless the env
 * override is set.
 */

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
    /* not a URL — return unchanged */
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
