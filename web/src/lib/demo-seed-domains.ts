/**
 * Plausible geography + language per catalog domain for demo-seed. Everything
 * is synthetic; it only needs to “read real” in maps and event detail.
 */

import { DOMAIN_CATALOG } from "./colors";

type DomainId = (typeof DOMAIN_CATALOG)[number]["id"];

type Anchor = { readonly lat: number; readonly lon: number; readonly label: string };

type DomainPack = {
  /** Preferred map anchors for this domain */
  readonly anchors: readonly Anchor[];
  /** When picking signal reasons, domain-specific lines */
  readonly signalReasons: readonly string[];
  /** Short insight lines for `domain_insight.narrative` */
  readonly insightNarratives: readonly string[];
  /** Dominant data source label for the UI */
  readonly dominantSourceOptions: readonly (string | null)[];
  /** Two-line template for `predicted_disruption` (entity sev, note) */
  readonly disruptionSets: ReadonlyArray<
    readonly { entity: string; severity: string; note: string }[]
  >;
  /** `event_narrative` headline; supports {place} */
  readonly headlineTmpl: readonly string[];
  /** Longer summary; {place} {domain} */
  readonly summaryTmpl: readonly string[];
  /** Inference line */
  readonly inferenceTmpl: readonly string[];
};

const pack = (d: DomainPack) => d;

const GENERIC: readonly Anchor[] = [
  { lat: 35.68, lon: 139.69, label: "Tokyo" },
  { lat: 40.71, lon: -74.01, label: "New York" },
  { lat: 51.5, lon: -0.12, label: "London" },
  { lat: 1.35, lon: 103.82, label: "Singapore" },
  { lat: 48.86, lon: 2.35, label: "Paris" },
  { lat: 37.77, lon: -122.42, label: "San Francisco" },
];

