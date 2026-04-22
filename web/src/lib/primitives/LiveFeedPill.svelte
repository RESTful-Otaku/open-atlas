<!--
  Page-level SpacetimeDB / ingest status chip. The label reflects the
  dashboard connection; the whole control links to settings for
  WebSocket + operator notes.
-->
<script lang="ts">
  import { dashboard } from "../state.svelte";

  const LABELS: Record<typeof dashboard.connection, string> = {
    connecting: "Connecting Feed…",
    live: "Live Feed Active",
    offline: "Feed Offline",
  };
</script>

<a
  class="live-pill"
  data-state={dashboard.dataMode === "demo" ? "live" : dashboard.connection}
  href="#/settings"
  title={dashboard.dataMode === "demo"
    ? "Demo mode — not connected to a real feed. Open settings to leave demo."
    : "Open settings — SpacetimeDB URI, LLM bridge, and live feed notes"}
>
  <span class="live-dot" aria-hidden="true"></span>
  <span class="live-label"
    >{dashboard.dataMode === "demo"
      ? "Demo (offline APIs)"
      : LABELS[dashboard.connection]}</span
  >
</a>

<style>
  .live-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 5px 12px;
    border-radius: var(--radius-pill);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    font-size: 11px;
    font-weight: 500;
    color: var(--text-1);
    user-select: none;
    text-decoration: none;
  }
  .live-pill:hover {
    border-color: var(--border-2);
    background: var(--bg-3);
  }
  .live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
    transition: background var(--motion-med) var(--ease);
  }
  .live-pill[data-state="live"] .live-dot {
    background: var(--status-ok);
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
    animation: live-pulse 1.8s ease-in-out infinite;
  }
  .live-pill[data-state="connecting"] .live-dot {
    background: var(--status-warn);
  }
  .live-pill[data-state="offline"] .live-dot {
    background: var(--status-err);
  }

  @keyframes live-pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.6;
      transform: scale(1.2);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .live-pill[data-state="live"] .live-dot {
      animation: none;
    }
  }
</style>
