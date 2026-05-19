//! Deterministic event-narrative builders.
//!
//! # Purpose
//!
//! The UI's Event Detail view wants a short operator-facing narrative
//! (headline, summary, inference, predicted disruption list) alongside
//! every high-severity event. We don't want to fabricate this on the
//! client — doing so would diverge across reloads, browsers, and
//! replays. Instead, reducers write a deterministic [`EventNarrativeFields`]
//! row into the `event_narrative` table when an event crosses the
//! configured severity threshold, and the Event Detail view simply
//! renders whatever it finds.
//!
//! # Determinism
//!
//! Everything here is pure. No wall-clock reads, no RNG, no HashMap
//! iteration. Given identical inputs the output is byte-for-byte
//! identical — which means narratives survive a full event-log replay.
//!
//! # Why a separate module?
//!
//! `lib.rs` is already long and owns the reducer plumbing. Extracting
//! the narrative composition here keeps the composition functions
//! trivially unit-testable and keeps `lib.rs` focused on table/reducer
//! wiring.

/// Severity threshold above which an event gets an `event_narrative` row.
/// Signals still use [`crate::ANOMALY_THRESHOLD`] (0.85); narratives are
/// written for moderate+ events so operators see inference and disruption
/// text on typical feed severities, not only anomaly-tier spikes.
pub const NARRATIVE_SEVERITY_THRESHOLD: f64 = 0.5;

/// Stable numeric domain tag → human-readable domain label. Kept
/// colocated with the narrative builders because the labels are
/// display-facing string constants; reusing `openatlas_core::Domain`
/// would drag in the whole `serde` stack.
const DOMAIN_LABELS: &[&str] = &[
    "energy",
    "finance",
    "climate",
    "seismic",
    "transport",
    "health",
    "geospatial",
    "economy",
    "geopolitics",
    "cyber",
    "space",
    "demographics",
    "infrastructure",
];

/// The fields a narrative row stores, independent of SpacetimeDB's
/// table wrapper. Extracted so we can unit-test the builder without
/// dragging reducer machinery into scope.
#[derive(Debug, Clone, PartialEq)]
pub struct EventNarrativeFields {
    pub headline: String,
    pub summary: String,
    pub inference: String,
    pub predicted_disruption_json: String,
}

/// Inputs the narrative builder needs. Flat primitives only — no
/// references to the SpacetimeDB row types so this stays portable.
#[derive(Debug, Clone, Copy)]
pub struct NarrativeContext<'a> {
    /// Primary key on the resulting `EventNarrative` row. Not rendered
    /// in the narrative text but threaded through so callers can use a
    /// single struct for both the builder call and the row insert.
    #[allow(dead_code)]
    pub event_id: u64,
    pub ordinal: u64,
    pub domain: u8,
    pub severity_score: f64,
    pub location: Option<(f64, f64)>,
    pub dominant_source: &'a str,
    pub anomaly_count_recent: u32,
    pub trend: &'a str,
}

/// Operator-facing domain desk summary (stored on `domain_insight.narrative`).
pub fn build_domain_insight_narrative(
    domain: u8,
    trend: &str,
    anomaly_count_recent: u32,
    dominant_source: &str,
    risk_index: f64,
) -> String {
    let label = domain_label(domain);
    let posture = match trend {
        "up" => "worsening",
        "down" => "improving",
        "flat" => "stable",
        _ => "uncertain",
    };
    let risk_pct = (risk_index.clamp(0.0, 1.0) * 100.0).round() as u32;
    format!(
        "{} domain posture is {} (risk index {}%) with {} recent anomaly signals. Primary feed: {}.",
        capitalise_first(label),
        posture,
        risk_pct,
        anomaly_count_recent,
        display_source(dominant_source),
    )
}

