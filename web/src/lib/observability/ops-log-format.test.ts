import { describe, expect, test } from "bun:test";

import type { FeedCatalog } from "../feed-config";
import {
  formatFeedCatalogSummary,
  formatIngestPollLines,
} from "./ops-log-format";
import type { ObservabilitySnapshot } from "./ingest-status";

describe("ops-log-format", () => {
  test("formatFeedCatalogSummary lists troubled feeds", () => {
    const catalog = {
      live_feeds_enabled: true,
      ingest_mode: "hybrid",
      feeds: [
        { name: "gdelt", connection: "error" },
        { name: "usgs", connection: "ok" },
      ],
    } as unknown as FeedCatalog;
    const s = formatFeedCatalogSummary(catalog);
    expect(s).toContain("gdelt");
    expect(s).toContain("1 ok");
  });

  test("formatIngestPollLines includes status details", () => {
    const snap: ObservabilitySnapshot = {
      at: new Date().toISOString(),
      ingestReachable: true,
      ingestReady: true,
      ingestErr: null,
      status: {
        uptime_seconds: 120,
        ingest_mode: "hybrid",
        simulators_enabled: true,
        live_feeds_enabled: true,
        stdb_uri: "https://maincloud.spacetimedb.com",
        stdb_database: "openatlas",
        stdb_reachable: true,
        stdb_event_count: 231,
        feeds: [],
      },
      statusExtras: null,
      feeds: null,
      feedsErr: null,
      prometheus: { openatlas_ingest_events_accepted_total: 10 },
      metricsErr: null,
    };
    const lines = formatIngestPollLines(snap, 1, 42, null, { ingestProbes: true });
    expect(lines.some((l) => l.message.includes("mode=hybrid"))).toBe(true);
    expect(lines.some((l) => l.message.includes("231 events"))).toBe(true);
  });
});
