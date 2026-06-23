import { fetchFeedCatalog, type FeedCatalog } from "./feed-config";
import { appendOpsLog } from "./observability/log-stream";
import { formatFeedCatalogSummary } from "./observability/ops-log-format";
import { ingestUrl, shouldProbeIngest } from "./native-config";
import { dashboard } from "./state.svelte";

export type { FeedHealthSummary } from "./feed-health-summary";
export { feedSummaryTier, summarizeFeeds, isActiveFeedStatus } from "./feed-health-summary";

export const feedLive = $state({
  catalog: null as FeedCatalog | null,
  loading: false,
  error: null as string | null,
});

export async function refreshFeedLive(): Promise<void> {
  if (dashboard.dataMode === "demo" || !shouldProbeIngest()) {
    feedLive.catalog = null;
    feedLive.error = null;
    feedLive.loading = false;
    return;
  }
  if (feedLive.loading) return;
  feedLive.loading = true;
  const t0 = performance.now();
  try {
    feedLive.catalog = await fetchFeedCatalog();
    feedLive.error = null;
    const ms = Math.round(performance.now() - t0);
    appendOpsLog("ok", "feeds", `GET /feeds ${ms}ms — ${formatFeedCatalogSummary(feedLive.catalog)}`);
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    feedLive.error = e instanceof Error ? e.message : String(e);
    appendOpsLog("error", "feeds", `GET ${ingestUrl("/feeds")} failed after ${ms}ms: ${feedLive.error}`);
  } finally {
    feedLive.loading = false;
  }
}