/// Build a deterministic narrative from the context. Safe to call from
/// reducers; safe to replay.
pub fn build_narrative(ctx: &NarrativeContext<'_>) -> EventNarrativeFields {
    let domain_label = domain_label(ctx.domain);
    let severity_pct = (ctx.severity_score.clamp(0.0, 1.0) * 100.0).round() as u32;
    let posture = severity_posture(ctx.severity_score);

    let location_fragment = ctx
        .location
        .map(|(lat, lon)| format!(" near ({lat:.2}, {lon:.2})"))
        .unwrap_or_default();

    let headline = format!(
        "{}{} — {} posture",
        capitalise_first(domain_label),
        location_fragment,
        posture
    );

    let summary = format!(
        "Event #{} in the {} domain registered severity {}% with trend {}. Source: {}. \
         {} anomaly signals observed in the recent window.",
        ctx.ordinal,
        domain_label,
        severity_pct,
        ctx.trend,
        display_source(ctx.dominant_source),
        ctx.anomaly_count_recent,
    );

    let inference = build_inference(ctx.domain, ctx.severity_score, ctx.trend);

    let predicted_disruption_json = build_disruptions(ctx.domain, ctx.severity_score);

    EventNarrativeFields {
        headline,
        summary,
        inference,
        predicted_disruption_json,
    }
}

fn domain_label(tag: u8) -> &'static str {
    DOMAIN_LABELS
        .get(tag as usize)
        .copied()
        .unwrap_or("unknown")
}

fn severity_posture(score: f64) -> &'static str {
    if !score.is_finite() || score < 0.0 {
        return "nominal";
    }
    match score {
        s if s >= 0.95 => "critical",
        s if s >= 0.85 => "severe",
        s if s >= 0.7 => "elevated",
        s if s >= 0.5 => "watch",
        _ => "nominal",
    }
}

fn capitalise_first(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => {
            let mut out = String::with_capacity(value.len());
            for upper in first.to_uppercase() {
                out.push(upper);
            }
            out.push_str(chars.as_str());
            out
        }
        None => String::new(),
    }
}

fn display_source(source: &str) -> &str {
    if source.is_empty() {
        "unknown source"
    } else {
        source
    }
}

fn build_inference(domain: u8, severity: f64, trend: &str) -> String {
    let risk = match severity {
        s if s >= 0.95 => "immediate",
        s if s >= 0.85 => "acute",
        s if s >= 0.7 => "heightened",
        _ => "moderate",
    };
    let trend_note = match trend {
        "up" => "severity trending upward",
        "down" => "severity easing",
        "flat" => "severity stable",
        _ => "trend not yet established",
    };
    let domain_phrase = match domain_label(domain) {
        "geopolitics" => "regional escalation",
        "cyber" => "infrastructure exposure",
        "climate" => "environmental disruption",
        "health" => "epidemiological pressure",
        "transport" => "corridor throughput impact",
        "economy" | "finance" => "market liquidity impact",
        "space" => "orbital coordination pressure",
        "demographics" => "population-movement pressure",
        "infrastructure" => "service-availability pressure",
        "seismic" => "geotechnical disturbance",
        "energy" => "grid stress",
        "geospatial" => "localized disturbance",
        _ => "operational impact",
    };
    format!("{risk} {domain_phrase}; {trend_note}. Operator attention recommended.")
}

