import { describe, expect, test, mock } from "bun:test";

mock.module("./native-config", () => ({
  llmBaseUrl: () => "",
  llmServiceConfigured: () => false,
  shouldProbeLlm: () => false,
  joinServiceUrl: (base: string, path: string) => { const p = path.startsWith("/") ? path : `/${path}`; const b = (base ?? "").trim().replace(/\/$/, ""); return b ? `${b}${p}` : p; },
  ingestBaseUrl: () => "",
  ingestUrl: (path: string) => path,
  stdbDatabaseName: () => "openatlas",
  stdbUriFromEnv: () => undefined,
  ingestServiceConfigured: () => false,
  isNativeApp: () => false,
}));

import { checkLlmBridgePing, checkLlmBridgeCapable } from "./llm";

describe("checkLlmBridgePing", () => {
  test("returns false when fetch throws (no bridge running)", async () => {
    const ok = await checkLlmBridgePing();
    expect(ok).toBe(false);
  });
});

describe("checkLlmBridgeCapable", () => {
  test("returns false when fetch throws (no bridge running)", async () => {
    const ok = await checkLlmBridgeCapable();
    expect(ok).toBe(false);
  });
});
