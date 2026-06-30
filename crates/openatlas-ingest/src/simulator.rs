//! Synthetic event simulators for local dev and CI.

use std::time::Duration;

use openatlas_core::{Domain, Location, WorldEvent};
use rand::{Rng, SeedableRng};
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
        tick_ms: 3000,
    },
    Simulator {
        source: "finance",
        domain: Domain::Finance,
        tick_ms: 1000,
    },
    Simulator {
        source: "earthquake",
        domain: Domain::Seismic,
        tick_ms: 2000,
    },
    Simulator {
        source: "energy",
        domain: Domain::Energy,
        tick_ms: 1500,
    },
    Simulator {
        source: "transport",
        domain: Domain::Transport,
        tick_ms: 2000,
    },
    Simulator {
        source: "health",
        domain: Domain::Health,
        tick_ms: 3000,
    },
    Simulator {
        source: "geospatial",
        domain: Domain::Geospatial,
        tick_ms: 3500,
    },
    Simulator {
        source: "economy",
        domain: Domain::Economy,
        tick_ms: 2000,
    },
    Simulator {
        source: "geopolitics",
        domain: Domain::Geopolitics,
        tick_ms: 3000,
    },
    Simulator {
        source: "cyber",
        domain: Domain::Cyber,
        tick_ms: 2000,
    },
    Simulator {
        source: "space",
        domain: Domain::Space,
        tick_ms: 4000,
    },
    Simulator {
        source: "demographics",
        domain: Domain::Demographics,
        tick_ms: 4000,
    },
    Simulator {
        source: "infrastructure",
        domain: Domain::Infrastructure,
        tick_ms: 2500,
    },
];

pub fn spawn_simulators(state: AppState) {
    for (i, sim) in SIMULATORS.iter().enumerate() {
        let state = state.clone();
        let source = sim.source;
        let domain = sim.domain;
        let tick_ms = sim.tick_ms;
        tokio::spawn(async move {
            let jitter = Duration::from_millis(tick_ms / 4 * i as u64);
            tokio::time::sleep(jitter).await;
            let mut interval = tokio::time::interval(Duration::from_millis(tick_ms));
            // Each simulator gets its own RNG seeded from a unique base so
            // the coordinate stream diverges across tasks and progresses
            // forward within each task.
            let mut rng = rand::rngs::StdRng::seed_from_u64(42 + i as u64);
            loop {
                interval.tick().await;
                let event = generate_event(source, domain, &mut rng);
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

#[cfg(test)]
pub(crate) fn generate_event_for_test(source: &str, domain: Domain) -> WorldEvent {
    let mut rng = rand::rngs::StdRng::seed_from_u64(42);
    generate_event(source, domain, &mut rng)
}

fn generate_event<R: Rng>(source: &str, domain: Domain, rng: &mut R) -> WorldEvent {
    let base_severity = match domain {
        Domain::Climate => 0.4,
        Domain::Finance => 0.5,
        Domain::Seismic => 0.55,
        Domain::Energy => 0.35,
        _ => 0.3,
    };
    let variance: f64 = rng.random_range(0.0..0.5);
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
        let domains: std::collections::HashSet<_> = SIMULATORS.iter().map(|s| s.domain).collect();
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
