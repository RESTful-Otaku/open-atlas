//! DTOs decoded from the ingest stream. Shapes must stay in sync with
//! `openatlas_ingest::state::StreamEnvelope` and its components. All types
//! are `Deserialize`-only; the UI never re-emits these on the wire.

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct StreamEnvelope {
    pub(crate) event: Option<UiEvent>,
    #[serde(default)]
    pub(crate) signals: Vec<UiSignal>,
    pub(crate) world_state: Option<UiWorldState>,
    #[serde(default)]
    pub(crate) causal_edges: Vec<UiCausalEdge>,
    pub(crate) domain_insight: Option<UiDomainInsight>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct UiEvent {
    pub(crate) id: String,
    pub(crate) timestamp: String,
    pub(crate) domain: String,
    pub(crate) severity_score: f64,
    pub(crate) location: Option<UiLocation>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct UiSignal {
    pub(crate) event_id: String,
    pub(crate) domain: String,
    pub(crate) score: f64,
    pub(crate) reason: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct UiWorldState {
    pub(crate) domain: String,
    pub(crate) event_count: u64,
    pub(crate) avg_severity: f64,
    pub(crate) risk_index: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct UiLocation {
    pub(crate) lat: f64,
    pub(crate) lon: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct UiCausalEdge {
    pub(crate) source_event_id: String,
    pub(crate) target_event_id: String,
    pub(crate) influence_score: f64,
    pub(crate) decay_rate: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct UiDomainInsight {
    pub(crate) domain: String,
    pub(crate) trend: String,
    pub(crate) anomaly_count_recent: usize,
    pub(crate) dominant_source: Option<String>,
    pub(crate) source_link: Option<String>,
    pub(crate) narrative: String,
    pub(crate) updated_at: String,
}
