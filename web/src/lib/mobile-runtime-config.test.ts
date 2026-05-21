import { describe, expect, test } from "bun:test";
import {
  configForProfile,
  DEFAULT_MOBILE_RUNTIME,
  devIngestCommandForProfile,
  profileUsesLanIngest,
  resolveIngestBaseFromConfig,
  resolveStdbUriFromConfig,
  type MobileRuntimeConfig,
} from "./mobile-runtime-config";

describe("mobile runtime config", () => {
  test("cloud_live has maincloud STDB and no ingest probe", () => {
    const cfg: MobileRuntimeConfig = {
      ...DEFAULT_MOBILE_RUNTIME,
      profile: "cloud_live",
    };
    expect(resolveStdbUriFromConfig(cfg)).toBe("wss://maincloud.spacetimedb.com");
    expect(resolveIngestBaseFromConfig(cfg)).toBe("");
  });

  test("cloud ingest profiles use LAN host for ingest", () => {
    for (const profile of [
      "cloud_lan_ingest",
      "cloud_ingest_sim",
      "cloud_ingest_live",
      "cloud_ingest_hybrid",
    ] as const) {
      const cfg: MobileRuntimeConfig = {
        ...DEFAULT_MOBILE_RUNTIME,
        profile,
        lanHost: "192.168.1.50",
      };
      expect(resolveStdbUriFromConfig(cfg)).toBe("wss://maincloud.spacetimedb.com");
      expect(resolveIngestBaseFromConfig(cfg)).toBe("http://192.168.1.50:8080");
      expect(profileUsesLanIngest(profile)).toBe(true);
    }
  });

  test("devIngestCommandForProfile maps sim/live/hybrid", () => {
    expect(devIngestCommandForProfile("cloud_ingest_sim")).toContain("start:cloud:sim");
    expect(devIngestCommandForProfile("cloud_ingest_live")).toContain("start:cloud:live");
    expect(devIngestCommandForProfile("cloud_ingest_hybrid")).toContain("start:cloud:hybrid");
    expect(devIngestCommandForProfile("cloud_live")).toBeNull();
  });

  test("configForProfile clears ingest on cloud_live", () => {
    const next = configForProfile("cloud_live", {
      ...DEFAULT_MOBILE_RUNTIME,
      profile: "cloud_lan_ingest",
      lanHost: "10.0.0.5",
      ingestBaseCustom: "http://10.0.0.5:8080",
    });
    expect(next.ingestBaseCustom).toBe("");
  });
});
