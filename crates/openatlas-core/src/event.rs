//! Value-type DTOs that flow through the system. Every type here is serde-
//! serialisable, content-addressable, and free of hidden side effects.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::domain::Domain;

/// Geospatial location tied to an event. Optional because some domains (e.g.
/// macroeconomic indicators) lack a single point of origin.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Location {
    pub lat: f64,
    pub lon: f64,
    #[serde(default)]
    pub region_tags: Vec<String>,
}

/// Canonical observation unit. Severity is clamped to `[0.0, 1.0]` at the
/// ingest boundary; any violation is an error, never silently normalised.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorldEvent {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub domain: Domain,
    pub location: Option<Location>,
    pub severity_score: f64,
    pub payload: Value,
}

/// Aggregated per-domain state. `last_updated` tracks the most recent event
/// timestamp that contributed to the aggregate, so replay is deterministic.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorldState {
    pub domain: Domain,
    pub event_count: u64,
    pub avg_severity: f64,
    pub risk_index: f64,
    pub last_updated: DateTime<Utc>,
}

/// Entity reference (e.g. a nation, sensor network, organisation). Metadata is
/// free-form JSON but must stay bounded in size.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EntityNode {
    pub id: Uuid,
    pub label: String,
    pub domain: Domain,
    #[serde(default)]
    pub metadata: Value,
}

/// Directed causal relationship between two events.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CausalEdge {
    pub source_event_id: Uuid,
    pub target_event_id: Uuid,
    pub influence_score: f64,
    pub decay_rate: f64,
}

/// An inference engine's explanation that an event is noteworthy.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Signal {
    pub event_id: Uuid,
    pub domain: Domain,
    pub score: f64,
    pub reason: String,
}

/// Forward-looking projection for a domain's risk index.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Prediction {
    pub domain: Domain,
    pub horizon_seconds: u64,
    pub projected_risk_index: f64,
}

/// Structured filter over `WorldGraph` events.
#[derive(Debug, Clone, Default)]
pub struct QueryFilters {
    pub domain: Option<Domain>,
    pub min_severity: Option<f64>,
    pub region_tag: Option<String>,
    pub since: Option<DateTime<Utc>>,
}
