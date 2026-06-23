import { describe, expect, test, mock } from "bun:test";

// Ensure native-config returns bridge-disconnected behavior regardless
// of any leaked mock from other test files
mock.module("./native-config", () => ({
  llmBaseUrl: () => "",
  llmServiceConfigured: () => false,
  shouldProbeLlm: () => false,
  joinServiceUrl: (base: string, path: string) => `${base}${path}`,
  ingestBaseUrl: () => "",
  ingestUrl: (path: string) => path,
  stdbDatabaseName: () => "openatlas",
  stdbUriFromEnv: () => undefined,
  ingestServiceConfigured: () => false,
  isNativeApp: () => false,
}));
mock.module("../native-config", () => ({
  llmBaseUrl: () => "",
  llmServiceConfigured: () => false,
  shouldProbeLlm: () => false,
  joinServiceUrl: (base: string, path: string) => `${base}${path}`,
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
