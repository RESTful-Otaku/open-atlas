//! Deterministic static event burst for CI, demos, and regression tests.

use crate::{feeds::deterministic_event_id, pipeline::push_events_via_state, state::AppState};
use chrono::{TimeZone, Utc};
use openatlas_core::{Domain, Location, WorldEvent};
use serde_json::json;
use tracing::{info, warn};

const SOURCE: &str = "static-fixtures";
const SOURCE_URL: &str = "internal://fixtures";

pub async fn push_static_fixtures(state: &AppState) {
    let events = static_events();
    let total = events.len();
    let push = push_events_via_state(state, events, SOURCE, SOURCE_URL).await;
    if push.transport_errors > 0 {
        warn!(
            source = SOURCE,
            transport_errors = push.transport_errors,
            "static fixture burst had transport errors"
        );
    }

    info!(
        source = SOURCE,
        accepted = push.accepted,
        duplicate = push.duplicates,
        rejected = push.rejected,
        total,
        "static fixture burst complete"
    );
}

fn static_events() -> Vec<WorldEvent> {
    let base = Utc.with_ymd_and_hms(2026, 1, 15, 12, 0, 0).unwrap();
    let specs: &[(&str, Domain, f64, f64, f64, f64)] = &[
        (
            "energy-tokyo-grid",
            Domain::Energy,
            35.68,
            139.69,
            0.62,
            0.71,
        ),
        (
            "finance-nyc-vol",
            Domain::Finance,
            40.71,
            -74.01,
            0.58,
            0.66,
        ),
        (
            "climate-heat-paris",
            Domain::Climate,
            48.86,
            2.35,
            0.54,
            0.61,
        ),
        (
            "seismic-istanbul",
            Domain::Seismic,
            41.01,
            28.98,
            0.88,
            0.91,
        ),
        (
            "transport-suez",
            Domain::Transport,
            30.01,
            32.56,
            0.48,
            0.55,
        ),
        ("health-lagos", Domain::Health, 6.52, 3.38, 0.51, 0.59),
        (
            "geospatial-amazon",
            Domain::Geospatial,
            -3.47,
            -62.21,
            0.46,
            0.52,
        ),
        ("economy-berlin", Domain::Economy, 52.52, 13.41, 0.44, 0.5),
        (
            "geopolitics-taipei",
            Domain::Geopolitics,
            25.03,
            121.57,
            0.86,
            0.89,
        ),
        ("cyber-frankfurt", Domain::Cyber, 50.11, 8.68, 0.6, 0.69),
        (
            "space-cape-canaveral",
            Domain::Space,
            28.39,
            -80.61,
            0.43,
            0.49,
        ),
        (
            "demographics-mumbai",
            Domain::Demographics,
            19.08,
            72.88,
            0.41,
            0.47,
        ),
        (
            "infrastructure-la-power",
            Domain::Infrastructure,
            34.05,
            -118.24,
            0.57,
            0.64,
        ),
        ("energy-north-sea", Domain::Energy, 56.0, 3.0, 0.5, 0.58),
        (
            "finance-london-fx",
            Domain::Finance,
            51.51,
            -0.13,
            0.55,
            0.63,
        ),
        (
            "climate-arctic-ice",
            Domain::Climate,
            78.0,
            15.0,
            0.49,
            0.56,
        ),
        ("seismic-chile", Domain::Seismic, -33.45, -70.67, 0.87, 0.9),
        (
            "transport-singapore-port",
            Domain::Transport,
            1.29,
            103.85,
            0.47,
            0.54,
        ),
        ("health-geneva", Domain::Health, 46.2, 6.14, 0.42, 0.48),
        (
            "geospatial-sahara",
            Domain::Geospatial,
            23.0,
            12.0,
            0.45,
            0.51,
        ),
        (
            "economy-sao-paulo",
            Domain::Economy,
            -23.55,
            -46.63,
            0.53,
            0.6,
        ),
        (
            "geopolitics-kyiv",
            Domain::Geopolitics,
            50.45,
            30.52,
            0.91,
            0.94,
        ),
        ("cyber-sydney", Domain::Cyber, -33.87, 151.21, 0.59, 0.67),
        ("space-baikonur", Domain::Space, 45.96, 63.31, 0.44, 0.5),
        (
            "demographics-cairo",
            Domain::Demographics,
            30.04,
            31.24,
            0.4,
            0.46,
        ),
        (
            "infrastructure-dubai-grid",
            Domain::Infrastructure,
            25.2,
            55.27,
            0.56,
            0.65,
        ),
    ];

    specs
        .iter()
        .enumerate()
        .map(|(idx, (key, domain, lat, lon, severity, risk_hint))| {
            let id = deterministic_event_id(SOURCE, key);
            let ts = base + chrono::Duration::minutes(i64::from(idx as u32) * 7);
            WorldEvent {
                id,
                timestamp: ts,
                domain: *domain,
                location: Some(Location {
                    lat: *lat,
                    lon: *lon,
                    region_tags: vec!["fixture".to_owned()],
                }),
                severity_score: *severity,
                payload: json!({
                    "fixture_key": key,
                    "risk_hint": risk_hint,
                    "static": true,
                    "source_url": SOURCE_URL,
                }),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn static_fixture_set_covers_every_domain() {
        let events = static_events();
        assert_eq!(events.len(), 26);
        let mut seen = std::collections::HashSet::new();
        for event in events {
            seen.insert(event.domain.as_str().to_owned());
        }
        assert_eq!(seen.len(), openatlas_core::Domain::ALL.len());
    }
}
