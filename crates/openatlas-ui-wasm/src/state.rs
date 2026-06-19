//! Mutable UI state, bounded by fixed upper limits so long-lived sessions
//! have predictable memory behaviour. All updates are deterministic and
//! free of wall-clock reads — the incoming `timestamp` field is used for
//! display only.

use std::collections::HashMap;

use crate::model::{
    StreamEnvelope, UiCausalEdge, UiDomainInsight, UiEvent, UiSignal, UiWorldState,
};

pub(crate) const MAX_EVENTS: usize = 520;
pub(crate) const MAX_SIGNALS: usize = 120;
pub(crate) const MAX_CAUSAL_EDGES: usize = 240;
pub(crate) const MAX_SEVERITY_HISTORY: usize = 24;

#[derive(Default)]
pub(crate) struct UiState {
    pub(crate) events: Vec<UiEvent>,
    pub(crate) recent_signals: Vec<UiSignal>,
    pub(crate) domain_state: HashMap<String, UiWorldState>,
    pub(crate) domain_severity_history: HashMap<String, Vec<f64>>,
    pub(crate) recent_causal_edges: Vec<UiCausalEdge>,
    pub(crate) domain_insights: HashMap<String, UiDomainInsight>,
    pub(crate) selected_domain: Option<String>,
}

impl UiState {
    pub(crate) fn matches_domain(&self, candidate: &str) -> bool {
        self.selected_domain
            .as_ref()
            .map(|domain| domain == candidate)
            .unwrap_or(true)
    }
}

pub(crate) fn apply_envelope(state: &mut UiState, envelope: StreamEnvelope) {
    let StreamEnvelope {
        event,
        signals,
        world_state,
        causal_edges,
        domain_insight,
    } = envelope;

    if let Some(new_event) = event {
        record_event(state, new_event);
    }

    if !signals.is_empty() {
        state.recent_signals.extend(signals);
        trim_tail(&mut state.recent_signals, MAX_SIGNALS);
    }

    if let Some(new_state) = world_state {
        state.domain_state.insert(new_state.domain.clone(), new_state);
    }

    if !causal_edges.is_empty() {
        state.recent_causal_edges.extend(causal_edges);
        trim_tail(&mut state.recent_causal_edges, MAX_CAUSAL_EDGES);
    }

    if let Some(insight) = domain_insight {
        state
            .domain_insights
            .insert(insight.domain.clone(), insight);
    }
}

fn record_event(state: &mut UiState, event: UiEvent) {
    let domain = event.domain.clone();
    let severity = event.severity_score;
    state.events.push(event);
    trim_tail(&mut state.events, MAX_EVENTS);

    let history = state.domain_severity_history.entry(domain).or_default();
    history.push(severity);
    trim_tail(history, MAX_SEVERITY_HISTORY);
}

fn trim_tail<T>(buffer: &mut Vec<T>, max: usize) {
    if buffer.len() > max {
        let extra = buffer.len() - max;
        buffer.drain(0..extra);
    }
}

