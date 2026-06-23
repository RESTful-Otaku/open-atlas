/**
 * End-to-end tests for the LLM bridge pipeline.
 *
 * Spins up a lightweight HTTP server that mimics the openatlas-llm-bridge
 * endpoints, then exercises the full client flow:
 *   buildLlmSnapshot → requestLlmInsight → response parsing.
 */

import { describe, expect, test, afterAll, mock } from "bun:test";

const OLLAMA_MODEL = "llama3.2-test";

function mockBridgeHandler(req: Request): Response {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/health") {
    return Response.json({ ok: true, service: "openatlas-llm-bridge" });
  }

  if (req.method === "GET" && url.pathname === "/v1/ready") {
    return new Response("ollama reachable", { status: 200 });
  }

  if (req.method === "GET" && url.pathname === "/v1/capable") {
    return new Response("model inference ok", { status: 200 });
  }

  if (req.method === "POST" && url.pathname === "/v1/insight") {
    return Response.json({
      text: [
        "## Executive Summary",
        "The telemetry snapshot shows activity in energy domain with 1 event (severity 0.90).",
        "",
        "## Notable stress points",
        "- Energy event at ordinal 1 has high severity (0.90). Recommend investigation.",
        "",
        "## Suggested follow-ups",
        "- Review the energy domain dashboard for context.",
        "— OpenAtlas AI Analyst",
      ].join("\n"),
      model: OLLAMA_MODEL,
      ollama_base: "http://127.0.0.1:11434",
    });
  }

  if (req.method === "POST" && url.pathname === "/v1/insight-timeout") {
    return new Promise(() => {});
  }

  if (req.method === "POST" && url.pathname === "/v1/insight-error") {
    return Response.json(
      { error: "ollama: model 'llama99' not found, try pulling it first" },
      { status: 502 },
    );
  }

  if (req.method === "POST" && url.pathname === "/v1/insight-cuda") {
    return Response.json(
      {
        error:
          "CUDA error: architectural feature absent — " +
          "Your GPU is incompatible with this Ollama CUDA build",
      },
      { status: 502 },
    );
  }

  if (req.method === "POST" && url.pathname === "/v1/insight-empty") {
    return Response.json({
      text: "",
      model: OLLAMA_MODEL,
      ollama_base: "http://127.0.0.1:11434",
    });
  }

  return new Response("not found", { status: 404 });
}

let serverUrl = "";

const server = Bun.serve({
  port: 0, // random available port
  fetch: mockBridgeHandler,
});
serverUrl = `http://127.0.0.1:${server.port}`;

// Mock native-config so llmBaseUrl() returns the mock server URL
// (import.meta.env.VITE_LLM_BASE is not populated from process.env in Bun test)
const mockNativeConfig = () => ({
  llmBaseUrl: () => serverUrl,
  llmServiceConfigured: () => true,
  shouldProbeLlm: () => true,
  joinServiceUrl: (base: string, path: string) => `${base}${path}`,
  ingestBaseUrl: () => "",
  ingestUrl: (path: string) => path,
  stdbDatabaseName: () => "openatlas",
  stdbUriFromEnv: () => undefined,
  ingestServiceConfigured: () => false,
  isNativeApp: () => false,
});
mock.module("./native-config", mockNativeConfig);
mock.module("../native-config", mockNativeConfig);

import type { LlmSnapshotInput } from "./llm-snapshot";
import type { LlmInsightResponse } from "./llm";

