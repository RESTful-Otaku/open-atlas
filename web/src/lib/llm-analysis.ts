/**
 * Shared client logic for Ollama-backed analysis via openatlas-llm-bridge.
 */

import { buildLlmSnapshot, llmSnapshotCounts, type LlmSnapshotInput } from "./llm-snapshot";
import { requestLlmInsight, type LlmInsightResponse } from "./llm";

export interface LlmDashboardContext {
  readonly dataMode: "live" | "demo";
  readonly connection: "live" | "connecting" | "offline";
  readonly snapshot: LlmSnapshotInput;
}

export function llmSnapshotFromDashboard(
  input: Omit<LlmSnapshotInput, "capturedAt">,
): LlmSnapshotInput {
  return { ...input, capturedAt: new Date().toISOString() };
}

export function llmBlockedReason(
  ctx: LlmDashboardContext,
  llmReady: boolean | null,
): string | null {
  if (ctx.connection === "offline" && ctx.dataMode !== "demo") {
    return "SpacetimeDB is offline — use Reconnect in the status bar or Settings.";
  }
  if (ctx.connection === "connecting" && ctx.dataMode !== "demo") {
    return "Still connecting to SpacetimeDB — wait for Live status, then try again.";
  }
  if (ctx.connection !== "live" && ctx.dataMode !== "demo") {
    return "Connect to SpacetimeDB first (status bar), or use demo mode with ?demo=1.";
  }
  const counts = llmSnapshotCounts(ctx.snapshot);
  if (counts.events === 0) {
    return "No events in the dashboard yet. Start ingest (./dev.sh run → Local sim).";
  }
  if (llmReady === false) {
    return "LLM bridge or Ollama is not ready. Run: ollama serve && ollama pull llama3.2 && ./dev.sh llm:start";
  }
  if (llmReady === null) {
    return "Checking LLM bridge…";
  }
  return null;
}

export function llmCanRun(
  ctx: LlmDashboardContext,
  llmReady: boolean | null,
): boolean {
  return llmBlockedReason(ctx, llmReady) === null;
}

export async function runDashboardLlm(
  ctx: LlmDashboardContext,
  userPrompt: string,
): Promise<LlmInsightResponse> {
  const snapshot = buildLlmSnapshot(ctx.snapshot);
  return requestLlmInsight(snapshot, userPrompt);
}

export const DAILY_BRIEFING_PROMPT = `You are the OpenAtlas executive briefing officer.
Using ONLY the JSON under TELEMETRY_JSON (fields: world_state, domain_insights, recent_events, recent_signals, causal_edges_sample, event_narrative_headlines), write an operator daily briefing in Markdown:

# OpenAtlas Daily Briefing
## Executive summary
3–5 sentences on overall posture. Cite concrete risk_index and event counts from world_state.
## Global threat posture
Rank domains by risk_index from world_state. Name the highest and lowest.
## Domain outlook
One bullet per entry in domain_insights: domain, trend, anomaly_count_recent, and the narrative field when present.
## Top pressure points
Which domains need attention now and why (signals, severity, anomalies).
## Cross-domain linkages
Use causal_edges_sample when non-empty; otherwise state that linkage data is sparse.
## Suggested follow-ups
3–5 actionable steps for an analyst watching this dashboard.

Be specific and quantitative where the JSON provides numbers. Do not invent events, regions, or metrics. If a section lacks data, say so in one sentence.`;

export function matrixSynthesisPrompt(
  matrixId: string,
  scope: readonly string[],
): string {
  const domains =
    scope.length > 0 ? scope.join(", ") : "all tracked domains";
  return `You are an OpenAtlas matrix analyst for the "${matrixId}" view (scope: ${domains}).
Using ONLY TELEMETRY_JSON, write 2–4 sentences of operational synthesis for this matrix.
Name the highest-risk domain in scope, cite anomaly/signal patterns from the data, and note one cross-domain implication if causal_edges_sample supports it.
Do not invent facts. Plain prose only (no markdown headings).`;
}
