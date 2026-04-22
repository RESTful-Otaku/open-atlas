/**
 * Resolves the SpacetimeDB WebSocket URL in the *browser*.
 *
 * If `VITE_STDB_URI` is set, it wins (required for production or custom
 * topologies). Otherwise we connect to the **same host** as the page, port
 * 3000, so Vite on `0.0.0.0:5173` can be opened as `http://<LAN-IP>:5173`
 * and the client still reaches SpacetimeDB on that machine. The old default
 * `ws://127.0.0.1:3000` only worked when the UI was served from localhost.
 */
export function resolveStdbWebSocketUri(): string {
  const fromEnv = (import.meta.env.VITE_STDB_URI as string | undefined)?.trim();
  if (fromEnv) return fromEnv;
  if (typeof window === "undefined") {
    return "ws://127.0.0.1:3000";
  }
  const host = window.location.hostname;
  if (window.location.protocol === "https:") {
    return `wss://${host}:3000`;
  }
  return `ws://${host}:3000`;
}
