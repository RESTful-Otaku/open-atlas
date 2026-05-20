/**
 * Deterministic executive briefing when Ollama / the LLM bridge is unavailable.
 * Grounded in the same dashboard fields the LLM snapshot uses.
 */

import { domainLabel } from "./colors";
import type { LlmSnapshotInput } from "./llm-snapshot";
import { llmSnapshotCounts } from "./llm-snapshot";

export function buildDeterministicBriefing(input: LlmSnapshotInput): string {
  const counts = llmSnapshotCounts(input);
  const world = Object.values(input.domainState).sort(
    (a, b) => b.risk_index - a.risk_index,
  );
  const top = world[0];
  const low = world.length > 0 ? world[world.length - 1] : null;
  const signals = [...input.recentSignals]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const inEdges = input.recentCausalEdges.filter((e) =>
    input.events.some((ev) => ev.id === e.target_event_id),
  ).length;
  const outEdges = input.recentCausalEdges.filter((e) =>
    input.events.some((ev) => ev.id === e.source_event_id),
  ).length;

  const lines: string[] = [
    "# OpenAtlas Daily Briefing",
    "",
    "_Template briefing (LLM unavailable). Numbers from live dashboard telemetry._",
    "",
    "## Executive summary",
    `The dashboard holds **${counts.events}** recent events across **${counts.domains}** domains with **${counts.signals}** signals in the ring.`,
  ];

  if (top) {
    lines.push(
      `Highest pressure is **${domainLabel(top.domain)}** (risk ${top.risk_index.toFixed(2)}, ${top.event_count} events, avg severity ${top.avg_severity.toFixed(2)}).`,
    );
  }
  if (low && top && low.domain !== top.domain) {
    lines.push(
      `Lowest tracked risk: **${domainLabel(low.domain)}** (${low.risk_index.toFixed(2)}).`,
    );
  }

  lines.push("", "## Domain outlook");
  if (counts.insights === 0) {
    lines.push("- No domain insight narratives in the ring yet.");
  } else {
    for (const d of Object.values(input.domainInsights)) {
      const risk = input.domainState[d.domain]?.risk_index;
      const riskNote =
        risk !== undefined ? ` · risk ${risk.toFixed(2)}` : "";
      lines.push(
        `- **${domainLabel(d.domain)}**: trend ${d.trend}, ${d.anomaly_count_recent} recent anomalies${riskNote}. ${d.narrative || "No narrative text."}`,
      );
    }
  }

  lines.push("", "## Top pressure points");
  if (signals.length === 0) {
    lines.push("- No scored signals in the recent window.");
  } else {
    for (const s of signals) {
      lines.push(
        `- ${domainLabel(s.domain)} (score ${s.score.toFixed(2)}): ${s.reason}`,
      );
    }
  }

  lines.push("", "## Cross-domain linkages");
  if (counts.causalEdges === 0) {
    lines.push("- Causal edge sample is empty — linkage data is sparse.");
  } else {
    lines.push(
      `- Sample includes **${counts.causalEdges}** edges; roughly **${inEdges}** inbound and **${outEdges}** outbound relative to recent events.`,
    );
  }

  lines.push("", "## Suggested follow-ups");
  lines.push(
    "- Confirm `ollama serve` and `./dev.sh llm:start`, then regenerate for an Ollama narrative.",
  );
  if (top) {
    lines.push(`- Drill into **${domainLabel(top.domain)}** desk and command matrix.`);
  }
  lines.push("- Review entities view for geolocated events and feed health in Settings.");

  return lines.join("\n");
}
