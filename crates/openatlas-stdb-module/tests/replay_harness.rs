//! Reducer replay scaffold — ordered fixture log → reference [`WorldGraph`] oracle.
//!
//! ## Byte-identical contract (target)
//!
//! Per [`OPENATLAS_SPEC.md`](../../../OPENATLAS_SPEC.md): replaying a recorded
//! reducer log against a **fresh** SpacetimeDB instance must yield byte-identical
//! public table contents.
//!
//! This test does **not** invoke WASM reducers yet. It validates:
//! - fixture schema and step ordering;
//! - deterministic ingest through [`openatlas_core::WorldGraph`] (module oracle);
//! - expected row counts as a stepping stone toward per-table snapshot hashes.
//!
//! Next iteration: HTTP reducer replay against `spacetime publish` test DB + hashes.

use std::str::FromStr;

use chrono::{DateTime, Utc};
use openatlas_core::{Domain, Location, WorldEvent, WorldGraph};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

const FIXTURE: &str = include_str!("fixtures/replay_minimal.json");

#[derive(Debug, Deserialize)]
struct ReplayFixture {
    contract_version: u32,
    #[allow(dead_code)]
    description: String,
    steps: Vec<ReplayStep>,
    expect: ReplayExpect,
}

#[derive(Debug, Deserialize)]
struct ReplayStep {
    reducer: String,
    event: ReplayEvent,
}

#[derive(Debug, Deserialize)]
struct ReplayEvent {
    id: String,
    timestamp: String,
    domain: String,
    severity_score: f64,
    location: Option<ReplayLocation>,
    payload: Value,
}

#[derive(Debug, Deserialize)]
struct ReplayLocation {
    lat: f64,
    lon: f64,
    #[serde(default)]
    region_tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ReplayExpect {
    event_count: usize,
    world_state_domain_count_min: usize,
    signal_count_min: usize,
}

fn parse_event(raw: &ReplayEvent) -> WorldEvent {
    let id = Uuid::parse_str(&raw.id).expect("fixture event id uuid");
    let timestamp = DateTime::parse_from_rfc3339(&raw.timestamp)
        .expect("fixture timestamp rfc3339")
        .with_timezone(&Utc);
    let domain = Domain::from_str(&raw.domain).expect("fixture domain");
    let location = raw.location.as_ref().map(|loc| Location {
        lat: loc.lat,
        lon: loc.lon,
        region_tags: loc.region_tags.clone(),
    });
    WorldEvent {
        id,
        timestamp,
        domain,
        location,
        severity_score: raw.severity_score,
        payload: raw.payload.clone(),
    }
}

#[test]
fn replay_minimal_fixture_matches_row_counts() {
    let fixture: ReplayFixture = serde_json::from_str(FIXTURE).expect("parse replay fixture");
    assert_eq!(fixture.contract_version, 1);

    let mut graph = WorldGraph::default();

    for step in &fixture.steps {
        assert_eq!(
            step.reducer, "ingest_event",
            "scaffold supports ingest_event only"
        );
        let event = parse_event(&step.event);
        graph
            .ingest_event(event)
            .expect("deterministic ingest must succeed");
    }

    assert_eq!(graph.events.len(), fixture.expect.event_count);
    assert!(graph.signals.len() >= fixture.expect.signal_count_min);
    assert!(
        graph.world_state.len() >= fixture.expect.world_state_domain_count_min,
        "world_state domains: got {}, want >= {}",
        graph.world_state.len(),
        fixture.expect.world_state_domain_count_min
    );
}

#[test]
fn replay_fixture_contract_version_documented() {
    let fixture: ReplayFixture = serde_json::from_str(FIXTURE).expect("parse");
    assert!(
        !fixture.description.is_empty(),
        "fixture must document replay intent"
    );
}
