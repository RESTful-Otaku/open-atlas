import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";

import type { Response as BunResponse } from "bun";

// @ts-ignore
globalThis.$state = (init: unknown) => init;


let ingestHealth = true;
let ingestReady = true;
let ingestStatusResult = {
  ok: true,
  status: { stdb_reachable: true, ingest_mode: "sim" },
  err: null,
};

mock.module("./llm", () => ({
  checkLlmBridgeCapable: () => Promise.resolve(true),
}));

mock.module("./ingest-status", () => ({
  fetchIngestHealth: () => Promise.resolve(ingestHealth),
  fetchIngestReady: () => Promise.resolve(ingestReady),
  fetchIngestStatus: () => Promise.resolve(ingestStatusResult),
}));

mock.module("./native-config", () => ({
  shouldProbeIngest: () => true,
  shouldProbeLlm: () => true,
  ingestUrl: (path: string) => `/test${path}`,
  llmBaseUrl: () => {
    const env = process.env.VITE_LLM_BASE;
    return env || "/api/llm";
  },
  llmServiceConfigured: () => {
    const env = process.env.VITE_LLM_BASE;
    const base = env || "/api/llm";
    return base.startsWith("http://") || base.startsWith("https://");
  },
  isNativeApp: () => false,
  stdbDatabaseName: () => "openatlas",
  joinServiceUrl: (base: string, path: string) => { const p = path.startsWith("/") ? path : `/${path}`; const b = (base ?? "").trim().replace(/\/$/, ""); return b ? `${b}${p}` : p; },
  ingestBaseUrl: () => "",
  ingestServiceConfigured: () => false,
  stdbUriFromEnv: () => undefined,
}));

mock.module("./ops/ops-console", () => ({
  fetchLlmHealth: () => Promise.resolve({ ready: true, configured: true }),
}));

const originalFetch = globalThis.fetch;
beforeEach(() => {
  ingestHealth = true;
  ingestReady = true;
  ingestStatusResult = {
    ok: true,
    status: { stdb_reachable: true, ingest_mode: "sim" },
    err: null,
  };
  // @ts-ignore
  globalThis.fetch = async (url: string | URL | Request, opts?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr.includes("/v1/ready")) {
      return new Response("ok", { status: 200 }) as unknown as BunResponse;
    }
    return originalFetch(url, opts);
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const readinessModule = await import("./readiness.svelte");

beforeEach(() => {
  readinessModule.readiness.llmReady = null;
  readinessModule.readiness.ingestReady = null;
  readinessModule.readiness.ingestStatus = null;
  readinessModule.readiness.readinessRefreshing = false;
  readinessModule.readiness.ingestCheckErr = null;
});

describe("readiness", () => {
  test("readiness has expected default state shape", () => {
    expect(readinessModule.readiness).toHaveProperty("llmReady", null);
    expect(readinessModule.readiness).toHaveProperty("ingestReady", null);
    expect(readinessModule.readiness).toHaveProperty("ingestStatus", null);
    expect(readinessModule.readiness).toHaveProperty("readinessRefreshing", false);
    expect(readinessModule.readiness).toHaveProperty("ingestCheckErr", null);
  });

  test("refreshRemoteReadiness updates ingest state on success", async () => {
    await readinessModule.refreshRemoteReadiness();
    expect(readinessModule.readiness.ingestReady).toBe(true);
    expect(readinessModule.readiness.ingestCheckErr).toBeNull();
    expect(readinessModule.readiness.readinessRefreshing).toBe(false);
  });

  test("refreshRemoteReadiness sets ingestReady to false when health fails", async () => {
    ingestHealth = false;
    ingestStatusResult = { ok: false, status: null, err: "connection refused" };
    await readinessModule.refreshRemoteReadiness();
    expect(readinessModule.readiness.ingestReady).toBe(false);
    expect(readinessModule.readiness.ingestCheckErr).toBeTruthy();
    expect(readinessModule.readiness.readinessRefreshing).toBe(false);
  });

  test("refreshRemoteReadiness is idempotent while already refreshing", async () => {
    const p1 = readinessModule.refreshRemoteReadiness();
    const p2 = readinessModule.refreshRemoteReadiness();
    await Promise.all([p1, p2]);
    expect(readinessModule.readiness.readinessRefreshing).toBe(false);
  });

  test("refreshRemoteReadiness sets llmReady", async () => {
    await readinessModule.refreshRemoteReadiness();
    expect(readinessModule.readiness.llmReady).toBe(true);
  });

  test("refreshRemoteReadiness handles null status gracefully", async () => {
    ingestStatusResult = { ok: true, status: null, err: null };
    await readinessModule.refreshRemoteReadiness();
    expect(readinessModule.readiness.ingestReady).toBe(false);
    expect(readinessModule.readiness.ingestStatus).toBeNull();
  });

  test("ensureLlmReady returns true when llmReady is already true", async () => {
    readinessModule.readiness.llmReady = true;
    const result = await readinessModule.ensureLlmReady();
    expect(result).toBe(true);
  });

  test("ensureLlmReady with deep=false refreshes when llmReady is false", async () => {
    readinessModule.readiness.llmReady = false;
    const result = await readinessModule.ensureLlmReady(false);
    expect(result).toBe(true);
  });

  test("ensureLlmReady with deep=true always refreshes regardless of cache", async () => {
    readinessModule.readiness.llmReady = true;
    const result = await readinessModule.ensureLlmReady(true);
    expect(result).toBe(true);
  });
});
