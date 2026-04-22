/**
 * Large, deterministic synthetic dataset for visualization QA without APIs.
 * Uses a fixed seed PRNG for reproducible screenshots and tests.
 *
 * Events are spread across ~80 days with burstier recent activity, domain
 * weights vary over the index, and severity history is a smooth random walk
 * (not IID noise) so sparklines and matrices read like real telemetry.
 */

import { DOMAIN_CATALOG, domainLabel } from "./colors";
import {
  MAX_CAUSAL_EDGES,
  MAX_EVENT_NARRATIVES,
  MAX_EVENTS,
  MAX_SIGNALS,
  MAX_SEVERITY_HISTORY,
} from "./data-limits";
import {
  anchorForDomain,
  buildDemoNarrativeBlock,
  demoDominantSource,
  demoInsightNarrative,
  demoSignalReason,
} from "./demo-seed-domains";
import type {
  UiCausalEdge,
  UiDomainInsight,
  UiEvent,
  UiEventNarrative,
  UiSignal,
  UiWorldState,
} from "./types";

const TRENDS = ["up", "down", "flat"] as const;

/** Extra severity bias toward tails for domains that are usually “hot” in demos. */
const DOMAIN_SEV_BIAS: Readonly<Record<string, number>> = {
  cyber: 0.14,
  seismic: 0.12,
  finance: 0.08,
  geopolitics: 0.07,
  health: 0.06,
  climate: 0.05,
  energy: 0.05,
  space: 0.04,
  transport: 0.03,
  economy: 0.03,
  geospatial: 0.02,
  infrastructure: 0.02,
  demographics: 0.01,
};

/**
 * xorshift32 — seed must be > 0
 */
