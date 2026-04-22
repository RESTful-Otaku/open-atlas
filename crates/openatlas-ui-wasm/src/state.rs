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
