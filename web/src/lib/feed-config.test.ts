import { describe, expect, test, mock } from "bun:test";

mock.module("./native-config", () => ({
  shouldProbeIngest: () => true,
  shouldProbeLlm: () => true,
  ingestUrl: (path: string) => `/ingest${path}`,
  llmBaseUrl: () => "/api/llm",
  llmServiceConfigured: () => false,
  isNativeApp: () => false,
  stdbDatabaseName: () => "openatlas",
  joinServiceUrl: (base: string, path: string) => base ? `${base}${path}` : path,
  ingestBaseUrl: () => "",
  ingestServiceConfigured: () => false,
  stdbUriFromEnv: () => undefined,
}));

import {
  pollIntervalLabel,
  minPollIntervalSecs,
  formatNextPoll,
  formatLastPoll,
  connectionLabel,
} from "./feed-config";
import type { FeedConnectionStatus } from "./feed-config";

describe("pollIntervalLabel", () => {
  test("returns expected labels for known intervals", () => {
    expect(pollIntervalLabel(30)).toBe("30 seconds");
    expect(pollIntervalLabel(60)).toBe("1 minute");
    expect(pollIntervalLabel(300)).toBe("5 minutes");
    expect(pollIntervalLabel(1800)).toBe("30 minutes");
    expect(pollIntervalLabel(3600)).toBe("1 hour");
    expect(pollIntervalLabel(14_400)).toBe("4 hours");
  });

  test("falls back to seconds for unknown intervals", () => {
    expect(pollIntervalLabel(45)).toBe("45s");
    expect(pollIntervalLabel(120)).toBe("120s");
    expect(pollIntervalLabel(7200)).toBe("7200s");
    expect(pollIntervalLabel(0)).toBe("0s");
    expect(pollIntervalLabel(-1)).toBe("-1s");
  });
});

describe("minPollIntervalSecs", () => {
  test("returns feed-specific minimums for known feeds", () => {
    expect(minPollIntervalSecs("gdelt")).toBe(300);
    expect(minPollIntervalSecs("world-bank")).toBe(300);
    expect(minPollIntervalSecs("opensky")).toBe(300);
    expect(minPollIntervalSecs("eia")).toBe(300);
    expect(minPollIntervalSecs("fred")).toBe(300);
    expect(minPollIntervalSecs("nasa-eonet")).toBe(180);
    expect(minPollIntervalSecs("coingecko")).toBe(60);
  });

  test("returns default 30s for unknown feeds", () => {
    expect(minPollIntervalSecs("unknown-feed")).toBe(30);
    expect(minPollIntervalSecs("twitter")).toBe(30);
    expect(minPollIntervalSecs("")).toBe(30);
  });

  test("is case-sensitive (exact match only)", () => {
    expect(minPollIntervalSecs("Gdelt")).toBe(30);
    expect(minPollIntervalSecs("NASA-EONET")).toBe(30);
  });
});

describe("formatNextPoll", () => {
  test("returns em-dash for null input", () => {
    expect(formatNextPoll(null)).toBe("\u2014");
  });

  test('returns "due" when poll time is now or in the past', () => {
    const past = new Date(Date.now() - 5_000).toISOString();
    expect(formatNextPoll(past)).toBe("due");
    expect(formatNextPoll(new Date().toISOString())).toBe("due");
  });

  test("returns seconds countdown for < 60s", () => {
    const future = new Date(Date.now() + 5_000).toISOString();
    expect(formatNextPoll(future)).toBe("in 5s");
  });

  test("rounds up to nearest second", () => {
    const future = new Date(Date.now() + 1_000).toISOString();
    expect(formatNextPoll(future)).toBe("in 1s");
  });

  test("returns minute countdown for < 60m", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(formatNextPoll(future)).toBe("in 1m");
  });

  test("returns hour countdown for >= 60m", () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(formatNextPoll(future)).toBe("in 1h");
  });

  test("large intervals round to hours", () => {
    const future = new Date(Date.now() + 14_400_000).toISOString();
    expect(formatNextPoll(future)).toBe("in 4h");
  });
});

describe("formatLastPoll", () => {
  test('returns "never" for null input', () => {
    expect(formatLastPoll(null)).toBe("never");
  });

  test("returns seconds ago for < 60s", () => {
    const past = new Date(Date.now() - 5_000).toISOString();
    expect(formatLastPoll(past)).toBe("5s ago");
  });

  test("floor is at least 1 second", () => {
    const past = new Date(Date.now() - 500).toISOString();
    expect(formatLastPoll(past)).toBe("1s ago");
  });

  test("returns minutes ago for < 60m", () => {
    const past = new Date(Date.now() - 120_000).toISOString();
    expect(formatLastPoll(past)).toBe("2m ago");
  });

  test("returns hours ago for >= 60m", () => {
    const past = new Date(Date.now() - 7_200_000).toISOString();
    expect(formatLastPoll(past)).toBe("2h ago");
  });

  test("boundary at exactly 60 minutes", () => {
    const past = new Date(Date.now() - 3_599_000).toISOString();
    expect(formatLastPoll(past)).toBe("59m ago");
  });
});

describe("connectionLabel", () => {
  const cases: [FeedConnectionStatus, string][] = [
    ["ok", "Connected"],
    ["degraded", "Degraded"],
    ["error", "Error"],
    ["test_failed", "Test failed"],
    ["needs_key", "Needs API key"],
    ["mode_off", "Live feeds off"],
    ["disabled", "Disabled"],
    ["idle", "Idle"],
    ["starting", "Starting\u2026"],
    ["circuit_open", "Circuit open"],
  ];

  for (const [status, expected] of cases) {
    test(`returns "${expected}" for "${status}"`, () => {
      expect(connectionLabel(status)).toBe(expected);
    });
  }

  test("handles unknown status gracefully", () => {
    expect(connectionLabel("bogus" as FeedConnectionStatus)).toBe("Idle");
  });
});

describe("async feed operations", () => {
  test("fetchFeedCatalog throws when ingest not configured", async () => {
    mock.module("./native-config", () => ({
      shouldProbeIngest: () => false,
      shouldProbeLlm: () => false,
      ingestUrl: () => "",
      llmBaseUrl: () => "/api/llm",
      llmServiceConfigured: () => false,
      isNativeApp: () => false,
      stdbDatabaseName: () => "openatlas",
      joinServiceUrl: (base: string, path: string) => base ? `${base}${path}` : path,
      ingestBaseUrl: () => "",
      ingestServiceConfigured: () => false,
      stdbUriFromEnv: () => undefined,
    }));
    const { fetchFeedCatalog } = await import("./feed-config");
    expect(fetchFeedCatalog()).rejects.toThrow("Ingest URL not configured");
  });
});
