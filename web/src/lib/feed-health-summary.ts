import type { FeedCatalog, FeedConnectionStatus } from "./feed-config";

export interface FeedHealthSummary {
  ok: number;
  degraded: number;
  error: number;
  idle: number;
  total: number;
}

export function summarizeFeeds(catalog: FeedCatalog | null): FeedHealthSummary | null {
  if (!catalog?.live_feeds_enabled) return null;
  const counts: FeedHealthSummary = {
    ok: 0,
    degraded: 0,
    error: 0,
    idle: 0,
    total: catalog.feeds.length,
  };
  for (const feed of catalog.feeds) {
    const s = feed.connection;
    if (s === "ok") counts.ok += 1;
    else if (s === "degraded" || s === "test_failed" || s === "starting")
      counts.degraded += 1;
    else if (s === "error") counts.error += 1;
    else counts.idle += 1;
  }
  return counts;
}

export function feedSummaryTier(
  summary: FeedHealthSummary | null,
): "live" | "degraded" | "offline" | "unknown" {
  if (!summary) return "unknown";
  if (summary.error > 0) return "degraded";
  if (summary.ok > 0) return "live";
  if (summary.degraded > 0) return "degraded";
  if (summary.total > 0) return "degraded";
  return "offline";
}

export function isActiveFeedStatus(status: FeedConnectionStatus): boolean {
  return status === "ok" || status === "degraded" || status === "starting";
}
