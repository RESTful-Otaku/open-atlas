use crate::{
    domain::Domain,
    event::{Prediction, Signal, WorldEvent, WorldState},
};

/// Anomaly detection and forecasting hook. Must be side-effect free.
pub trait InferenceEngine: Send + Sync {
    #[must_use]
    fn detect_anomaly(&self, events: &[WorldEvent]) -> Vec<Signal>;
    #[must_use]
    fn predict_state(&self, domain: Domain, current_state: Option<&WorldState>) -> Prediction;
}

/// Default engine. Flags events at or above `anomaly_threshold`.
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
                domain: event.domain,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Domain;
    use chrono::Utc;
    use serde_json::json;
    use uuid::Uuid;

    fn sample_event(severity_score: f64) -> WorldEvent {
        WorldEvent {
            id: Uuid::new_v4(),
            timestamp: Utc::now(),
            domain: Domain::Energy,
            location: None,
            severity_score,
            payload: json!({}),
        }
    }

    fn sample_state(risk_index: f64) -> WorldState {
        WorldState {
            domain: Domain::Energy,
            event_count: 5,
            avg_severity: risk_index,
            risk_index,
            last_updated: Utc::now(),
        }
    }

    #[test]
    fn default_threshold_is_0_85() {
        let engine = ThresholdInferenceEngine::default();
        assert!((engine.anomaly_threshold - 0.85).abs() < f64::EPSILON);
    }

    #[test]
    fn detect_anomaly_below_threshold_returns_empty() {
        let engine = ThresholdInferenceEngine::default();
        let events = vec![sample_event(0.5), sample_event(0.84)];
        let signals = engine.detect_anomaly(&events);
        assert!(signals.is_empty());
    }

    #[test]
    fn detect_anomaly_at_threshold_returns_signal() {
        let engine = ThresholdInferenceEngine::default();
        let events = vec![sample_event(0.85)];
        let signals = engine.detect_anomaly(&events);
        assert_eq!(signals.len(), 1);
    }

    #[test]
    fn detect_anomaly_above_threshold_returns_signal() {
        let engine = ThresholdInferenceEngine::default();
        let events = vec![sample_event(1.0)];
        let signals = engine.detect_anomaly(&events);
        assert_eq!(signals.len(), 1);
    }

    #[test]
    fn detect_anomaly_mixed_events_returns_correct_subset() {
        let engine = ThresholdInferenceEngine::default();
        let events = vec![
            sample_event(0.3),
            sample_event(0.86),
            sample_event(0.5),
            sample_event(0.99),
            sample_event(0.84),
        ];
        let signals = engine.detect_anomaly(&events);
        assert_eq!(signals.len(), 2);
        for signal in &signals {
            assert!(signal.score >= 0.85);
        }
    }

    #[test]
    fn detect_anomaly_empty_events_returns_empty() {
        let engine = ThresholdInferenceEngine::default();
        let signals = engine.detect_anomaly(&[]);
        assert!(signals.is_empty());
    }

    #[test]
    fn detect_anomaly_signal_has_correct_fields() {
        let engine = ThresholdInferenceEngine::default();
        let event = sample_event(0.92);
        let signals = engine.detect_anomaly(std::slice::from_ref(&event));
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].event_id, event.id);
        assert_eq!(signals[0].domain, event.domain);
        assert!((signals[0].score - 0.92).abs() < f64::EPSILON);
        assert_eq!(signals[0].reason, "threshold_based_anomaly");
    }

    #[test]
    fn predict_state_no_current_state_returns_baseline_zero() {
        let engine = ThresholdInferenceEngine::default();
        let prediction = engine.predict_state(Domain::Energy, None);
        assert_eq!(prediction.projected_risk_index, 0.0);
        assert_eq!(prediction.horizon_seconds, 900);
    }

    #[test]
    fn predict_state_with_current_state_returns_lift() {
        let engine = ThresholdInferenceEngine::default();
        let state = sample_state(0.5);
        let prediction = engine.predict_state(Domain::Energy, Some(&state));
        assert!((prediction.projected_risk_index - 0.525).abs() < f64::EPSILON);
    }

    #[test]
    fn predict_state_high_risk_index_caps_at_one() {
        let engine = ThresholdInferenceEngine::default();
        let state = sample_state(1.0);
        let prediction = engine.predict_state(Domain::Energy, Some(&state));
        assert!((prediction.projected_risk_index - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn custom_threshold_works() {
        let engine = ThresholdInferenceEngine {
            anomaly_threshold: 0.5,
        };
        let events = vec![sample_event(0.4), sample_event(0.5), sample_event(0.6)];
        let signals = engine.detect_anomaly(&events);
        assert_eq!(signals.len(), 2);
        assert!((signals[0].score - 0.5).abs() < f64::EPSILON);
        assert!((signals[1].score - 0.6).abs() < f64::EPSILON);
    }

    #[test]
    fn inference_engine_is_object_safe() {
        let engine: Box<dyn InferenceEngine> = Box::new(ThresholdInferenceEngine::default());
        let events = vec![sample_event(0.9)];
        let signals = engine.detect_anomaly(&events);
        assert_eq!(signals.len(), 1);
        let prediction = engine.predict_state(Domain::Energy, None);
        assert!((prediction.projected_risk_index - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn deterministic_sequence() {
        let engine = ThresholdInferenceEngine::default();
        let events = vec![sample_event(0.1), sample_event(0.86), sample_event(0.5)];
        let first = engine.detect_anomaly(&events);
        let second = engine.detect_anomaly(&events);
        assert_eq!(first, second);
    }

    #[test]
    fn random_vectors_never_panic() {
        use std::collections::HashSet;
        let engine = ThresholdInferenceEngine::default();
        let mut rng = 42u64;
        for len in 0..20 {
            let mut events = Vec::with_capacity(len);
            for _ in 0..len {
                rng = rng
                    .wrapping_mul(6364136223846793005)
                    .wrapping_add(1442695040888963407);
                let severity = (rng % 1000) as f64 / 1000.0;
                events.push(sample_event(severity));
            }
            let signals = engine.detect_anomaly(&events);
            let ids: HashSet<Uuid> = events.iter().map(|e| e.id).collect();
            for s in &signals {
                assert!(ids.contains(&s.event_id));
            }
        }
    }

    #[test]
    fn engine_is_send_sync() {
        fn check_send<T: Send>(_t: T) {}
        fn check_sync<T: Sync>(_t: T) {}
        let engine = ThresholdInferenceEngine::default();
        check_send(engine.clone());
        check_sync(engine);
    }

    #[test]
    fn engine_shared_across_threads() {
        let engine = ThresholdInferenceEngine::default();
        let event = sample_event(0.95);
        let events = vec![event.clone()];

        let signals =
            std::thread::scope(|s| s.spawn(|| engine.detect_anomaly(&events)).join().unwrap());

        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].event_id, event.id);
    }
}
