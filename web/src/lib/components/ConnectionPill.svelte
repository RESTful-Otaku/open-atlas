<script lang="ts">
  import { dashboard } from "../state.svelte";
  import { reconnectNow } from "../connection.svelte";

  const LABELS: Record<typeof dashboard.connection, string> = {
    connecting: "Connecting…",
    live: "Live",
    offline: "Offline",
  };

  const settingsTitle = $derived(
    dashboard.dataMode === "demo"
      ? "Synthetic demo data — no WebSocket. Settings still lists integration."
      : dashboard.connectionLastError
        ? `Last error: ${dashboard.connectionLastError} — open settings for URI/module help`
        : "View settings — SpacetimeDB connection and integration",
  );
</script>

<div class="conn-pill-group">
  {#if dashboard.dataMode === "demo"}
    <span class="demo-pill" title="View-only test dataset"
      >Demo data</span
    >
    <button
      type="button"
      class="reconnect"
      title="Re-seed the synthetic snapshot"
      onclick={() => reconnectNow()}>Reset demo</button
    >
  {:else if dashboard.connection === "offline"}
    <button
      type="button"
      class="reconnect"
      title="Tear down the socket and connect again (resets backoff)"
      onclick={() => reconnectNow()}>Reconnect</button
    >
  {/if}
  <a
    class="status-pill"
    data-state={dashboard.dataMode === "demo" ? "live" : dashboard.connection}
    data-demo={dashboard.dataMode === "demo" ? "true" : undefined}
    aria-live="polite"
    href="#/settings"
    title={settingsTitle}
  >
    <span class="status-dot" aria-hidden="true"></span>
    <span class="status-label">
      {dashboard.dataMode === "demo" ? "Preview" : LABELS[dashboard.connection]}
    </span>
  </a>
</div>

<style>
  .conn-pill-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .demo-pill {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--status-warn);
  }
  .reconnect {
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--accent);
    cursor: pointer;
  }
  .reconnect:hover {
    background: var(--bg-3);
    border-color: var(--border-2);
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 5px 10px 5px 8px;
    border-radius: var(--radius-pill);
    background: var(--overlay);
    border: 1px solid var(--border-1);
    font-size: 12px;
    color: var(--text-2);
    user-select: none;
    text-decoration: none;
  }
  .status-pill:hover {
    border-color: var(--border-2);
    color: var(--text-1);
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
    box-shadow: 0 0 0 3px transparent;
    transition:
      background var(--motion-med) var(--ease),
      box-shadow var(--motion-med) var(--ease);
  }

  .status-pill[data-state="live"] .status-dot {
    background: var(--status-ok);
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
    animation: pulse 1.8s ease-in-out infinite;
  }
  .status-pill[data-state="live"] .status-label {
    color: var(--text-1);
  }
  .status-pill[data-state="connecting"] .status-dot {
    background: var(--status-warn);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .status-pill[data-state="offline"] .status-dot {
    background: var(--status-err);
  }
  .status-pill[data-state="offline"] .status-label {
    color: var(--text-1);
  }

  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.25);
      opacity: 0.7;
    }
  }
</style>