/// Classify the trailing severity trend. Deterministic and independent of
/// wall-clock time — given the same input slice, always returns the same
/// label.
pub(crate) fn compute_trend(series: &[f64]) -> &'static str {
    if series.len() < 3 {
        return "insufficient-data";
    }
    let tail = series[series.len() - 1];
    let head = series[series.len() - 3];
    let delta = tail - head;
    if delta > 0.05 {
        "up"
    } else if delta < -0.05 {
        "down"
    } else {
        "flat"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // trim_tail
    // -----------------------------------------------------------------------

    #[test]
    fn trim_tail_empty_vec() {
        let mut v: Vec<i32> = vec![];
        trim_tail(&mut v, 10);
        assert!(v.is_empty());
    }

    #[test]
    fn trim_tail_under_max() {
        let mut v = vec![1, 2, 3];
        trim_tail(&mut v, 10);
        assert_eq!(v, vec![1, 2, 3]);
    }

    #[test]
    fn trim_tail_exactly_max() {
        let mut v = vec![1, 2, 3, 4, 5];
        trim_tail(&mut v, 5);
        assert_eq!(v, vec![1, 2, 3, 4, 5]);
    }

    #[test]
    fn trim_tail_over_max() {
        let mut v = vec![1, 2, 3, 4, 5, 6, 7, 8];
        trim_tail(&mut v, 5);
        assert_eq!(v, vec![4, 5, 6, 7, 8]);
    }

    #[test]
    fn trim_tail_over_max_single_extra() {
        let mut v = vec![1, 2, 3, 4, 5, 6];
        trim_tail(&mut v, 5);
        assert_eq!(v, vec![2, 3, 4, 5, 6]);
    }

    #[test]
    fn trim_tail_zero_max() {
        let mut v = vec![1, 2, 3];
        trim_tail(&mut v, 0);
        assert!(v.is_empty());
    }

    #[test]
    fn trim_tail_strings() {
        let mut v = vec!["a", "b", "c", "d", "e", "f"];
        trim_tail(&mut v, 3);
        assert_eq!(v, vec!["d", "e", "f"]);
    }

    // -----------------------------------------------------------------------
    // compute_trend
    // -----------------------------------------------------------------------

    #[test]
    fn compute_trend_insufficient_data_empty() {
        assert_eq!(compute_trend(&[]), "insufficient-data");
    }

    #[test]
    fn compute_trend_insufficient_data_one() {
        assert_eq!(compute_trend(&[0.5]), "insufficient-data");
    }

    #[test]
    fn compute_trend_insufficient_data_two() {
        assert_eq!(compute_trend(&[0.3, 0.7]), "insufficient-data");
    }

    #[test]
    fn compute_trend_up() {
        assert_eq!(compute_trend(&[0.1, 0.2, 0.5]), "up");
    }

    #[test]
    fn compute_trend_down() {
        assert_eq!(compute_trend(&[0.9, 0.5, 0.1]), "down");
    }

    #[test]
    fn compute_trend_flat() {
        assert_eq!(compute_trend(&[0.5, 0.5, 0.5]), "flat");
    }

    #[test]
    fn compute_trend_boundary_up() {
        assert_eq!(compute_trend(&[0.0, 0.0, 0.051]), "up");
    }

    #[test]
    fn compute_trend_boundary_down() {
        assert_eq!(compute_trend(&[0.1, 0.1, 0.049]), "down");
    }

    #[test]
    fn compute_trend_boundary_flat_just_under() {
        assert_eq!(compute_trend(&[0.0, 0.0, 0.049]), "flat");
        assert_eq!(compute_trend(&[0.1, 0.1, 0.051]), "flat");
    }

    #[test]
    fn compute_trend_exact_threshold_not_flat() {
        assert_eq!(compute_trend(&[0.0, 0.0, 0.05]), "flat");
    }

    #[test]
    fn compute_trend_middle_indexes() {
        assert_eq!(compute_trend(&[1.0, 0.5, 0.2, 0.1, 0.05]), "down");
        assert_eq!(compute_trend(&[0.0, 0.1, 0.2, 0.3, 0.4]), "up");
    }

    #[test]
    fn compute_trend_negative_values() {
        assert_eq!(
            compute_trend(&[-0.5, -0.3, 0.0]),
            "up",
            "-0.5 -> 0.0 is +0.5 > 0.05"
        );
    }

    #[test]
    fn compute_trend_large_positive_delta() {
        assert_eq!(compute_trend(&[0.0, 0.0, 1.0]), "up");
    }

    // -----------------------------------------------------------------------
    // UiState::matches_domain
    // -----------------------------------------------------------------------

    #[test]
    fn matches_domain_none_selected() {
        let state = UiState::default();
        assert!(state.matches_domain("energy"));
        assert!(state.matches_domain("anything"));
    }

    #[test]
    fn matches_domain_matching_selection() {
        let state = UiState { selected_domain: Some("climate".to_owned()), ..Default::default() };
        assert!(state.matches_domain("climate"));
    }

    #[test]
    fn matches_domain_non_matching() {
        let state = UiState { selected_domain: Some("climate".to_owned()), ..Default::default() };
        assert!(!state.matches_domain("energy"));
        assert!(!state.matches_domain("finance"));
    }

    // -----------------------------------------------------------------------
    // apply_envelope
    // -----------------------------------------------------------------------

    #[test]
    fn apply_envelope_adds_event() {
        let mut state = UiState::default();
        let envelope = StreamEnvelope {
            event: Some(UiEvent {
                id: "evt-1".to_owned(),
                timestamp: "2024-01-01T00:00:00Z".to_owned(),
                domain: "energy".to_owned(),
                severity_score: 0.5,
                location: None,
            }),
            signals: vec![],
            world_state: None,
            causal_edges: vec![],
            domain_insight: None,
        };
        apply_envelope(&mut state, envelope);
        assert_eq!(state.events.len(), 1);
        assert_eq!(state.events[0].id, "evt-1");
        assert_eq!(
            state.domain_severity_history.get("energy").unwrap(),
            &vec![0.5]
        );
    }

    #[test]
    fn apply_envelope_adds_signals() {
        let mut state = UiState::default();
        let envelope = StreamEnvelope {
            event: None,
            signals: vec![UiSignal {
                event_id: "evt-1".to_owned(),
                domain: "cyber".to_owned(),
                score: 0.9,
                reason: "intrusion".to_owned(),
            }],
            world_state: None,
            causal_edges: vec![],
            domain_insight: None,
        };
        apply_envelope(&mut state, envelope);
        assert_eq!(state.recent_signals.len(), 1);
    }

    #[test]
    fn apply_envelope_adds_world_state() {
        let mut state = UiState::default();
        let envelope = StreamEnvelope {
            event: None,
            signals: vec![],
            world_state: Some(UiWorldState {
                domain: "finance".to_owned(),
                event_count: 100,
                avg_severity: 0.4,
                risk_index: 0.6,
            }),
            causal_edges: vec![],
            domain_insight: None,
        };
        apply_envelope(&mut state, envelope);
        assert_eq!(state.domain_state.len(), 1);
        assert_eq!(state.domain_state["finance"].event_count, 100);
    }

    #[test]
    fn apply_envelope_updates_existing_world_state() {
        let mut state = UiState::default();
        state
            .domain_state
            .insert("energy".to_owned(), UiWorldState {
                domain: "energy".to_owned(),
                event_count: 10,
                avg_severity: 0.2,
                risk_index: 0.1,
            });
        let envelope = StreamEnvelope {
            event: None,
            signals: vec![],
            world_state: Some(UiWorldState {
                domain: "energy".to_owned(),
                event_count: 50,
                avg_severity: 0.5,
                risk_index: 0.3,
            }),
            causal_edges: vec![],
            domain_insight: None,
        };
        apply_envelope(&mut state, envelope);
        assert_eq!(state.domain_state["energy"].event_count, 50);
    }

    #[test]
    fn apply_envelope_adds_causal_edges() {
        let mut state = UiState::default();
        let envelope = StreamEnvelope {
            event: None,
            signals: vec![],
            world_state: None,
            causal_edges: vec![UiCausalEdge {
                source_event_id: "a".to_owned(),
                target_event_id: "b".to_owned(),
                influence_score: 0.8,
                decay_rate: 0.1,
            }],
            domain_insight: None,
        };
        apply_envelope(&mut state, envelope);
        assert_eq!(state.recent_causal_edges.len(), 1);
    }

    #[test]
    fn apply_envelope_adds_domain_insight() {
        let mut state = UiState::default();
        let envelope = StreamEnvelope {
            event: None,
            signals: vec![],
            world_state: None,
            causal_edges: vec![],
            domain_insight: Some(UiDomainInsight {
                domain: "climate".to_owned(),
                trend: "up".to_owned(),
                anomaly_count_recent: 3,
                dominant_source: None,
                source_link: None,
                narrative: "warming".to_owned(),
                updated_at: "2024-01-01T00:00:00Z".to_owned(),
            }),
        };
        apply_envelope(&mut state, envelope);
        assert_eq!(state.domain_insights.len(), 1);
    }

    #[test]
    fn apply_envelope_trim_events_over_max() {
        let mut state = UiState::default();
        for i in 0..MAX_EVENTS + 10 {
            let e = UiEvent {
                id: format!("evt-{i}"),
                timestamp: "2024-01-01T00:00:00Z".to_owned(),
                domain: "energy".to_owned(),
                severity_score: 0.5,
                location: None,
            };
            apply_envelope(&mut state, StreamEnvelope {
                event: Some(e),
                signals: vec![],
                world_state: None,
                causal_edges: vec![],
                domain_insight: None,
            });
        }
        assert_eq!(state.events.len(), MAX_EVENTS);
    }

    // -----------------------------------------------------------------------
    // record_event (tested indirectly via apply_envelope)
    // -----------------------------------------------------------------------

    #[test]
    fn record_event_maintains_severity_history() {
        let mut state = UiState::default();
        for i in 0..MAX_SEVERITY_HISTORY + 5 {
            let e = UiEvent {
                id: format!("evt-{i}"),
                timestamp: "2024-01-01T00:00:00Z".to_owned(),
                domain: "energy".to_owned(),
                severity_score: i as f64 * 0.1,
                location: None,
            };
            apply_envelope(&mut state, StreamEnvelope {
                event: Some(e),
                signals: vec![],
                world_state: None,
                causal_edges: vec![],
                domain_insight: None,
            });
        }
        let history = state.domain_severity_history.get("energy").unwrap();
        assert_eq!(history.len(), MAX_SEVERITY_HISTORY);
    }

    #[test]
    fn apply_envelope_empty_is_noop() {
        let mut state = UiState { selected_domain: Some("test".to_owned()), ..Default::default() };
        let original_domain = state.selected_domain.clone();
        apply_envelope(&mut state, StreamEnvelope {
            event: None,
            signals: vec![],
            world_state: None,
            causal_edges: vec![],
            domain_insight: None,
        });
        assert_eq!(state.selected_domain, original_domain);
        assert!(state.events.is_empty());
        assert!(state.recent_signals.is_empty());
        assert!(state.domain_state.is_empty());
    }
}
