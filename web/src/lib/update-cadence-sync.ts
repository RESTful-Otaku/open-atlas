
import {
  fetchFeedCatalog,
  minPollIntervalSecs,
  updateFeedPollIntervals,
} from "./feed-config";


export const INGEST_POLL_OPTIONS_SECS = [
  30, 60, 300, 1800, 3600, 14_400,
] as const;


export function clientMsToPollSecs(ms: number): number {
  const want = Math.max(1, Math.ceil(ms / 1000));
  for (const opt of INGEST_POLL_OPTIONS_SECS) {
    if (opt >= want) return opt;
  }
  return INGEST_POLL_OPTIONS_SECS[INGEST_POLL_OPTIONS_SECS.length - 1]!;
}


export function snapToIngestPollSecs(secs: number): number {
  const max = INGEST_POLL_OPTIONS_SECS[INGEST_POLL_OPTIONS_SECS.length - 1]!;
  let want = Math.max(INGEST_POLL_OPTIONS_SECS[0]!, secs);
  for (const opt of INGEST_POLL_OPTIONS_SECS) {
    if (opt >= want) return opt;
  }
  return max;
}

export function pollSecsForFeed(feedName: string, clientMs: number): number {
  const target = clientMsToPollSecs(clientMs);
  const floored = Math.max(minPollIntervalSecs(feedName), target);
  return snapToIngestPollSecs(floored);
}


export async function syncIngestPollCadenceFromClient(
  clientMs: number,
): Promise<void> {
  try {
    const catalog = await fetchFeedCatalog();
    if (!catalog.live_feeds_enabled) return;

    const intervals: Record<string, number> = {};
    for (const feed of catalog.feeds) {
      const secs = pollSecsForFeed(feed.name, clientMs);
      if (secs !== feed.poll_interval_secs) {
        intervals[feed.name] = secs;
      }
    }
    if (Object.keys(intervals).length === 0) return;
    await updateFeedPollIntervals(intervals);
  } catch (err) {
    console.warn("[openatlas] feed poll cadence sync skipped:", err);
  }
}