export const DOMAIN_DEMO: Readonly<Record<DomainId, DomainPack>> = {
  energy: pack({
    anchors: [
      { lat: 29.76, lon: -95.37, label: "Houston" },
      { lat: 53.5, lon: 8.0, label: "North Sea cluster" },
      { lat: 25.3, lon: 51.5, label: "Ras Laffan / gas corridor" },
      { lat: 35.0, lon: 135.0, label: "Kansai grid" },
      { lat: 51.9, lon: 4.4, label: "Rotterdam power pool" },
      { lat: 50.0, lon: 8.0, label: "Frankfurt grid hub" },
    ],
    signalReasons: [
      "Intraday price spike >2σ vs DA auction",
      "Tie-line flow at thermal limit; redispatch cost rising",
      "Renewable forecast error vs actual >12% region-wide",
      "Gas burn-up for peakers; must-run constraints active",
    ],
    insightNarratives: [
      "Forward curves backwardated on prompt; watch weekend maintenance.",
      "Hydro and wind co-variance lower than 30d norm — thermal ramp risk.",
    ],
    dominantSourceOptions: [
      "ENTSO-E style mock",
      "EIA/ISO analog",
      "internal-scada-harness",
      null,
    ],
    disruptionSets: [
      [
        { entity: "Grid zone", severity: "high", note: "Possible 6–12h curtailed imports" },
        { entity: "Industrial load", severity: "moderate", note: "Firms on interruptible may face cuts" },
      ],
      [
        { entity: "LNG regas", severity: "watch", note: "Slots filling faster than 24h plan" },
        { entity: "Retail", severity: "low", note: "Tariff pass-through in next index" },
      ],
    ],
    headlineTmpl: [
      "Power pool stress | {place}",
      "Tie-line congestion risk (severity {sevpct}%) | {place}",
    ],
    summaryTmpl: [
      "Synthetic dispatch/price scenario: operating margin versus day-ahead is stretched near {place}. Ramping constraints and interconnector limits are the dominant drivers in this class of events.",
    ],
    inferenceTmpl: [
      "If flows remain here through the next two settlement periods, look for N-1 or redispatch to propagate to neighbouring pricing nodes.",
    ],
  }),

  finance: pack({
    anchors: [
      { lat: 40.76, lon: -73.99, label: "New York" },
      { lat: 51.51, lon: -0.08, label: "London" },
      { lat: 1.3, lon: 103.85, label: "Singapore" },
      { lat: 47.37, lon: 8.54, label: "Zürich" },
      { lat: 43.65, lon: -79.38, label: "Toronto" },
    ],
    signalReasons: [
      "Equity-bond correlation flips + correlation breakdown cross-book",
      "FX basis widening vs OIS; funding pressure signal",
      "Vol surface kink: wing bid vs 20d history",
      "Credit index skew vs cash bond marks",
    ],
    insightNarratives: [
      "Cross-asset betas not stable vs 60d; stress-VaR will move.",
      "Macro surprise distribution fat-tailed this week; desk limits tighter.",
    ],
    dominantSourceOptions: [
      "synthetic-venue",
      "index-vendor-mock",
      "internal-mds",
      null,
    ],
    disruptionSets: [
      [
        { entity: "Hedge book", severity: "high", note: "Margin calls may hit intraday" },
        { entity: "Repo desk", severity: "moderate", note: "Specials scarce on benchmark collateral" },
      ],
    ],
    headlineTmpl: [
      "Market regime shift (severity {sevpct}%) | {place}",
      "Cross-asset stress cluster | {place}",
    ],
    summaryTmpl: [
      "Demo finance shock: co-movement of risk factors vs rolling baseline is off-norm. {place} session shows liquidity fragmentation and wider bid–ask in beta hedges; not a price target.",
    ],
    inferenceTmpl: [
      "Contagion in this class usually peaks when vol-of-vol mean-reverts; watch funding/credit legs before equities stabilize.",
    ],
  }),

  climate: pack({
    anchors: [
      { lat: 64.1, lon: -21.7, label: "Reykjavík" },
      { lat: 14.6, lon: 121.0, label: "Manila" },
      { lat: -12.0, lon: 18.0, label: "Namib heat belt" },
      { lat: 35.0, lon: 139.7, label: "Kantō" },
      { lat: 40.0, lon: 116.0, label: "N China plain" },
    ],
    signalReasons: [
      "3-day max temp > P95 climatology at cell",
      "Precip accum vs ensemble spread beyond band",
      "Wind gust cluster vs WMO 10y return curve",
    ],
    insightNarratives: [
      "MJO phase tilting toward convective regime in basin; week-2 error higher.",
    ],
    dominantSourceOptions: [
      "open-meteo-mock",
      "ECMWF-analog",
      "reanalysis-harness",
      null,
    ],
    disruptionSets: [
      [
        { entity: "Agriculture", severity: "moderate", note: "Soil-moisture drawdown in catchment" },
        { entity: "Energy demand", severity: "watch", note: "Cooling degree-days stack with outlook" },
      ],
    ],
    headlineTmpl: [
      "Compound weather anomaly | {place}",
      "Severe weather envelope breach | {place}",
    ],
    summaryTmpl: [
      "Localized climate hazard stack: the observation sits on the tail of the seasonal distribution near {place}. Model blend vs station truth diverges enough to matter for short lead-time warnings.",
    ],
    inferenceTmpl: [
      "If upstream moisture feed persists 48h, expect downstream elevation of fire or flood sub-indices in adjacent cells.",
    ],
  }),

  seismic: pack({
    anchors: [
      { lat: 35.68, lon: 139.76, label: "Kantō" },
      { lat: 38.0, lon: 37.0, label: "E. Anatolia" },
      { lat: -20.0, lon: 168.0, label: "Vanuatu trench" },
      { lat: 35.4, lon: 142.0, label: "Japan trench" },
      { lat: 36.5, lon: 142.0, label: "Miyagi offshore" },
      { lat: 33.0, lon: 131.0, label: "Bungo channel" },
    ],
    signalReasons: [
      "Magnitude/depth product vs regional catalog; aftershock density elevated",
      "Peak ground-motion proxy over soft-soil site class",
    ],
    insightNarratives: [
      "Coulomb stress transfer pattern suggests 72h aftershock watch window.",
    ],
    dominantSourceOptions: [
      "USGS-feed-mock",
      "EMSC-analog",
      "GFZ-harness",
      null,
    ],
    disruptionSets: [
      [
        { entity: "Lifeline networks", severity: "high", note: "Shaking at design threshold on legacy segments" },
        { entity: "Ports", severity: "moderate", note: "Tsunami not modeled here; verify Mw source area" },
      ],
    ],
    headlineTmpl: [
      "Seismicity spike | {place} region",
      "Catalog anomaly M-class | {place}",
    ],
    summaryTmpl: [
      "Shallow crustal/ megathrust class event in the {place} segment. USGS-style severity maps to structural exposure classes used in the demo; real feeds would add ShakeMap products.",
    ],
    inferenceTmpl: [
      "When rate-and-state is elevated, suppress false dampening in 24h aftershock forecasts; cluster risk is not Poisson here.",
    ],
  }),

  transport: pack({
    anchors: [
      { lat: 1.25, lon: 103.85, label: "Singapore Strait" },
      { lat: 36.0, lon: 14.0, label: "Sicily corridor" },
      { lat: 50.0, lon: 4.0, label: "Benelux rail node" },
      { lat: 34.0, lon: -118.0, label: "LAX flow" },
      { lat: 25.0, lon: 55.0, label: "Dubai FIR" },
    ],
    signalReasons: [
      "Holding pattern depth vs 7d P95 at FIR",
      "Vessel count vs AIS 14d mean in strait",
      "Hub delay index vs schedule",
    ],
    insightNarratives: [
      "Jet stream dip increasing EU–NAET block days; add fuel stops on polar routes.",
    ],
    dominantSourceOptions: [
      "OpenSky-mock",
      "AIS-aggregate",
      "internal-APT",
    ],
    disruptionSets: [
      [
        { entity: "Freight slot", severity: "moderate", note: "Connections in secondary hubs may miss MCT" },
        { entity: "Just-in-time", severity: "watch", note: "Buffer stock burn rate rising" },
      ],
    ],
    headlineTmpl: [
      "Corridor saturation | {place}",
      "Air/sea flow anomaly | {place}",
    ],
    summaryTmpl: [
      "Transport graph shows anomalous dwell or crossing counts relative to a rolling 14d baseline. {place} is the centroid for this notional event; real mode would use ADS-B or AIS features.",
    ],
    inferenceTmpl: [
      "Cascades usually clear when alternates re-open; watch secondary hub max throughput before declaring recovery.",
    ],
  }),

  health: pack({
    anchors: [
      { lat: 6.5, lon: 3.3, label: "Lagos" },
      { lat: 19.0, lon: 72.8, label: "Mumbai" },
      { lat: 40.0, lon: 116.0, label: "Beijing" },
      { lat: 48.8, lon: 2.3, label: "Paris" },
    ],
    signalReasons: [
      "R₀ estimate vs 14d ETS band",
      "ICU spare capacity vs 7d forecast band",
    ],
    insightNarratives: [
      "Vaccine cold-chain index stable; case velocity still above seasonal.",
    ],
    dominantSourceOptions: [
      "WHO-style mock",
      "national-surveillance-harness",
    ],
    disruptionSets: [
      [
        { entity: "Tertiary care", severity: "high", note: "Elective procedure triage in effect" },
        { entity: "Schools", severity: "moderate", note: "Policy trigger threshold approached" },
      ],
    ],
    headlineTmpl: [
      "Public health stress index | {place}",
    ],
    summaryTmpl: [
      "Demo public-health event: notional test positivity and care-load versus regional capacity. {place} is the reporting centroid; this is a scenario for UI, not a medical claim.",
    ],
    inferenceTmpl: [
      "With reproduction near one, week-ahead case counts are sensitive to behavior shifts; use ensemble fan not point forecasts.",
    ],
  }),

  geospatial: pack({
    anchors: [
      { lat: 59.0, lon: 102.0, label: "Siberia fire season" },
      { lat: 8.0, lon: 38.0, label: "Rift ag belt" },
      { lat: -2.0, lon: 27.0, label: "C. Africa forest" },
    ],
    signalReasons: [
      "NDVI drop vs 16d L4 baseline",
      "Night-thermal hot cluster vs 5y return",
    ],
    insightNarratives: [
      "Cloud cover low — optical change detection has high skill this week.",
    ],
    dominantSourceOptions: [ "modis-mock", "sentinel-harness", null ],
    disruptionSets: [
      [
        { entity: "Agriculture", severity: "watch", note: "Planting window compression" },
        { entity: "Water index", severity: "moderate", note: "Reservoir inflow down vs climatology" },
      ],
    ],
    headlineTmpl: [
      "Land/change anomaly | {place}",
    ],
    summaryTmpl: [
      "Remote-sensing feature stack: persistent deviation from the rolling land surface in the {place} cell. Good for table-top exercises; live mode would attach confidence and sensor provenance.",
    ],
    inferenceTmpl: [
      "Stabilize on two independent sensors before using for sanctions-adjacent actions—demo uses a single notional product.",
    ],
  }),

  economy: pack({
    anchors: [
      { lat: 39.0, lon: 116.0, label: "China" },
      { lat: 55.0, lon: 37.0, label: "Moscow" },
      { lat: 38.9, lon: -77.0, label: "Washington" },
      { lat: 50.0, lon: 10.0, label: "Germany" },
    ],
    signalReasons: [
      "Macro surprise z-score vs Blue Chip consensus",
      "Output gap + inflation cross-term vs policy rule",
    ],
    insightNarratives: [
      "Phillips curve region steepening in DM basket; terminal rate repricing.",
    ],
    dominantSourceOptions: [ "World-Bank-mock", "BLS-analog", "OECD-harness" ],
    disruptionSets: [
      [
        { entity: "Fiscal", severity: "watch", note: "Automatic stabilizers not sized for shock depth" },
        { entity: "SME credit", severity: "moderate", note: "Spread widening vs IG floor" },
      ],
    ],
    headlineTmpl: [
      "Macro surprise (severity {sevpct}%) | {place}",
    ],
    summaryTmpl: [
      "Synthetic GDP/price/employment surprise mapped to the {place} country centroid. Severity encodes how far the nowcast sits from the consensus fan used in the demo.",
    ],
    inferenceTmpl: [
      "Policy response lags 1–2 quarters; do not one-to-one map financial markets to the macro print in exercises.",
    ],
  }),

  geopolitics: pack({
    anchors: [
      { lat: 50.45, lon: 30.52, label: "Kyiv" },
      { lat: 38.9, lon: -77.0, label: "Washington" },
      { lat: 50.85, lon: 4.35, label: "Brussels" },
      { lat: 35.0, lon: 33.0, label: "E. Med" },
    ],
    signalReasons: [
      "Sanctions or export-control delta vs prior week",
      "Military posturing index vs OSINT 30d norm",
      "Embassy / consular staffing anomaly vs baseline roster",
      "Dual-use export license queue length vs 90d median",
      "Maritime AIS darkening cluster near chokepoint",
      "Airspace NOTAM density vs conflict-adjacent norm",
    ],
    insightNarratives: [
      "Diplomatic channel density up; de-escalation window in 5–7d not ruled out.",
      "Track-2 messaging down while public rhetoric up — classic pre-move pattern in tabletop data.",
      "Sanctions evasion chatter up in trade finance synthetic graph; watch re-export hubs.",
    ],
    dominantSourceOptions: [ "synthetic-OSINT", "think-tank-curator-mock" ],
    disruptionSets: [
      [
        { entity: "Supply chain", severity: "high", note: "License reviews may extend lead times" },
        { entity: "Energy", severity: "moderate", note: "Spot premiums if rerouting persists" },
      ],
    ],
    headlineTmpl: [
      "Geopolitical stress | {place}",
    ],
    summaryTmpl: [
      "Scenario: escalation ladder tick with measurable exposure for trade and basing near {place}. This is a synthetic index for the demo grid only.",
    ],
    inferenceTmpl: [
      "Fat-tail outcomes cluster when alliance signaling is ambiguous; watch secondary theaters for spillover, not just the headline country.",
    ],
  }),

  cyber: pack({
    anchors: [
      { lat: 1.3, lon: 103.8, label: "APAC peering" },
      { lat: 38.9, lon: -77.1, label: "US-E gov cloud" },
      { lat: 52.3, lon: 4.9, label: "AMS-IX" },
    ],
    signalReasons: [
      "Ransomware affiliate cluster TTP match score",
      "DDoS bps / prefix vs scrubber capacity mock",
      "Kerberos ticket renewal anomalies vs golden-ticket hunt baseline",
      "Cloud IAM role burst grants vs change-management window",
      "TLS cert transparency log gap vs issuance policy",
      "SIEM correlation spike on PowerShell obfuscation n-grams",
    ],
    insightNarratives: [
      "Supply-chain vuln in widely deployed edge gear; patch cadence critical.",
      "Lateral movement signatures align with prior IR playbooks — isolate VDI pools first.",
      "Exfil staging in object storage buckets with lifecycle misconfig is the dominant path in this synthetic run.",
    ],
    dominantSourceOptions: [ "CISA-mock", "MISP-synthetic" ],
    disruptionSets: [
      [
        { entity: "Identity", severity: "high", note: "TOTP bypass attempts vs baseline" },
        { entity: "Backups", severity: "watch", note: "Immutability policy gaps on secondary DC" },
      ],
    ],
    headlineTmpl: [
      "Defensive pressure index | {place}",
    ],
    summaryTmpl: [
      "Synthetic cyber event: notional impact spread and sector targeting index. {place} tags the peering or jurisdiction focal point for the exercise.",
    ],
    inferenceTmpl: [
      "Recovery time tracks backup regime quality more than mean dwell time; prioritize restore drills over dwell-point estimates in tabletop.",
    ],
  }),

  space: pack({
    anchors: [
      { lat: 5.2, lon: -52.8, label: "Kourou" },
      { lat: 28.5, lon: -80.5, label: "Cape Canaveral" },
      { lat: 45.0, lon: 63.0, label: "Baikonur" },
      { lat: 30.4, lon: 130.97, label: "Tanegashima" },
    ],
    signalReasons: [
      "Conjunction density in LEO slot vs 30d",
      "TT&C dropout vs nominal pass schedule",
      "Solar panel degradation curve vs power budget envelope",
      "GNSS RAIM alarm rate vs constellation health mask",
      "Debris flux crossing 10 km sphere vs last TLE update age",
    ],
    insightNarratives: [
      "Drag environment higher than 400 km profile; reboost sooner than FDS plan.",
      "LEO slot congestion in this mock catalog mirrors post-launch deployment traffic, not a conjunction alert.",
    ],
    dominantSourceOptions: [ "NORAD-style mock", "SpacTrack-harness" ],
    disruptionSets: [
      [
        { entity: "LEO comms", severity: "moderate", note: "Handover gap during beta angle window" },
        { entity: "Debris", severity: "watch", note: "New fragment cloud watchbox active" },
      ],
    ],
    headlineTmpl: [
      "Space environment / ops stress | {place}",
    ],
    summaryTmpl: [
      "Orbital or launch-adjacent scenario: the demo encodes a notional “environment + ops” score near {place}. Conjunction data would come from a catalog + screening pipeline in live mode.",
    ],
    inferenceTmpl: [
      "Maneuver once Pc crosses joint ops threshold; avoid repeated micro-burns that trade lifetime for margin on spam objects.",
    ],
  }),

  demographics: pack({
    anchors: [
      { lat: 19.4, lon: 72.8, label: "Mumbai metro" },
      { lat: 6.5, lon: 3.3, label: "Lagos sprawl" },
      { lat: 30.0, lon: 31.0, label: "Greater Cairo" },
    ],
    signalReasons: [
      "Age-cohort pressure vs service capacity 10y out",
      "Net migration vs housing starts gap (metro synthetic)",
      "Dependency ratio shift vs pension fund stress test",
      "School-age cohort vs teacher hiring pipeline lag",
      "Urban density gradient vs transit capacity index",
    ],
    insightNarratives: [
      "Youth bulge in corridor still rising vs jobs elasticity.",
      "Aging curve inflection in adjacent prefectures — cross-border labour mobility becomes the relief valve in the model.",
    ],
    dominantSourceOptions: [ "UN-WPP-mock", "census-synthetic" ],
    disruptionSets: [
      [
        { entity: "Housing", severity: "moderate", note: "Affordability index vs wage growth gap" },
        { entity: "Services", severity: "watch", note: "School-age pop vs seat growth" },
      ],
    ],
    headlineTmpl: [
      "Demographic stress index | {place}",
    ],
    summaryTmpl: [
      "Scenario on migration pressure and service capacity vs cohort growth at {place}. For planning exercises, not as a forecast of policy.",
    ],
    inferenceTmpl: [
      "Small changes in TFR propagate slowly; the actionable lever is usually infrastructure and labour mobility in a 5–20y window.",
    ],
  }),

  infrastructure: pack({
    anchors: [
      { lat: 51.9, lon: 4.4, label: "Rotterdam port" },
      { lat: 31.2, lon: 121.5, label: "Yangtze estuary" },
      { lat: 29.7, lon: -95.2, label: "Houston port / chem" },
    ],
    signalReasons: [
      "Node downtime vs redundant path availability",
      "Substation transformer oil temp vs ambient anomaly",
      "DNS resolver RTT vs anycast site health",
      "Water pump station vibration RMS vs baseline",
      "Fiber cut MTTR vs SLA ring (synthetic)",
    ],
    insightNarratives: [
      "Cascading failure test: loss of N-1 in mesh still isolates a county.",
      "Intermodal choke coupling port + rail in the scenario — reroute margin is hours, not days.",
    ],
    dominantSourceOptions: [ "BTS/NERC-mock", "port-authority-synthetic" ],
    disruptionSets: [
      [
        { entity: "Water", severity: "high", note: "Treatment plant headroom < 6h at peak draw" },
        { entity: "Telecom", severity: "moderate", note: "Backhaul link diversity below policy min" },
      ],
    ],
    headlineTmpl: [
      "Critical infrastructure | {place}",
    ],
    summaryTmpl: [
      "Interdependent node stress test near {place}: water, power, and transport cross-links in the notional model. Use for BCP exercises.",
    ],
    inferenceTmpl: [
      "When two layers share a right-of-way, single-point failures dominate expected loss; redundancy must be path-diverse, not name-diverse.",
    ],
  }),
};

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/**
 * An anchor and label for events of this domain (deterministic by index).
 */
