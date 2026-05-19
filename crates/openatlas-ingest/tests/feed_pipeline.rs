//! End-to-end ingest pipeline tests (parse → normalize → validate → core graph).

use chrono::Utc;
use openatlas_core::{Domain, WorldGraph};
use openatlas_ingest::feeds::normalize::{assert_graph_accepts, ObservationDraft};
use openatlas_ingest::validate::{filter_valid_events, validate_event};

#[test]
fn observation_draft_round_trips_through_core_graph() {
    let event = ObservationDraft::new("test-key", Utc::now(), Domain::Finance, 0.55)
        .into_event("fred", "https://fred.stlouisfed.org/")
        .expect("valid event");
    assert_graph_accepts(event).expect("core graph accepts");
}

#[test]
fn filter_valid_events_drops_invalid_severity() {
    use openatlas_core::{Location, WorldEvent};
    use serde_json::json;
    use uuid::Uuid;

    let good = WorldEvent {
        id: Uuid::new_v4(),
        timestamp: Utc::now(),
        domain: Domain::Seismic,
        location: Some(Location {
            lat: 0.0,
            lon: 0.0,
            region_tags: vec![],
        }),
        severity_score: 0.5,
        payload: json!({}),
    };
    let mut bad = good.clone();
    bad.severity_score = f64::NAN;
    let (kept, rejected) = filter_valid_events(vec![good.clone(), bad]);
    assert_eq!(kept.len(), 1);
    assert_eq!(rejected, 1);
    validate_event(&kept[0]).unwrap();
}

#[test]
fn core_graph_rejects_duplicate_ids() {
    let event = ObservationDraft::new("dup", Utc::now(), Domain::Energy, 0.3)
        .into_event("eia", "https://www.eia.gov/")
        .expect("event");
    let mut g = WorldGraph::default();
    g.ingest_event(event.clone()).unwrap();
    assert!(g.ingest_event(event).is_err());
}
