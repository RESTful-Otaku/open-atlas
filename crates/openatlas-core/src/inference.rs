//! Inference boundary. The `InferenceEngine` trait keeps the core independent
//! from any specific anomaly or prediction algorithm; the default
//! `ThresholdInferenceEngine` is intentionally trivial so that production
//! engines can be swapped in without touching the graph.

use crate::{
    domain::Domain,
    event::{Prediction, Signal, WorldEvent, WorldState},
};

/// Anomaly detection and forecasting hook. Implementations must be
/// side-effect free; deterministic outputs make replay verifiable.
pub trait InferenceEngine: Send + Sync {
    fn detect_anomaly(&self, events: &[WorldEvent]) -> Vec<Signal>;
    fn predict_state(&self, domain: Domain, current_state: Option<&WorldState>) -> Prediction;
}

/// Minimal engine used by default and in tests. Flags any event whose severity
/// meets or exceeds `anomaly_threshold` and projects a modest linear lift.
#[derive(Debug, Clone)]
pub struct ThresholdInferenceEngine {
    pub anomaly_threshold: f64,
}

impl Default for ThresholdInferenceEngine {
    fn default() -> Self {
        Self {
            anomaly_threshold: 0.85,
        }
    }
}

impl InferenceEngine for ThresholdInferenceEngine {
    fn detect_anomaly(&self, events: &[WorldEvent]) -> Vec<Signal> {
        events
            .iter()
            .filter(|event| event.severity_score >= self.anomaly_threshold)
            .map(|event| Signal {
                event_id: event.id,
                domain: event.domain.clone(),
                score: event.severity_score,
                reason: "threshold_based_anomaly".to_owned(),
            })
            .collect()
    }

    fn predict_state(&self, domain: Domain, current_state: Option<&WorldState>) -> Prediction {
        let baseline = current_state.map(|s| s.risk_index).unwrap_or(0.0);
        Prediction {
            domain,
            horizon_seconds: 900,
            projected_risk_index: (baseline * 1.05).min(1.0),
        }
    }
}