function makeRng(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function pickDomainWeighted(
  rng: () => number,
  domainIds: readonly string[],
  idx: number,
): string {
  const w = domainIds.map((_d, j) => {
    const base = 1 + 0.55 * Math.sin(idx * 0.031 + j * 0.73);
    const bump = 1 + 0.35 * Math.sin(idx * 0.019 + j * 1.1);
    return base * bump;
  });
  const t = w.reduce((a, b) => a + b, 0);
  let r = rng() * t;
  for (let j = 0; j < domainIds.length; j++) {
    r -= w[j]!;
    if (r <= 0) return domainIds[j]!;
  }
  return domainIds[domainIds.length - 1]!;
}

function eventTimestampMs(
  baseT: number,
  i: number,
  poolLen: number,
  rng: () => number,
): number {
  const frac = i / Math.max(1, poolLen - 1);
  const daysBack = Math.pow(frac, 0.68) * 82 + (rng() - 0.5) * 1.4;
  const jitterH = (rng() - 0.5) * 22;
  const burst = rng() < 0.11 ? rng() * 96 : 0;
  return (
    baseT -
    daysBack * 86_400_000 -
    jitterH * 3_600_000 -
    burst * 3_600_000
  );
}

function buildSeverityHistory(
  rng: () => number,
  domain: string,
  len: number,
): number[] {
  const hist: number[] = [];
  let v =
    0.22 +
    rng() * 0.35 +
    (DOMAIN_SEV_BIAS[domain] ?? 0) * 0.25;
  const phase = rng() * Math.PI * 2;
  for (let h = 0; h < len; h++) {
    v += (rng() - 0.5) * 0.065;
    v += 0.018 * Math.sin((h / len) * Math.PI * 2 + phase);
    v = Math.min(0.96, Math.max(0.06, v));
    hist.push(Math.round(v * 1000) / 1000);
  }
  return hist;
}

/**
 * Produces a full client-shaped snapshot. Event count matches MAX_EVENTS
 * after trimming (newest by ordinal) so the UI stays performant.
 */
export function buildDemoSnapshot(seed = 0x0a7a5): {
  events: readonly UiEvent[];
  recentSignals: readonly UiSignal[];
  domainState: Readonly<Record<string, UiWorldState>>;
  domainSeverityHistory: Readonly<Record<string, number[]>>;
  recentCausalEdges: readonly UiCausalEdge[];
  domainInsights: Readonly<Record<string, UiDomainInsight>>;
  eventNarratives: Readonly<Record<string, UiEventNarrative>>;
} {
  const rng = makeRng(seed);
  const domainIds = DOMAIN_CATALOG.map((d) => d.id);

  const eventPool: UiEvent[] = [];
  const placeByEventId: Record<string, string> = {};
  const baseT = Date.now();
  const poolBuild = MAX_EVENTS * 3;

  for (let i = 0; i < poolBuild; i++) {
    const dom = pickDomainWeighted(rng, domainIds, i);
    const anchor = anchorForDomain(dom, i, rng);
    const hasLoc = rng() > 0.06;
    const bias = DOMAIN_SEV_BIAS[dom] ?? 0;
    const sev = Math.min(
      0.985,
      0.08 + rng() * 0.78 + bias * rng() + (rng() < 0.06 ? rng() * 0.2 : 0),
    );
    const ordinal = 50_000 + i;
    const id = `demo-e-${ordinal}`;
    const jitter = () => (rng() - 0.5) * 2.6;
    placeByEventId[id] = anchor.label;
    eventPool.push({
      id,
      ordinal,
      timestamp: new Date(eventTimestampMs(baseT, i, poolBuild, rng)).toISOString(),
      domain: dom,
      severity_score: Math.round(sev * 1000) / 1000,
      location: hasLoc
        ? {
            lat: Math.max(
              -85,
              Math.min(85, anchor.lat + jitter()),
            ),
            lon: ((anchor.lon + jitter() * 1.25 + 180) % 360) - 180,
          }
        : null,
    });
  }
  eventPool.sort((a, b) => b.ordinal - a.ordinal);
  const events = eventPool.slice(0, MAX_EVENTS);

  const domainState: Record<string, UiWorldState> = {};
  const domainSeverityHistory: Record<string, number[]> = {};
  for (const d of domainIds) {
    const inDom = events.filter((e) => e.domain === d).length;
    const ec = Math.max(inDom, 40 + Math.floor(rng() * 5200));
    const avg =
      inDom > 0
        ? events
            .filter((e) => e.domain === d)
            .reduce((s, e) => s + e.severity_score, 0) / inDom
        : 0.2 + rng() * 0.45;
    const risk = Math.min(
      0.98,
      0.12 +
        avg * 0.55 +
        (DOMAIN_SEV_BIAS[d] ?? 0) * 0.35 +
        (rng() - 0.5) * 0.08,
    );
    domainState[d] = {
      domain: d,
      event_count: ec,
      avg_severity: Math.round(avg * 1000) / 1000,
      risk_index: Math.round(risk * 1000) / 1000,
    };
    domainSeverityHistory[d] = buildSeverityHistory(rng, d, MAX_SEVERITY_HISTORY);
  }

  const recentSignals: UiSignal[] = [];
  const byDomain: Record<string, UiEvent[]> = {};
  for (const d of domainIds) {
    byDomain[d] = events.filter((e) => e.domain === d);
  }
  for (let s = 0; s < MAX_SIGNALS; s++) {
    const dom = pickDomainWeighted(rng, domainIds, s + 901);
    const pool = byDomain[dom] ?? events;
    const ev = pool.length ? pool[s % pool.length]! : events[s % events.length]!;
    recentSignals.push({
      id: `demo-s-${s}`,
      event_id: ev.id,
      domain: dom,
      score: Math.round((0.12 + rng() * 0.84) * 1000) / 1000,
      reason: demoSignalReason(dom, rng),
    });
  }

  const recentCausalEdges: UiCausalEdge[] = [];
  for (let c = 0; c < MAX_CAUSAL_EDGES; c++) {
    const a = events[c % events.length]!;
    let b = events[(c + 19 + Math.floor(rng() * 11)) % events.length]!;
    if (rng() < 0.42) {
      const same = events.filter((e) => e.domain === a.domain);
      if (same.length > 1) {
        b = same[(c + 3) % same.length]!;
      }
    }
    if (a.id === b.id) {
      b = events[(c + 29) % events.length]!;
    }
    recentCausalEdges.push({
      id: `demo-c-${c}`,
      source_event_id: a.id,
      target_event_id: b.id,
      influence_score: Math.round((0.08 + rng() * 0.82) * 1000) / 1000,
      decay_rate: Math.round((0.008 + rng() * 0.11) * 1000) / 1000,
    });
  }

  const now = new Date().toISOString();
  const domainInsights: Record<string, UiDomainInsight> = {};
  for (const d of domainIds) {
    domainInsights[d] = {
      domain: d,
      trend: pick(rng, [...TRENDS]),
      anomaly_count_recent: Math.floor(rng() * 18),
      dominant_source: demoDominantSource(d, rng),
      source_link:
        rng() > 0.35 ? "https://example.com/open-atlas#sources-demo" : null,
      narrative: demoInsightNarrative(d, rng),
      updated_at: now,
    };
  }

  const eventNarratives: Record<string, UiEventNarrative> = {};
  const narrRow = events
    .filter((e) => e.severity_score >= 0.28)
    .slice(0, MAX_EVENT_NARRATIVES);
  for (const e of narrRow) {
    const place = placeByEventId[e.id] ?? domainLabel(e.domain);
    const block = buildDemoNarrativeBlock(
      e.domain,
      place,
      e.severity_score,
      rng,
      e.id,
      now,
    );
    eventNarratives[e.id] = {
      event_id: e.id,
      headline: block.headline,
      summary: block.summary,
      inference: block.inference,
      predicted_disruption: block.predicted_disruption,
      updated_at: now,
    };
  }

  return {
    events,
    recentSignals,
    domainState,
    domainSeverityHistory,
    recentCausalEdges,
    domainInsights,
    eventNarratives,
  };
}
