//! Synthetic event simulators.
//!
//! Used for local development, CI, and as a fallback when live feeds are
//! disabled or unreachable. Each simulator runs on a dedicated tokio task
//! at a fixed cadence and submits events through the `ingest_event`
//! reducer — identical to the live-feed path, so nothing downstream can
//! tell simulated traffic apart from production traffic.

use std::time::Duration;

use openatlas_core::{Domain, Location, WorldEvent};
use rand::Rng;
use serde_json::json;
use tracing::error;
use uuid::Uuid;

use crate::{pipeline::push_events_via_state, state::AppState};

struct Simulator {
    source: &'static str,
    domain: Domain,
    tick_ms: u64,
}

const SIMULATORS: &[Simulator] = &[
    Simulator {
        source: "weather",
        domain: Domain::Climate,
        tick_ms: 1800,
    },
    Simulator {
        source: "finance",
        domain: Domain::Finance,
        tick_ms: 300,
    },
    Simulator {
        source: "earthquake",
        domain: Domain::Seismic,
        tick_ms: 1200,
    },
    Simulator {
        source: "energy",
        domain: Domain::Energy,
        tick_ms: 500,
    },
    Simulator {
        source: "transport",
        domain: Domain::Transport,
        tick_ms: 900,
    },
    Simulator {
        source: "health",
        domain: Domain::Health,
        tick_ms: 1400,
    },
    Simulator {
        source: "geospatial",
        domain: Domain::Geospatial,
        tick_ms: 2000,
    },
    Simulator {
        source: "economy",
        domain: Domain::Economy,
        tick_ms: 1100,
    },
    Simulator {
        source: "geopolitics",
        domain: Domain::Geopolitics,
        tick_ms: 1600,
    },
    Simulator {
        source: "cyber",
        domain: Domain::Cyber,
        tick_ms: 700,
    },
    Simulator {
        source: "space",
        domain: Domain::Space,
        tick_ms: 2200,
    },
    Simulator {
        source: "demographics",
        domain: Domain::Demographics,
        tick_ms: 2500,
    },
    Simulator {
        source: "infrastructure",
        domain: Domain::Infrastructure,
        tick_ms: 950,
    },
];

pub fn spawn_simulators(state: AppState) {
    for sim in SIMULATORS.iter() {
        let state = state.clone();
        let source = sim.source;
        let domain = sim.domain.clone();
        let tick_ms = sim.tick_ms;
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(tick_ms));
            loop {
                interval.tick().await;
                let event = generate_event(source, domain.clone());
                let result =
                    push_events_via_state(&state, vec![event], source, "internal://simulator")
                        .await;
                if result.transport_errors > 0 {
                    error!(source, "simulator failed to push event to STDB");
                }
            }
        });
    }
}

/// Deterministic shape checks for simulators (unit tests).
#[cfg(test)]
pub(crate) fn generate_event_for_test(source: &str, domain: Domain) -> WorldEvent {
    generate_event(source, domain)
}

fn generate_event(source: &str, domain: Domain) -> WorldEvent {
    let mut rng = rand::rng();
    let base_severity = match domain {
        Domain::Climate => 0.4,
        Domain::Finance => 0.5,
        Domain::Seismic => 0.55,
        Domain::Energy => 0.35,
        _ => 0.3,
    };
    let variance: f64 = rng.random_range(0.0..0.5);
    // ~12% cross anomaly threshold (0.85); narrative threshold is 0.5 so
    // moderate sim events also get inference/disruption rows in the module.
    let severity_score = if rng.random_bool(0.12) {
        rng.random_range(0.86..0.99)
    } else {
        (base_severity + variance).min(1.0)
    };

    WorldEvent {
        id: Uuid::new_v4(),
        timestamp: chrono::Utc::now(),
        domain,
        location: Some(Location {
            lat: rng.random_range(-75.0..75.0),
            lon: rng.random_range(-180.0..180.0),
            region_tags: vec!["global".to_owned()],
        }),
        severity_score,
        payload: json!({
            "source": source,
            "source_url": "internal://simulator",
            "value": rng.random_range(0.0..100.0),
            "simulated": true
        }),
    }
}

#[cfg(test)]
mod tests {
    use openatlas_core::Domain;

    use super::*;

    #[test]
    fn simulator_catalog_covers_all_domains() {
        let domains: std::collections::HashSet<_> =
            SIMULATORS.iter().map(|s| s.domain.clone()).collect();
        for d in Domain::ALL.iter() {
            assert!(domains.contains(d), "missing simulator for {:?}", d);
        }
    }

    #[test]
    fn generated_events_are_marked_simulated() {
        let event = generate_event_for_test("finance", Domain::Finance);
        assert!(event
            .payload
            .get("simulated")
            .and_then(|v| v.as_bool())
            .unwrap_or(false));
        assert!(event.severity_score.is_finite());
        assert!((0.0..=1.0).contains(&event.severity_score));
    }
}
