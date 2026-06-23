

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{domain::Domain, error::CoreError};

/// Geospatial location tied to an event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Location {
    pub lat: f64,
    pub lon: f64,
    #[serde(default)]
    pub region_tags: Vec<String>,
}

impl Location {
    pub fn new(lat: f64, lon: f64, region_tags: Vec<String>) -> Result<Self, CoreError> {
        if !(-90.0..=90.0).contains(&lat) {
            return Err(CoreError::InvalidConfig(format!("lat {lat} out of range")));
        }
        if !(-180.0..=180.0).contains(&lon) {
            return Err(CoreError::InvalidConfig(format!("lon {lon} out of range")));
        }
        Ok(Self { lat, lon, region_tags })
    }
}

/// Canonical observation unit.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorldEvent {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub domain: Domain,
    pub location: Option<Location>,
    pub severity_score: f64,
    pub payload: Value,
}

/// Aggregated per-domain state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorldState {
    pub domain: Domain,
    pub event_count: u64,
    pub avg_severity: f64,
    pub risk_index: f64,
    pub last_updated: DateTime<Utc>,
}

/// Entity reference.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EntityNode {
    pub id: Uuid,
    pub label: String,
    pub domain: Domain,
    #[serde(default)]
    pub metadata: Value,
}

/// Causal relationship between two events.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CausalEdge {
    pub source_event_id: Uuid,
    pub target_event_id: Uuid,
    pub influence_score: f64,
    pub decay_rate: f64,
}

/// Inference engine signal that an event is noteworthy.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Signal {
    pub event_id: Uuid,
    pub domain: Domain,
    pub score: f64,
    pub reason: String,
}

/// Forward-looking projection.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Prediction {
    pub domain: Domain,
    pub horizon_seconds: u64,
    pub projected_risk_index: f64,
}

/// Filter over `WorldGraph` events.
#[derive(Debug, Clone, Default)]
pub struct QueryFilters {
    pub domain: Option<Domain>,
    pub min_severity: Option<f64>,
    pub region_tag: Option<String>,
    pub since: Option<DateTime<Utc>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use serde_json::json;

    fn sample_location() -> Location {
        Location {
            lat: 51.5074,
            lon: -0.1278,
            region_tags: vec!["europe".to_owned(), "uk".to_owned()],
        }
    }

    fn sample_uuid() -> Uuid {
        Uuid::parse_str("11111111-1111-1111-1111-111111111111").unwrap()
    }

    fn sample_event() -> WorldEvent {
        WorldEvent {
            id: sample_uuid(),
            timestamp: Utc::now(),
            domain: Domain::Climate,
            location: Some(sample_location()),
            severity_score: 0.75,
            payload: json!({"metric": "temperature", "value": 42.5}),
        }
    }

    fn sample_state() -> WorldState {
        WorldState {
            domain: Domain::Climate,
            event_count: 10,
            avg_severity: 0.5,
            risk_index: 0.5,
            last_updated: Utc::now(),
        }
    }

    fn sample_causal_edge() -> CausalEdge {
        CausalEdge {
            source_event_id: sample_uuid(),
            target_event_id: Uuid::parse_str("33333333-3333-3333-3333-333333333333").unwrap(),
            influence_score: 0.8,
            decay_rate: 0.1,
        }
    }

    #[test]
    fn location_construction() {
        let loc = sample_location();
        assert!((loc.lat - 51.5074).abs() < 1e-10);
        assert!((loc.lon - (-0.1278)).abs() < 1e-10);
        assert_eq!(loc.region_tags, vec!["europe", "uk"]);
    }

    #[test]
    fn location_serde_roundtrip() {
        let loc = sample_location();
        let json = serde_json::to_string(&loc).unwrap();
        let deserialized: Location = serde_json::from_str(&json).unwrap();
        assert_eq!(loc, deserialized);
    }

    #[test]
    fn location_region_tags_default() {
        let json = r#"{"lat": 0.0, "lon": 0.0}"#;
        let loc: Location = serde_json::from_str(json).unwrap();
        assert!(loc.region_tags.is_empty());
    }

    #[test]
    fn world_event_construction() {
        let event = sample_event();
        assert_eq!(event.id, sample_uuid());
        assert_eq!(event.domain, Domain::Climate);
        assert_eq!(event.severity_score, 0.75);
        assert!(event.location.is_some());
    }

    #[test]
    fn world_event_serde_roundtrip() {
        let event = sample_event();
        let json = serde_json::to_string(&event).unwrap();
        let deserialized: WorldEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(event, deserialized);
    }

