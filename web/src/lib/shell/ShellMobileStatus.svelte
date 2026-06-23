<script lang="ts">
  import { Database, RadioTower, Sparkles } from "@lucide/svelte";

  import { feedLive, feedSummaryTier, summarizeFeeds } from "../feed-live.svelte";
  import { shouldProbeIngest, shouldProbeLlm } from "../native-config";
  import { usesClientSideLlm } from "../llm/llm-providers";
  import { readiness } from "../readiness.svelte";
  import { dashboard } from "../state.svelte";
  import type { ConnectionState } from "../types";

  type Pillar = "live" | "degraded" | "unknown" | "offline";

  function feedPillar(dataMode: typeof dashboard.dataMode, c: ConnectionState): Pillar {
    if (dataMode === "demo") return "degraded";
    if (c === "live") return "live";
    if (c === "connecting") return "degraded";
    return "offline";
  }

  function boolPillar(v: boolean | null): Pillar {
    if (v === null) return "unknown";
    return v ? "live" : "offline";
  }

  function mergeIngestFeeds(ingest: Pillar, feeds: Pillar): Pillar {
    if (ingest === "offline" || feeds === "offline") return "offline";
    if (ingest === "degraded" || feeds === "degraded") return "degraded";
    if (ingest === "unknown" || feeds === "unknown") return "unknown";
    return "live";
  }

  function tierPulses(tier: Pillar): boolean {
    return tier === "unknown" || tier === "degraded";
  }

  const stdb = $derived(feedPillar(dashboard.dataMode, dashboard.connection));
  const probeIngest = $derived(shouldProbeIngest());
  const ingest = $derived(
    probeIngest ? boolPillar(readiness.ingestReady) : ("unknown" as Pillar),
  );
  const llm = $derived(
    usesClientSideLlm() || shouldProbeLlm()
      ? boolPillar(readiness.llmReady)
      : ("unknown" as Pillar),
  );
  const feedSummary = $derived(probeIngest ? summarizeFeeds(feedLive.catalog) : null);
  const feedsFromIngest = $derived(feedSummaryTier(feedSummary));
  const feeds = $derived(
    probeIngest ? feedsFromIngest : stdb === "live" ? ("live" as Pillar) : stdb,
  );
  const feedsIngest = $derived(
    probeIngest ? mergeIngestFeeds(ingest, feedsFromIngest) : feeds,
  );

  const stdbPulse = $derived(
    dashboard.dataMode !== "demo" && dashboard.connection === "connecting",
  );
  const feedsPulse = $derived(
    probeIngest &&
      (feedLive.loading ||
        readiness.ingestReady === null ||
        tierPulses(feedsIngest)),
  );
  const llmPulse = $derived(
    (usesClientSideLlm() || shouldProbeLlm()) &&
      (readiness.llmReady === null || tierPulses(llm)),
  );

  const stdbTitle = $derived(
    dashboard.dataMode === "demo"
      ? "Demo data — Settings to connect SpacetimeDB"
      : dashboard.connectionLastError
        ? `SpacetimeDB: ${dashboard.connectionLastError}`
        : dashboard.connection === "connecting"
          ? "Connecting to SpacetimeDB…"
          : "SpacetimeDB connection",
  );

  const feedsTitle = $derived(
    dashboard.dataMode === "demo"
      ? "Demo mode — no live ingest"
      : !probeIngest
        ? dashboard.connection === "live"
          ? "Live data via SpacetimeDB (cloud ingest runs on server)"
          : dashboard.connectionLastError
            ? `SpacetimeDB: ${dashboard.connectionLastError}`
            : "Connecting to SpacetimeDB for live feeds"
        : readiness.ingestReady === false
          ? "Ingest service down"
          : feedSummary
            ? `${feedSummary.ok}/${feedSummary.total} feeds OK`
            : feedLive.error
              ? feedLive.error
              : feedLive.loading
                ? "Checking ingest & feeds…"
                : "Ingest & open-data feeds",
  );

  const llmTitle = $derived(
    readiness.llmReady === false
      ? usesClientSideLlm()
        ? "LLM provider not configured"
        : "LLM bridge down"
      : readiness.llmReady === null
        ? "Checking LLM bridge…"
        : usesClientSideLlm()
          ? "Cloud LLM (Settings)"
          : "LLM bridge ready",
  );
</script>

<div class="mobile-status-strip" aria-label="Service readiness">
  <a
    class="pill"
    data-tier={stdb}
    data-pulse={stdbPulse ? "true" : "false"}
    href="#/settings"
    title={stdbTitle}
    aria-label="SpacetimeDB status"
  >
    <Database size={14} strokeWidth={2.25} class="pill-icon" aria-hidden="true" />
    <span class="pill-dot" aria-hidden="true"></span>
  </a>
  <a
    class="pill"
    data-tier={feedsIngest}
    data-pulse={feedsPulse ? "true" : "false"}
    href="#/settings"
    title={feedsTitle}
    aria-label="Feeds and ingest status"
  >
    <RadioTower size={14} strokeWidth={2.25} class="pill-icon" aria-hidden="true" />
    <span class="pill-dot" aria-hidden="true"></span>
  </a>
  <a
    class="pill"
    data-tier={llm}
    data-pulse={llmPulse ? "true" : "false"}
    href="#/settings"
    title={llmTitle}
    aria-label="LLM bridge status"
  >
    <Sparkles size={14} strokeWidth={2.25} class="pill-icon" aria-hidden="true" />
    <span class="pill-dot" aria-hidden="true"></span>
  </a>
</div>

<style>
  .mobile-status-strip {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1 1 auto;
    min-width: 0;
    max-width: none;
    width: 100%;
  }

  .pill {
    display: flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 0;
    min-height: 36px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    text-decoration: none;
    color: var(--text-2);
    touch-action: manipulation;
    box-sizing: border-box;
  }

  .pill:hover {
    border-color: var(--border-2);
    color: var(--text-1);
    background: color-mix(in srgb, var(--bg-3) 65%, var(--bg-2));
  }

  :global(.pill-icon) {
    flex-shrink: 0;
    opacity: 0.9;
  }

  .pill-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-3);
    flex-shrink: 0;
    box-shadow: 0 0 0 2px transparent;
    transition:
      background var(--motion-med, 220ms) var(--ease, ease),
      box-shadow var(--motion-med, 220ms) var(--ease, ease);
  }

  .pill[data-tier="live"] .pill-dot {
    background: var(--status-ok, #22c55e);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--status-ok, #22c55e) 22%, transparent);
  }

  .pill[data-tier="degraded"] .pill-dot {
    background: var(--status-warn, #f59e0b);
  }

  .pill[data-tier="offline"] .pill-dot {
    background: var(--status-err, #ef4444);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--status-err, #ef4444) 18%, transparent);
  }

  .pill[data-tier="unknown"] .pill-dot {
    background: var(--text-3);
  }

  .pill[data-pulse="true"] .pill-dot {
    animation: mobile-pill-pulse 1.15s ease-in-out infinite;
  }

  @keyframes mobile-pill-pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.45;
      transform: scale(1.2);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pill[data-pulse="true"] .pill-dot {
      animation: none;
      opacity: 0.75;
    }
  }
</style>
