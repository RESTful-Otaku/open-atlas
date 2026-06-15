//! The authoritative in-process world graph.
//!
//! # Invariants
//! * Every stored `WorldEvent` has `severity_score ∈ [0.0, 1.0]`.
//! * Event ids are unique; duplicate ingest is an error, never a silent merge.
//! * `world_state.last_updated` is monotonic per domain: it only ever
//!   advances, even when events arrive out of order.
//! * `recent_by_domain` is a bounded ring (`recent_window_size`) — no
//!   unbounded growth.
//!
//! # SpacetimeDB migration boundary
//!
//! This struct is a drop-in authoritative store with the same shape as the
//! future SpacetimeDB module:
//! * `events`, `world_state`, `entity_nodes`, `causal_edges`, `signals` each
//!   become a `#[spacetimedb::table]`.
//! * `ingest_event`, `update_world_state`, `link_causal_events`,
//!   `query_state` each become a `#[spacetimedb::reducer]` or a client-side
//!   subscription query. Time comes from `ReducerContext::timestamp`, which
//!   is already deterministic.
//! * `InferenceEngine` stays in-process and is invoked from within the
//!   `ingest_event` reducer.

use std::collections::{HashMap, VecDeque};

use uuid::Uuid;

use crate::{
    domain::Domain,
    error::CoreError,
    event::{CausalEdge, EntityNode, QueryFilters, Signal, WorldEvent, WorldState},
    inference::{InferenceEngine, ThresholdInferenceEngine},
};

#[derive(Debug, Clone, Default)]
struct DomainAggregate {
    event_count: u64,
    total_severity: f64,
}

pub struct WorldGraph {
    pub events: HashMap<Uuid, WorldEvent>,
    pub world_state: HashMap<Domain, WorldState>,
    pub entity_nodes: HashMap<Uuid, EntityNode>,
    pub causal_edges: Vec<CausalEdge>,
    pub signals: Vec<Signal>,
    domain_aggregates: HashMap<Domain, DomainAggregate>,
    recent_by_domain: HashMap<Domain, VecDeque<Uuid>>,
    recent_window_size: usize,
    signal_ring_size: usize,
    causal_edge_ring_size: usize,
    inference: Box<dyn InferenceEngine>,
}

impl Default for WorldGraph {
    fn default() -> Self {
        Self::new(Box::<ThresholdInferenceEngine>::default(), 256, 400, 600)
    }
}

impl WorldGraph {
    /// Construct a graph with an explicit inference backend and recent-event
    /// window size. The window is a hard bound; anomaly detection only ever
    /// inspects the last `recent_window_size` events per domain.
    /// `signal_ring_size` and `causal_edge_ring_size` cap derivative data growth.
    pub fn new(
        inference: Box<dyn InferenceEngine>,
        recent_window_size: usize,
        signal_ring_size: usize,
        causal_edge_ring_size: usize,
    ) -> Self {
        assert!(recent_window_size > 0, "recent_window_size must be > 0");
        Self {
            events: HashMap::new(),
            world_state: HashMap::new(),
            entity_nodes: HashMap::new(),
            causal_edges: Vec::new(),
            signals: Vec::new(),
            domain_aggregates: HashMap::new(),
            recent_by_domain: HashMap::new(),
            recent_window_size,
            signal_ring_size,
            causal_edge_ring_size,
            inference,
        }
    }

