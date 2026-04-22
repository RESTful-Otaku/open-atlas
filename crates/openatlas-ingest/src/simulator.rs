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

use crate::{state::AppState, stdb::IngestOutcome};

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
];

pub(crate) fn spawn_simulators(state: AppState) {
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
                match state
                    .stdb
                    .ingest_event(&event, source, "internal://simulator")
                    .await
                {
                    Ok(IngestOutcome::Accepted) | Ok(IngestOutcome::Duplicate) => {}
                    Err(error) => {
                        error!(source, "simulator failed to push event: {error:#}");
                    }
                }
            }
        });
    }
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
    let severity_score = (base_severity + variance).min(1.0);

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
