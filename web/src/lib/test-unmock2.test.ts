import { test, expect, mock } from "bun:test";

mock.module("./native-config", () => ({
  shouldProbeIngest: () => true,
  shouldProbeLlm: () => true,
  ingestUrl: (path: string) => `/test${path}`,
  isNativeApp: () => false,
  stdbDatabaseName: () => "openatlas",
  joinServiceUrl: (base: string, path: string) => { const p = path.startsWith("/") ? path : `/${path}`; const b = (base ?? "").trim().replace(/\/$/, ""); return b ? `${b}${p}` : p; },
  ingestBaseUrl: () => "",
  ingestServiceConfigured: () => false,
  stdbUriFromEnv: () => undefined,
}));

test("native-config without llmBaseUrl in mock", async () => {
  const nc = await import("./native-config");
  console.log("llmBaseUrl type:", typeof nc.llmBaseUrl);
  console.log("llmBaseUrl value:", nc.llmBaseUrl());
});