export function anchorForDomain(
  domain: string,
  index: number,
  rng: () => number,
): Anchor {
  const pack = DOMAIN_DEMO[domain as DomainId];
  const p = pack?.anchors?.length ? pack.anchors : GENERIC;
  const base = p[index % p.length] ?? GENERIC[0]!;
  const j = () => (rng() - 0.5) * 2.2;
  return {
    lat: Math.max(-85, Math.min(85, base.lat + j())),
    lon: ((base.lon + (rng() - 0.5) * 3 + 180) % 360) - 180,
    label: base.label,
  };
}

function packFor(d: string): DomainPack {
  return DOMAIN_DEMO[d as DomainId] ?? DOMAIN_DEMO.infrastructure;
}

/**
 * High-severity narrative block for the event.
 */
export function buildDemoNarrativeBlock(
  domain: string,
  place: string,
  severity: number,
  rng: () => number,
  _eventId: string,
  _nowIso: string,
): {
  headline: string;
  summary: string;
  inference: string;
  predicted_disruption: { entity: string; severity: string; note: string }[];
} {
  const p = packFor(domain);
  const sevPct = (severity * 100).toFixed(0);
  const h = pick(rng, p.headlineTmpl)
    .replace("{place}", place)
    .replace("{sevpct}", sevPct);
  const s = pick(rng, p.summaryTmpl).replace("{place}", place).replace("{domain}", domain);
  const i = pick(rng, p.inferenceTmpl);
  const dis = pick(rng, p.disruptionSets).map((x) => ({ ...x }));
  return {
    headline: h,
    summary: s,
    inference: i,
    predicted_disruption: dis,
  };
}

export function demoSignalReason(domain: string, rng: () => number): string {
  const p = packFor(domain);
  const g = p.signalReasons;
  if (g.length) return pick(rng, g);
  return "Threshold crossing — model residual outside 24h envelope";
}

export function demoInsightNarrative(domain: string, rng: () => number): string {
  return pick(rng, packFor(domain).insightNarratives);
}

export function demoDominantSource(domain: string, rng: () => number): string | null {
  return pick(rng, packFor(domain).dominantSourceOptions);
}
