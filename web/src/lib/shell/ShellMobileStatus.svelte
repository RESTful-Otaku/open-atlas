<!--
  Compact STDB / feeds / LLM readiness for the mobile top bar (replaces single aggregate dot).
-->
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

  const stdb = $derived(feedPillar(dashboard.dataMode, dashboard.connection));
  const ingest = $derived(
    shouldProbeIngest() ? boolPillar(readiness.ingestReady) : ("unknown" as Pillar),
  );
  const llm = $derived(
    usesClientSideLlm() || shouldProbeLlm()
      ? boolPillar(readiness.llmReady)
      : ("unknown" as Pillar),
  );
  const feedSummary = $derived(shouldProbeIngest() ? summarizeFeeds(feedLive.catalog) : null);
  const feedsFromIngest = $derived(feedSummaryTier(feedSummary));
  const feeds = $derived(
    shouldProbeIngest() ? feedsFromIngest : stdb === "live" ? ("live" as Pillar) : stdb,
  );
  const feedsIngest = $derived(
    shouldProbeIngest() ? mergeIngestFeeds(ingest, feedsFromIngest) : feeds,
  );

  const stdbTitle = $derived(
    dashboard.dataMode === "demo"
      ? "Demo data — Settings to connect SpacetimeDB"
      : dashboard.connectionLastError
        ? `SpacetimeDB: ${dashboard.connectionLastError}`
        : "SpacetimeDB connection",
  );

  const feedsTitle = $derived(
    dashboard.dataMode === "demo"
      ? "Demo mode — no live ingest"
      : !shouldProbeIngest()
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
              : "Ingest & open-data feeds",
  );
</script>

<div class="mobile-status-strip" aria-label="Service readiness">
  <a class="pill" data-tier={stdb} href="#/settings" title={stdbTitle} aria-label="SpacetimeDB status">
    <Database size={12} strokeWidth={2.25} aria-hidden="true" />
    <span class="pill-lab" aria-hidden="true">STDB</span>
    <span class="pill-dot" aria-hidden="true"></span>
  </a>
  <a class="pill" data-tier={feedsIngest} href="#/settings" title={feedsTitle} aria-label="Feeds and ingest status">
    <RadioTower size={12} strokeWidth={2.25} aria-hidden="true" />
    <span class="pill-lab" aria-hidden="true">Feeds</span>
    <span class="pill-dot" aria-hidden="true"></span>
  </a>
  <a
    class="pill"
    data-tier={llm}
    href="#/settings"
    title={readiness.llmReady === false
      ? usesClientSideLlm()
        ? "LLM provider not configured"
        : "LLM bridge down"
      : usesClientSideLlm()
        ? "Cloud LLM (Settings)"
        : "LLM bridge"}
    aria-label="LLM status"
  >
    <Sparkles size={12} strokeWidth={2.25} aria-hidden="true" />
    <span class="pill-lab">LLM</span>
    <span class="pill-dot" aria-hidden="true"></span>
  </a>
</div>

<style>
  .mobile-status-strip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    max-width: min(42vw, 168px);
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-height: 32px;
    padding: 0 6px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    text-decoration: none;
    color: var(--text-3);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    touch-action: manipulation;
  }

  .pill:hover {
    border-color: var(--border-2);
    color: var(--text-2);
  }

  .pill-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-3);
    flex-shrink: 0;
  }

  .pill[data-tier="live"] .pill-dot {
    background: var(--status-ok, #22c55e);
  }
  .pill[data-tier="degraded"] .pill-dot {
    background: var(--status-warn, #f59e0b);
  }
  .pill[data-tier="offline"] .pill-dot {
    background: var(--status-err, #ef4444);
  }

  :global(html[data-mobile-layout]) .pill-lab {
    display: none;
  }

  :global(html[data-mobile-layout]) .pill {
    padding: 0 5px;
    min-width: 32px;
    justify-content: center;
  }

  :global(html[data-tablet-layout]) .pill-lab {
    display: inline;
  }
</style>
