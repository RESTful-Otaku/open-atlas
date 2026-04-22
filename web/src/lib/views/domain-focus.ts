/**
 * Optional “operator focus” copy shown on each domain desk — tuned to how
 * the domain is *used* in OpenAtlas, not a repeat of the nav blurb.
 */
export const DOMAIN_DESK_FOCUS: Readonly<Record<string, string>> = {
  energy:
    "Favour the KPI strip and high-severity events first: grid and fuel shocks propagate fast as cascaded signals.",
  finance:
    "Use live risk with price-style signals: pair this desk with the economic matrix for scenario overlays.",
  climate:
    "Weather and long-horizon stress: interpret spikes alongside climatology baselines, not a single read.",
  seismic:
    "Hazard-dense: recency and magnitude dominate triage. Cross-check with transport and health if a tsunami or exposure path exists.",
  transport:
    "Route and corridor visibility: the 2D map with this filter shows geographic coupling your KPIs can’t list alone.",
  health:
    "Outbreak and surge posture: look for anomaly count plus severity together before drilling event detail.",
  geospatial:
    "Coordinate-heavy domain: the map is the natural second screen; narrative insight explains what changed, not just where.",
  economy:
    "Macro pulse: the signal stream and causal hints matter as much as rolling counts — use matrices for what-if context.",
  geopolitics:
    "Slower-moving but high-impact: read narrative insight for posture shifts; use threat matrices for structured command views.",
  cyber:
    "High-event-rate domain: de-duplicate with severity and the cyber matrix to avoid alert fatigue in triage.",
  space:
    "Regime and object tracking: pair this desk with compute / orbital panels when you need catalogue-scale context.",
  demographics:
    "Census- and sample-scale: trends update slowly; trust anomaly flags over single-point blips in quiet regions.",
  infrastructure:
    "Node and dependency graph: failures are often second-order; follow causal edges when severity alone is flat.",
};