    /// Deterministic ingest reducer.
    ///
    /// Returns the signals raised for this event. Rejects invalid severity
    /// and duplicate ids — this is the ONLY entry point that accepts writes,
    /// mirroring the SpacetimeDB reducer-only model.
    pub fn ingest_event(&mut self, event: WorldEvent) -> Result<Vec<Signal>, CoreError> {
        if !(0.0..=1.0).contains(&event.severity_score) {
            return Err(CoreError::InvalidSeverity);
        }
        if self.events.contains_key(&event.id) {
            return Err(CoreError::DuplicateEventId(event.id));
        }

        let domain = event.domain.clone();
        let event_id = event.id;
        let event_ts = event.timestamp;
        let location = event.location.clone();
        self.update_domain_aggregate(&domain, event.severity_score);
        self.events.insert(event_id, event);
        self.track_recent_event(domain.clone(), event_id);
        self.update_world_state(domain.clone(), event_ts);

        let recent_events = self.recent_events_for_domain(&domain);
        let new_signals = self.inference.detect_anomaly(&recent_events);
        self.signals.extend(new_signals.clone());
        self.prune_signals();
        self.prune_causal_edges();
        if let Some(ref loc) = location {
            self.entity_nodes.insert(
                event_id,
                EntityNode {
                    id: event_id,
                    label: format!("{:?}:{}:{}", domain, loc.lat, loc.lon),
                    domain: domain.clone(),
                    metadata: serde_json::json!({}),
                },
            );
        }
        Ok(new_signals)
    }

    /// Recompute the aggregate state for `domain` using the running totals.
    ///
    /// `event_timestamp` is the timestamp of the event that triggered this
    /// update; `last_updated` advances monotonically using that value.
    pub fn update_world_state(
        &mut self,
        domain: Domain,
        event_timestamp: chrono::DateTime<chrono::Utc>,
    ) {
        let Some(aggregate) = self.domain_aggregates.get(&domain) else {
            return;
        };
        if aggregate.event_count == 0 {
            return;
        }

        let avg_severity = aggregate.total_severity / aggregate.event_count as f64;
        let risk_index = avg_severity.clamp(0.0, 1.0);
        let last_updated = self
            .world_state
            .get(&domain)
            .map(|state| state.last_updated.max(event_timestamp))
            .unwrap_or(event_timestamp);

        self.world_state.insert(
            domain.clone(),
            WorldState {
                domain,
                event_count: aggregate.event_count,
                avg_severity,
                risk_index,
                last_updated,
            },
        );
    }

    /// Record a directed causal edge. Both endpoints must already exist.
    pub fn link_causal_events(
        &mut self,
        source_event_id: Uuid,
        target_event_id: Uuid,
        influence_score: f64,
        decay_rate: f64,
    ) -> Result<(), CoreError> {
        if !self.events.contains_key(&source_event_id) {
            return Err(CoreError::EventNotFound(source_event_id));
        }
        if !self.events.contains_key(&target_event_id) {
            return Err(CoreError::EventNotFound(target_event_id));
        }

        self.causal_edges.push(CausalEdge {
            source_event_id,
            target_event_id,
            influence_score: influence_score.clamp(0.0, 1.0),
            decay_rate: decay_rate.clamp(0.0, 1.0),
        });
        Ok(())
    }

    /// Read-only query over all stored events. Returns an owned snapshot so
    /// callers cannot accidentally mutate the graph.
    pub fn query_state(&self, filters: &QueryFilters) -> Vec<WorldEvent> {
        self.events
            .values()
            .filter(|event| match_filters(event, filters))
            .cloned()
            .collect()
    }

    fn prune_signals(&mut self) {
        let excess = self.signals.len().saturating_sub(self.signal_ring_size);
        if excess > 0 {
            self.signals.drain(..excess);
        }
    }

    fn prune_causal_edges(&mut self) {
        let excess = self.causal_edges.len().saturating_sub(self.causal_edge_ring_size);
        if excess > 0 {
            self.causal_edges.drain(..excess);
        }
    }

    fn track_recent_event(&mut self, domain: Domain, event_id: Uuid) {
        let window = self.recent_window_size;
        let queue = self.recent_by_domain.entry(domain).or_default();
        queue.push_back(event_id);
        while queue.len() > window {
            let _ = queue.pop_front();
        }
        debug_assert!(
            queue.len() <= window,
            "recent-event ring exceeded bound: {} > {}",
            queue.len(),
            window
        );
    }