fn build_disruptions(domain: u8, severity: f64) -> String {
    let base_severity = severity_posture(severity);
    let entries = match domain_label(domain) {
        "geopolitics" => vec![
            (
                "neighbouring regions",
                "elevated",
                "secondary escalation risk",
            ),
            (
                "supply chains",
                base_severity,
                "disrupted transit corridors",
            ),
        ],
        "cyber" => vec![
            ("connected services", "elevated", "lateral movement risk"),
            ("dependent clients", base_severity, "availability impact"),
        ],
        "climate" => vec![
            ("downstream watersheds", base_severity, "flood/drought risk"),
            ("air travel", "elevated", "route disruption"),
        ],
        "health" => vec![
            ("adjacent populations", base_severity, "transmission risk"),
            ("healthcare capacity", "elevated", "load increase"),
        ],
        "transport" => vec![
            ("connected hubs", base_severity, "throughput degradation"),
            ("just-in-time supply", "elevated", "inventory stress"),
        ],
        "energy" => vec![
            ("interconnected grids", base_severity, "load shedding risk"),
            (
                "price-sensitive markets",
                "elevated",
                "spot-price volatility",
            ),
        ],
        "finance" | "economy" => vec![
            ("correlated markets", base_severity, "liquidity stress"),
            ("credit spreads", "elevated", "widening risk"),
        ],
        "space" => vec![
            ("co-altitude satellites", base_severity, "maneuver window"),
            ("ground stations", "elevated", "telemetry congestion"),
        ],
        "demographics" => vec![
            ("neighbouring regions", base_severity, "migration pressure"),
            ("receiving cities", "elevated", "service-demand spike"),
        ],
        "infrastructure" => vec![
            ("dependent services", base_severity, "partial outage risk"),
            ("redundancy pool", "elevated", "capacity draw-down"),
        ],
        "seismic" => vec![
            (
                "local infrastructure",
                base_severity,
                "integrity check required",
            ),
            ("regional transport", "elevated", "route verification"),
        ],
        _ => vec![("local area", base_severity, "localized impact")],
    };

    let mut out = String::from("[");
    for (idx, (entity, sev, note)) in entries.iter().enumerate() {
        if idx > 0 {
            out.push(',');
        }
        // Hand-rolled JSON: dependencies already carry serde_json, but
        // a handful of strings with no user content is cheaper and
        // keeps the function allocation-predictable.
        out.push_str(&format!(
            r#"{{"entity":"{entity}","severity":"{sev}","note":"{note}"}}"#
        ));
    }
    out.push(']');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> NarrativeContext<'static> {
        NarrativeContext {
            event_id: 7,
            ordinal: 42,
            domain: 8, // geopolitics
            severity_score: 0.92,
            location: Some((34.5, -118.2)),
            dominant_source: "ACLED",
            anomaly_count_recent: 3,
            trend: "up",
        }
    }

    #[test]
    fn narrative_is_deterministic() {
        let a = build_narrative(&ctx());
        let b = build_narrative(&ctx());
        assert_eq!(a, b);
    }

    #[test]
    fn headline_includes_domain_and_location() {
        let out = build_narrative(&ctx());
        assert!(out.headline.contains("Geopolitics"));
        assert!(out.headline.contains("(34.50, -118.20)"));
    }

    #[test]
    fn summary_mentions_ordinal_trend_source() {
        let out = build_narrative(&ctx());
        assert!(out.summary.contains("#42"));
        assert!(out.summary.contains("trend up"));
        assert!(out.summary.contains("ACLED"));
    }

    #[test]
    fn disruption_json_is_well_formed() {
        let out = build_narrative(&ctx());
        let parsed: serde_json::Value = serde_json::from_str(&out.predicted_disruption_json)
            .expect("disruption JSON must parse");
        let arr = parsed.as_array().expect("expected array");
        assert!(!arr.is_empty());
        for row in arr {
            assert!(row.get("entity").and_then(|v| v.as_str()).is_some());
            assert!(row.get("severity").and_then(|v| v.as_str()).is_some());
            assert!(row.get("note").and_then(|v| v.as_str()).is_some());
        }
    }

    #[test]
    fn unknown_domain_degrades_gracefully() {
        let mut c = ctx();
        c.domain = 99;
        let out = build_narrative(&c);
        assert!(out.headline.contains("Unknown"));
    }

    #[test]
    fn low_severity_uses_nominal_posture() {
        let mut c = ctx();
        c.severity_score = 0.1;
        let out = build_narrative(&c);
        assert!(out.headline.contains("nominal"));
    }

    #[test]
    fn domain_insight_narrative_is_human_readable() {
        let text = build_domain_insight_narrative(0, "up", 4, "EIA", 0.62);
        assert!(text.contains("Energy"));
        assert!(text.contains("worsening"));
        assert!(text.contains("62%"));
        assert!(text.contains("EIA"));
    }
}