    #[test]
    fn world_event_severity_at_lower_bound() {
        let event = WorldEvent {
            severity_score: 0.0,
            ..sample_event()
        };
        let json = serde_json::to_string(&event).unwrap();
        let deserialized: WorldEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.severity_score, 0.0);
    }

    #[test]
    fn world_event_severity_at_upper_bound() {
        let event = WorldEvent {
            severity_score: 1.0,
            ..sample_event()
        };
        let json = serde_json::to_string(&event).unwrap();
        let deserialized: WorldEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.severity_score, 1.0);
    }

    #[test]
    fn world_state_construction() {
        let state = sample_state();
        assert_eq!(state.domain, Domain::Climate);
        assert_eq!(state.event_count, 10);
        assert!((state.avg_severity - 0.5).abs() < 1e-10);
        assert!((state.risk_index - 0.5).abs() < 1e-10);
    }

    #[test]
    fn world_state_serde_roundtrip() {
        let state = sample_state();
        let json = serde_json::to_string(&state).unwrap();
        let deserialized: WorldState = serde_json::from_str(&json).unwrap();
        assert_eq!(state, deserialized);
    }

    #[test]
    fn entity_node_construction() {
        let node = EntityNode {
            id: sample_uuid(),
            label: "sensor-42".to_owned(),
            domain: Domain::Climate,
            metadata: json!({"type": "thermometer"}),
        };
        assert_eq!(node.label, "sensor-42");
        assert_eq!(node.metadata, json!({"type": "thermometer"}));
    }

    #[test]
    fn entity_node_default_metadata() {
        let json = r#"{"id": "22222222-2222-2222-2222-222222222222", "label": "node-a", "domain": "climate"}"#;
        let node: EntityNode = serde_json::from_str(json).unwrap();
        assert_eq!(node.metadata, serde_json::Value::Null);
    }

    #[test]
    fn entity_node_serde_roundtrip() {
        let node = EntityNode {
            id: sample_uuid(),
            label: "sensor-42".to_owned(),
            domain: Domain::Energy,
            metadata: json!({"freq": 60}),
        };
        let json = serde_json::to_string(&node).unwrap();
        let deserialized: EntityNode = serde_json::from_str(&json).unwrap();
        assert_eq!(node, deserialized);
    }

    #[test]
    fn causal_edge_construction() {
        let edge = sample_causal_edge();
        assert!((edge.influence_score - 0.8).abs() < 1e-10);
        assert!((edge.decay_rate - 0.1).abs() < 1e-10);
    }

    #[test]
    fn causal_edge_serde_roundtrip() {
        let edge = sample_causal_edge();
        let json = serde_json::to_string(&edge).unwrap();
        let deserialized: CausalEdge = serde_json::from_str(&json).unwrap();
        assert_eq!(edge, deserialized);
    }

    #[test]
    fn causal_edge_preserves_unbounded_values() {
        let edge = CausalEdge {
            influence_score: 1.5,
            decay_rate: -0.1,
            ..sample_causal_edge()
        };
        let json = serde_json::to_string(&edge).unwrap();
        let deserialized: CausalEdge = serde_json::from_str(&json).unwrap();
        assert!((deserialized.influence_score - 1.5).abs() < 1e-10);
        assert!((deserialized.decay_rate - (-0.1)).abs() < 1e-10);
    }

    #[test]
    fn signal_creation() {
        let signal = Signal {
            event_id: sample_uuid(),
            domain: Domain::Cyber,
            score: 0.95,
            reason: "threshold_exceeded".to_owned(),
        };
        assert_eq!(signal.reason, "threshold_exceeded");
        assert!((signal.score - 0.95).abs() < 1e-10);
    }

    #[test]
    fn signal_serde_roundtrip() {
        let signal = Signal {
            event_id: sample_uuid(),
            domain: Domain::Cyber,
            score: 0.95,
            reason: "threshold_exceeded".to_owned(),
        };
        let json = serde_json::to_string(&signal).unwrap();
        let deserialized: Signal = serde_json::from_str(&json).unwrap();
        assert_eq!(signal, deserialized);
    }

    #[test]
    fn prediction_creation() {
        let prediction = Prediction {
            domain: Domain::Finance,
            horizon_seconds: 3600,
            projected_risk_index: 0.42,
        };
        assert_eq!(prediction.horizon_seconds, 3600);
        assert!((prediction.projected_risk_index - 0.42).abs() < 1e-10);
    }

    #[test]
    fn prediction_serde_roundtrip() {
        let prediction = Prediction {
            domain: Domain::Finance,
            horizon_seconds: 3600,
            projected_risk_index: 0.42,
        };
        let json = serde_json::to_string(&prediction).unwrap();
        let deserialized: Prediction = serde_json::from_str(&json).unwrap();
        assert_eq!(prediction, deserialized);
    }

    #[test]
    fn query_filters_default() {
        let filters = QueryFilters::default();
        assert!(filters.domain.is_none());
        assert!(filters.min_severity.is_none());
        assert!(filters.region_tag.is_none());
        assert!(filters.since.is_none());
    }

    #[test]
    fn query_filters_partial_builder() {
        let filters = QueryFilters {
            domain: Some(Domain::Health),
            min_severity: Some(0.5),
            ..Default::default()
        };
        assert_eq!(filters.domain, Some(Domain::Health));
        assert_eq!(filters.min_severity, Some(0.5));
        assert!(filters.region_tag.is_none());
        assert!(filters.since.is_none());
    }

    #[test]
    fn uuid_determinism_across_roundtrips() {
        let uuids = [
            "00000000-0000-0000-0000-000000000000",
            "ffffffff-ffff-ffff-ffff-ffffffffffff",
            "550e8400-e29b-41d4-a716-446655440000",
        ];
        for uuid_str in &uuids {
            let id = Uuid::parse_str(uuid_str).unwrap();
            let event = WorldEvent {
                id,
                ..sample_event()
            };
            let json = serde_json::to_string(&event).unwrap();
            let deserialized: WorldEvent = serde_json::from_str(&json).unwrap();
            assert_eq!(deserialized.id, id);
        }
    }
}
