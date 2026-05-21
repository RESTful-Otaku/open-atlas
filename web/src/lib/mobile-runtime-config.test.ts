import { describe, expect, test } from "bun:test";
import {
  alignConfigWithBuildEnv,
  configForProfile,
  DEFAULT_MOBILE_RUNTIME,
  devIngestCommandForProfile,
  normalizeMobileRuntimeConfig,
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
    expect(devIngestCommandForProfile("local_sim")).toContain("start:sim");
    expect(devIngestCommandForProfile("local_live")).toContain("start:live");
    expect(devIngestCommandForProfile("local_hybrid")).toContain("start:hybrid");
    expect(devIngestCommandForProfile("cloud_live")).toBeNull();
  });

  test("local_live resolves loopback STDB and ingest", () => {
    const cfg: MobileRuntimeConfig = {
      ...DEFAULT_MOBILE_RUNTIME,
      profile: "local_live",
      lanHost: "127.0.0.1",
    };
    expect(resolveStdbUriFromConfig(cfg)).toBe("ws://127.0.0.1:3000");
    expect(resolveIngestBaseFromConfig(cfg)).toBe("http://127.0.0.1:8080");
    expect(profileUsesLanIngest("local_live")).toBe(true);
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

  test("empty lanHost on web dev uses loopback not 192.168.1.1", () => {
    const cfg: MobileRuntimeConfig = {
      ...DEFAULT_MOBILE_RUNTIME,
      profile: "cloud_ingest_live",
      lanHost: "",
      ingestBaseCustom: "",
    };
    const ingest = resolveIngestBaseFromConfig(cfg);
    expect(ingest).not.toContain("192.168.1.1");
    expect(ingest).toBe("http://127.0.0.1:8080");
  });

  test("alignConfigWithBuildEnv leaves cloud_live when no baked ingest", () => {
    const cloudOnly: MobileRuntimeConfig = {
      ...DEFAULT_MOBILE_RUNTIME,
      profile: "cloud_live",
    };
    expect(alignConfigWithBuildEnv(cloudOnly).profile).toBe("cloud_live");
    expect(resolveIngestBaseFromConfig(alignConfigWithBuildEnv(cloudOnly))).toBe("");
  });

  test("normalize fills ingest URLs from lan host", () => {
    const cfg = normalizeMobileRuntimeConfig({
      ...DEFAULT_MOBILE_RUNTIME,
      profile: "cloud_ingest_live",
      lanHost: "192.168.1.50",
      ingestBaseCustom: "",
      llmBaseCustom: "",
    });
    expect(cfg.ingestBaseCustom).toBe("http://192.168.1.50:8080");
    expect(cfg.llmBaseCustom).toBe("http://192.168.1.50:3847");
  });
});
