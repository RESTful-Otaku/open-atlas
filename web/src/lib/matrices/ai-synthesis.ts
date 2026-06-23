

import { domainLabel } from "../colors";
import type {
  UiDomainInsight,
  UiEvent,
  UiSignal,
  UiWorldState,
} from "../types";

export interface SynthesisInputs {
  readonly domainState: Record<string, UiWorldState>;
  readonly insights: Record<string, UiDomainInsight>;
  readonly events: readonly UiEvent[];
  readonly signals: readonly UiSignal[];
}

export interface SynthesisOutput {
  readonly body: string;
  readonly citations: readonly string[];
}

type Builder = (scope: readonly string[], i: SynthesisInputs) => SynthesisOutput;

function topRiskDomain(
  scope: readonly string[],
  inputs: SynthesisInputs,
): { id: string; risk: number } | null {
  let best: { id: string; risk: number } | null = null;
  for (const id of scope) {
    const row = inputs.domainState[id];
    if (!row) continue;
    if (!best || row.risk_index > best.risk) {
      best = { id, risk: row.risk_index };
    }
  }
  return best;
}

function recentSignalReason(
  scope: readonly string[],
  inputs: SynthesisInputs,
): string | null {
  const scoped = scope.length === 0
    ? inputs.signals
    : inputs.signals.filter((s) => scope.includes(s.domain));
  const first = scoped[0];
  return first?.reason ?? null;
}

function eventCountIn(
  scope: readonly string[],
  inputs: SynthesisInputs,
): number {
  if (scope.length === 0) return inputs.events.length;
  return inputs.events.filter((e) => scope.includes(e.domain)).length;
}


function genericBuilder(prefix: string): Builder {
  return (scope, inputs) => {
    const top = topRiskDomain(scope, inputs);
    const recent = recentSignalReason(scope, inputs);
    const count = eventCountIn(scope, inputs);
    const parts: string[] = [];
    parts.push(`${prefix} across ${scope.length} tracked domains.`);
    if (top) {
      parts.push(
        `Highest pressure: ${domainLabel(top.id)} (risk ${top.risk.toFixed(2)}).`,
      );
    }
    if (recent) {
      parts.push(`Most recent anomaly: ${recent}.`);
    }
    parts.push(`${count} events observed since last reset.`);
    const citations: string[] = [];
    for (const id of scope) {
      const insight = inputs.insights[id];
      if (insight?.dominant_source) {
        citations.push(insight.dominant_source);
      }
    }
    return { body: parts.join(" "), citations };
  };
}

const BUILDERS: Readonly<Record<string, Builder>> = {
  threat: genericBuilder("Threat posture"),
  economic: genericBuilder("Macro liquidity posture"),
  health: genericBuilder("Epidemiological posture"),
  transport: genericBuilder("Transport flows"),
  cyber: genericBuilder("Cyber exposure"),
  resource: genericBuilder("Resource scarcity posture"),
  demographics: genericBuilder("Population dynamics"),
  compute: genericBuilder("Global compute load"),
};


export function synthesizeMatrix(
  id: string,
  scope: readonly string[],
  inputs: SynthesisInputs,
): SynthesisOutput {
  const builder = BUILDERS[id] ?? genericBuilder("Synthesis");
  return builder(scope, inputs);
}