describe("LLM bridge end-to-end pipeline", () => {
  test("health endpoint returns ok", async () => {
    const r = await fetch(`${serverUrl}/health`);
    expect(r.ok).toBe(true);
    const body = await r.json();
    expect(body.service).toBe("openatlas-llm-bridge");
  });

  test("ready endpoint returns 200", async () => {
    const r = await fetch(`${serverUrl}/v1/ready`);
    expect(r.ok).toBe(true);
  });

  test("capable endpoint returns 200", async () => {
    const r = await fetch(`${serverUrl}/v1/capable`);
    expect(r.ok).toBe(true);
  });

  test("POST /v1/insight with snapshot returns analysis text", async () => {
    const snapshot: Record<string, unknown> = {
      schema: "openatlas.llm_snapshot/v1",
      captured_at: "2026-01-01T00:00:00Z",
      world_state: [
        { domain: "energy", event_count: 3, avg_severity: 0.5, risk_index: 0.5 },
      ],
      domain_insights: [],
      recent_events: [
        {
          id: "1",
          ordinal: 1,
          domain: "energy",
          timestamp: "2026-01-01T00:00:00Z",
          severity_score: 0.9,
          has_location: false,
          location: null,
        },
      ],
      recent_signals: [],
      causal_edges_sample: [],
      event_narrative_headlines: [],
    };

    const r = await fetch(`${serverUrl}/v1/insight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot, cpu_only: true }),
    });

    expect(r.ok).toBe(true);
    const result = (await r.json()) as LlmInsightResponse;
    expect(result.text).toBeString();
    expect(result.text.length).toBeGreaterThan(50);
    expect(result.text).toContain("Executive Summary");
    expect(result.model).toBe(OLLAMA_MODEL);
    expect(result.ollama_base).toContain("127.0.0.1");
  });

  test("POST /v1/insight with user_prompt appends operator request", async () => {
    const snapshot: Record<string, unknown> = {
      schema: "openatlas.llm_snapshot/v1",
      captured_at: "2026-01-01T00:00:00Z",
      world_state: [],
      domain_insights: [],
      recent_events: [],
      recent_signals: [],
      causal_edges_sample: [],
      event_narrative_headlines: [],
    };

    const r = await fetch(`${serverUrl}/v1/insight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        snapshot,
        user_prompt: "Focus on energy sector risks.",
        cpu_only: false,
      }),
    });

    expect(r.ok).toBe(true);
  });

  test("bridge returns 502 with error message on Ollama failure", async () => {
    const r = await fetch(`${serverUrl}/v1/insight-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: {} }),
    });

    expect(r.status).toBe(502);
    const body = await r.json();
    expect(body.error).toContain("model 'llama99' not found");
  });

  test("CUDA error is returned by bridge (hint added client-side)", async () => {
    const r = await fetch(`${serverUrl}/v1/insight-cuda`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: {} }),
    });

    expect(r.status).toBe(502);
    const body = await r.json();
    expect(body.error).toContain("CUDA error");
    expect(body.error).toContain("architectural feature absent");
  });

  test("empty response text is returned as-is (caller handles validation)", async () => {
    const r = await fetch(`${serverUrl}/v1/insight-empty`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: {} }),
    });

    expect(r.ok).toBe(true);
    const result = (await r.json()) as LlmInsightResponse;
    expect(result.text).toBe("");
  });

  test("bridge returns 404 for unknown routes", async () => {
    const r = await fetch(`${serverUrl}/v1/nonexistent`);
    expect(r.status).toBe(404);
  });
});

describe("requestLlmInsight with mock bridge", () => {
  test("returns valid response for bridge provider", async () => {
    const llm = await import("./llm");
    const snapshot: Record<string, unknown> = {
      schema: "openatlas.llm_snapshot/v1",
      captured_at: "2026-01-01T00:00:00Z",
      world_state: [
        { domain: "energy", event_count: 1, avg_severity: 0.5, risk_index: 0.4 },
      ],
      domain_insights: [],
      recent_events: [],
      recent_signals: [],
      causal_edges_sample: [],
      event_narrative_headlines: [],
    };

    const result = await llm.requestLlmInsight(snapshot, "Reply with OK");
    expect(result.text).toBeString();
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.model).toBe(OLLAMA_MODEL);
  });

  test("checkLlmBridgePing returns true for healthy bridge", async () => {
    const llm = await import("./llm");
    const ok = await llm.checkLlmBridgePing();
    expect(ok).toBe(true);
  });

  test("checkLlmBridgeCapable returns true for capable model", async () => {
    const llm = await import("./llm");
    const ok = await llm.checkLlmBridgeCapable();
    expect(ok).toBe(true);
  });
});

describe("buildLlmSnapshot → requestLlmInsight full pipeline", () => {
  test("snapshot builds and sends correctly through bridge", async () => {
    const snapshotModule = await import("./llm-snapshot");
    const llm = await import("./llm");

    const input: LlmSnapshotInput = {
      events: [
        {
          id: "e1",
          ordinal: 1,
          domain_id: "energy",
          event_type: "disruption",
          severity_score: 0.85,
          timestamp: "2026-06-01T12:00:00Z",
          location: { lat: 48.8566, lng: 2.3522 },
          title: "Grid overload",
        },
      ] as any,
      recentSignals: [],
      domainState: {
        energy: {
          domain: "energy",
          event_count: 1,
          avg_severity: 0.85,
          risk_index: 0.7,
        },
      } as any,
      domainInsights: {},
      recentCausalEdges: [],
    };

    const snapshot = snapshotModule.buildLlmSnapshot(input);
    expect(snapshot).toHaveProperty("schema");
    expect(snapshot).toHaveProperty("captured_at");
    expect(snapshot).toHaveProperty("recent_events");

    const result = await llm.requestLlmInsight(snapshot, "Summarize the energy risk.");
    expect(result.text).toBeString();
    expect(result.text.length).toBeGreaterThan(50);
  });
});

afterAll(() => {
  server.stop();
});
