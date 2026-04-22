/**
 * Short, operator-facing copy for the event detail view: what each domain
 * stream represents in the OpenAtlas model (synthetic or live).
 */
export const DOMAIN_STREAM_EXPLANATION: Readonly<Record<string, { title: string; body: string }>> = {
  energy: {
    title: "What “Energy” means here",
    body:
      "Inter-grid flows, price spikes, fuel mix shifts, and operational stress on generation and transmission. Higher severity typically reflects deviation from day-ahead schedules or cross-border import limits tightening.",
  },
  finance: {
    title: "What “Finance” means here",
    body:
      "Asset volatility, credit spreads, and liquidity / regime-change indicators aggregated from listed markets. Extreme scores flag coordinated drawdowns or funding stress, not a single tick.",
  },
  climate: {
    title: "What “Climate” means here",
    body:
      "Hazard and anomaly layers: heat/cold, precipitation, wind, and compound risk vs seasonal baselines. Georeferenced when the feed supplies coordinates (e.g. city stations, reanalysis cells).",
  },
  seismic: {
    title: "What “Seismic” means here",
    body:
      "Earthquake catalog signals (e.g. USGS): magnitude, depth, and felt-area proxies drive severity. Regional clusters can elevate domain risk when aftershock density exceeds norms.",
  },
  transport: {
    title: "What “Transport” means here",
    body:
      "Aviation, maritime, and surface movement anomalies: track density, delay propagation, and corridor saturation (e.g. from ADS-B or AIS class feeds in live mode).",
  },
  health: {
    title: "What “Health” means here",
    body:
      "Epidemiological and health-system load proxies: case velocity, care-capacity stress, and cross-border pathogen watch signals. Synthetic demo uses country-level health-admin style spikes.",
  },
  geospatial: {
    title: "What “Geospatial” means here",
    body:
      "Remote sensing, land change, and conflict-adjacent border monitoring: fire, water, and built-environment deltas versus rolling baselines.",
  },
  economy: {
    title: "What “Economy” means here",
    body:
      "Macro prints and high-frequency nowcasts: GDP, labour, prices, and trade, mapped to country centroids. Severity tracks surprise vs consensus and policy-relevant threshold breaches.",
  },
  geopolitics: {
    title: "What “Geopolitics” means here",
    body:
      "Sanctions, election integrity, and diplomatic / military posturing events tagged by region. Synthetic rows simulate escalation ladders and de-escalation windows.",
  },
  cyber: {
    title: "What “Cyber” means here",
    body:
      "Defensive telemetry: DDoS, ransomware campaigns, and sector-targeted activity clusters, normalized across vendors and national CSIRTs. No exploit detail — impact and spread only.",
  },
  space: {
    title: "What “Space” means here",
    body:
      "LEO/GEO environment and launch activity: conjunction density, launch cadence, and ground-segment comms. Demo ties to notional overpasses and downlink health.",
  },
  demographics: {
    title: "What “Demographics” means here",
    body:
      "Population pressure, migration stress, and urban density change versus census/UN-style trajectories, used to stress social services and labour markets in scenarios.",
  },
  infrastructure: {
    title: "What “Infrastructure” means here",
    body:
      "Power, water, transport, and telecom nodes: downtime, load margin, and cross-node dependency risk. Port and strait disruption scores blend maritime and hinterland logistics.",
  },
};
