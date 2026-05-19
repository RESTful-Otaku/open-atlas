import { describe, expect, test } from "bun:test";
import {
  clientMsToPollSecs,
  pollSecsForFeed,
} from "./update-cadence-sync";

describe("update-cadence-sync", () => {
  test("maps fast client cadence to minimum ingest option", () => {
    expect(clientMsToPollSecs(1_000)).toBe(30);
    expect(clientMsToPollSecs(5_000)).toBe(30);
    expect(clientMsToPollSecs(30_000)).toBe(30);
    expect(clientMsToPollSecs(60_000)).toBe(60);
    expect(clientMsToPollSecs(300_000)).toBe(300);
  });

  test("respects per-feed provider floors", () => {
    expect(pollSecsForFeed("usgs", 1_000)).toBe(30);
    expect(pollSecsForFeed("gdelt", 1_000)).toBe(300);
    expect(pollSecsForFeed("gdelt", 3_600_000)).toBe(3600);
  });

  test("snaps nasa-eonet minimum to allowed option not 180", () => {
    expect(pollSecsForFeed("nasa-eonet", 30_000)).toBe(300);
  });
});
