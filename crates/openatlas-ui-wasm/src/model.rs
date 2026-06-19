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

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // StreamEnvelope
    // -----------------------------------------------------------------------

    #[test]
    fn deserialize_stream_envelope_full() {
        let json = serde_json::json!({
            "event": {
                "id": "evt-001",
                "timestamp": "2024-06-01T12:00:00Z",
                "domain": "energy",
                "severity_score": 0.75,
                "location": { "lat": 40.71, "lon": -74.01 }
            },
            "signals": [{
                "event_id": "evt-001",
                "domain": "energy",
                "score": 0.85,
                "reason": "spike detected"
            }],
            "world_state": {
                "domain": "energy",
                "event_count": 42,
                "avg_severity": 0.5,
                "risk_index": 0.3
            },
            "causal_edges": [{
                "source_event_id": "evt-001",
                "target_event_id": "evt-002",
                "influence_score": 0.9,
                "decay_rate": 0.1
            }],
            "domain_insight": {
                "domain": "energy",
                "trend": "up",
                "anomaly_count_recent": 5,
                "dominant_source": "sensor-a",
                "source_link": "http://example.com",
                "narrative": "Energy grid under stress",
                "updated_at": "2024-06-01T12:00:00Z"
            }
        });
        let envelope: StreamEnvelope = serde_json::from_value(json).unwrap();
        assert!(envelope.event.is_some());
        assert_eq!(envelope.signals.len(), 1);
        assert!(envelope.world_state.is_some());
        assert_eq!(envelope.causal_edges.len(), 1);
        assert!(envelope.domain_insight.is_some());
    }

    #[test]
    fn deserialize_stream_envelope_empty() {
        let json = serde_json::json!({});
        let envelope: StreamEnvelope = serde_json::from_value(json).unwrap();
        assert!(envelope.event.is_none());
        assert!(envelope.signals.is_empty());
        assert!(envelope.world_state.is_none());
        assert!(envelope.causal_edges.is_empty());
        assert!(envelope.domain_insight.is_none());
    }

    #[test]
    fn deserialize_stream_envelope_event_only() {
        let json = serde_json::json!({
            "event": {
                "id": "evt-100",
                "timestamp": "2024-06-01T12:00:00Z",
                "domain": "climate",
                "severity_score": 0.3
            }
        });
        let envelope: StreamEnvelope = serde_json::from_value(json).unwrap();
        let event = envelope.event.unwrap();
        assert_eq!(event.id, "evt-100");
        assert_eq!(event.domain, "climate");
        assert!((event.severity_score - 0.3).abs() < 1e-9);
        assert!(event.location.is_none());
    }

    // -----------------------------------------------------------------------
    // UiEvent
    // -----------------------------------------------------------------------

    #[test]
    fn deserialize_ui_event_with_location() {
        let json = serde_json::json!({
            "id": "evt-042",
            "timestamp": "2024-06-15T08:30:00Z",
            "domain": "seismic",
            "severity_score": 0.92,
            "location": { "lat": 35.68, "lon": 139.76 }
        });
        let event: UiEvent = serde_json::from_value(json).unwrap();
        assert_eq!(event.id, "evt-042");
        assert_eq!(event.domain, "seismic");
        let loc = event.location.unwrap();
        assert!((loc.lat - 35.68).abs() < 1e-9);
        assert!((loc.lon - 139.76).abs() < 1e-9);
    }

    #[test]
    fn deserialize_ui_event_without_location() {
        let json = serde_json::json!({
            "id": "evt-999",
            "timestamp": "2024-06-15T08:30:00Z",
            "domain": "health",
            "severity_score": 0.1
        });
        let event: UiEvent = serde_json::from_value(json).unwrap();
        assert!(event.location.is_none());
    }

    #[test]
    fn deserialize_ui_event_zero_severity() {
        let json = serde_json::json!({
            "id": "evt-000",
            "timestamp": "2024-01-01T00:00:00Z",
            "domain": "space",
            "severity_score": 0.0
        });
        let event: UiEvent = serde_json::from_value(json).unwrap();
        assert!((event.severity_score - 0.0).abs() < 1e-9);
    }

    // -----------------------------------------------------------------------
    // UiSignal
    // -----------------------------------------------------------------------

    #[test]
    fn deserialize_ui_signal() {
        let json = serde_json::json!({
            "event_id": "evt-007",
            "domain": "cyber",
            "score": 0.99,
            "reason": "unusual network activity"
        });
        let signal: UiSignal = serde_json::from_value(json).unwrap();
        assert_eq!(signal.event_id, "evt-007");
        assert_eq!(signal.domain, "cyber");
        assert!((signal.score - 0.99).abs() < 1e-9);
        assert_eq!(signal.reason, "unusual network activity");
    }

    // -----------------------------------------------------------------------
    // UiWorldState
    // -----------------------------------------------------------------------

    #[test]
    fn deserialize_ui_world_state() {
        let json = serde_json::json!({
            "domain": "finance",
            "event_count": 128,
            "avg_severity": 0.45,
            "risk_index": 0.62
        });
        let ws: UiWorldState = serde_json::from_value(json).unwrap();
        assert_eq!(ws.domain, "finance");
        assert_eq!(ws.event_count, 128);
        assert!((ws.avg_severity - 0.45).abs() < 1e-9);
        assert!((ws.risk_index - 0.62).abs() < 1e-9);
    }

    #[test]
    fn deserialize_ui_world_state_zero_count() {
        let json = serde_json::json!({
            "domain": "new-domain",
            "event_count": 0,
            "avg_severity": 0.0,
            "risk_index": 0.0
        });
        let ws: UiWorldState = serde_json::from_value(json).unwrap();
        assert_eq!(ws.event_count, 0);
    }

    // -----------------------------------------------------------------------
    // UiCausalEdge
    // -----------------------------------------------------------------------

    #[test]
    fn deserialize_ui_causal_edge() {
        let json = serde_json::json!({
            "source_event_id": "a1b2c3",
            "target_event_id": "d4e5f6",
            "influence_score": 0.75,
            "decay_rate": 0.05
        });
        let edge: UiCausalEdge = serde_json::from_value(json).unwrap();
        assert_eq!(edge.source_event_id, "a1b2c3");
        assert_eq!(edge.target_event_id, "d4e5f6");
        assert!((edge.influence_score - 0.75).abs() < 1e-9);
        assert!((edge.decay_rate - 0.05).abs() < 1e-9);
    }

    // -----------------------------------------------------------------------
    // UiLocation
    // -----------------------------------------------------------------------

    #[test]
    fn deserialize_ui_location() {
        let json = serde_json::json!({ "lat": -33.86, "lon": 151.21 });
        let loc: UiLocation = serde_json::from_value(json).unwrap();
        assert!((loc.lat - (-33.86)).abs() < 1e-9);
        assert!((loc.lon - 151.21).abs() < 1e-9);
    }

    // -----------------------------------------------------------------------
    // UiDomainInsight
    // -----------------------------------------------------------------------

    #[test]
    fn deserialize_ui_domain_insight_with_source_link() {
        let json = serde_json::json!({
            "domain": "geopolitics",
            "trend": "up",
            "anomaly_count_recent": 12,
            "dominant_source": "reuters",
            "source_link": "https://reuters.com/article/123",
            "narrative": "Escalating tensions in region",
            "updated_at": "2024-06-15T10:00:00Z"
        });
        let insight: UiDomainInsight = serde_json::from_value(json).unwrap();
        assert_eq!(insight.domain, "geopolitics");
        assert_eq!(insight.trend, "up");
        assert_eq!(insight.anomaly_count_recent, 12);
        assert_eq!(insight.dominant_source, Some("reuters".to_owned()));
        assert_eq!(
            insight.source_link,
            Some("https://reuters.com/article/123".to_owned())
        );
        assert_eq!(insight.narrative, "Escalating tensions in region");
    }

    #[test]
    fn deserialize_ui_domain_insight_without_optional_fields() {
        let json = serde_json::json!({
            "domain": "demographics",
            "trend": "flat",
            "anomaly_count_recent": 0,
            "narrative": "Stable population metrics",
            "updated_at": "2024-06-15T10:00:00Z"
        });
        let insight: UiDomainInsight = serde_json::from_value(json).unwrap();
        assert!(insight.dominant_source.is_none());
        assert!(insight.source_link.is_none());
        assert_eq!(insight.anomaly_count_recent, 0);
    }

    #[test]
    fn deserialize_ui_domain_insight_zero_anomalies() {
        let json = serde_json::json!({
            "domain": "transport",
            "trend": "down",
            "anomaly_count_recent": 0,
            "narrative": "All systems nominal",
            "updated_at": "2024-06-15T10:00:00Z"
        });
        let insight: UiDomainInsight = serde_json::from_value(json).unwrap();
        assert_eq!(insight.anomaly_count_recent, 0);
    }
}