    fn recent_events_for_domain(&self, domain: &Domain) -> Vec<WorldEvent> {
        self.recent_by_domain
            .get(domain)
            .map(|queue| {
                queue
                    .iter()
                    .filter_map(|id| self.events.get(id))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }

    fn update_domain_aggregate(&mut self, domain: &Domain, severity_score: f64) {
        debug_assert!(
            (0.0..=1.0).contains(&severity_score),
            "severity_score out of range: {severity_score}"
        );
        let aggregate = self.domain_aggregates.entry(domain.clone()).or_default();
        aggregate.event_count = aggregate.event_count.saturating_add(1);
        aggregate.total_severity += severity_score;
        debug_assert!(aggregate.total_severity.is_finite());
    }
}

fn match_filters(event: &WorldEvent, filters: &QueryFilters) -> bool {
    if let Some(domain) = &filters.domain {
        if &event.domain != domain {
            return false;
        }
    }
    if let Some(min_severity) = filters.min_severity {
        if event.severity_score < min_severity {
            return false;
        }
    }
    if let Some(tag) = &filters.region_tag {
        let ok = event
            .location
            .as_ref()
            .map(|loc| loc.region_tags.contains(tag))
            .unwrap_or(false);
        if !ok {
            return false;
        }
    }
    if let Some(since) = filters.since {
        if event.timestamp < since {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use serde_json::json;

    use crate::event::Location;

    fn sample_event(domain: Domain, severity_score: f64) -> WorldEvent {
        WorldEvent {
            id: Uuid::new_v4(),
            timestamp: Utc::now(),
            domain,
            location: Some(Location {
                lat: 35.0,
                lon: 139.0,
                region_tags: vec!["asia".to_owned()],
            }),
            severity_score,
            payload: json!({ "source": "simulator" }),
        }
    }

    #[test]
    fn ingest_updates_world_state() {
        let mut graph = WorldGraph::default();
        let inserted = graph.ingest_event(sample_event(Domain::Energy, 0.6));
        assert!(inserted.is_ok());

        let state = graph
            .world_state
            .get(&Domain::Energy)
            .expect("energy state should exist");
        assert_eq!(state.event_count, 1);
        assert!(state.avg_severity > 0.0);
    }

    #[test]
    fn query_filters_by_domain_and_region() {
        let mut graph = WorldGraph::default();
        let _ = graph.ingest_event(sample_event(Domain::Energy, 0.3));
        let _ = graph.ingest_event(sample_event(Domain::Finance, 0.9));

        let filters = QueryFilters {
            domain: Some(Domain::Energy),
            region_tag: Some("asia".to_owned()),
            ..Default::default()
        };
        let result = graph.query_state(&filters);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].domain, Domain::Energy);
    }

    #[test]
    fn ingest_rejects_duplicate_event_id() {
        let mut graph = WorldGraph::default();
        let event = sample_event(Domain::Energy, 0.4);
        let duplicate = event.clone();

        let first = graph.ingest_event(event);
        assert!(first.is_ok());

        let second = graph.ingest_event(duplicate);
        assert!(matches!(second, Err(CoreError::DuplicateEventId(_))));
    }

    #[test]
    fn last_updated_is_monotonic_even_on_reorder() {
        let mut graph = WorldGraph::default();
        let newer = WorldEvent {
            timestamp: Utc::now(),
            ..sample_event(Domain::Seismic, 0.5)
        };
        let older = WorldEvent {
            timestamp: newer.timestamp - chrono::Duration::minutes(5),
            ..sample_event(Domain::Seismic, 0.4)
        };
        graph.ingest_event(newer.clone()).unwrap();
        graph.ingest_event(older).unwrap();

        let state = graph.world_state.get(&Domain::Seismic).unwrap();
        assert_eq!(state.last_updated, newer.timestamp);
    }
}
