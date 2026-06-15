//! Canonical ingest push path: validate → batch reducer → metrics.
//!
//! Matches common event-pipeline design: stateless edge, idempotent sink,
//! at-least-once delivery with duplicate detection at SpacetimeDB.

use openatlas_core::WorldEvent;
use tracing::{debug, warn};

use crate::{
    metrics::IngestMetrics,
    state::AppState,
    stdb::{IngestOutcome, StdbClient},
};

/// Events per `ingest_events_batch` HTTP call (≤ module `MAX_INGEST_BATCH_SIZE`).
pub const STDB_BATCH_CHUNK: usize = 64;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct BatchPushResult {
    pub accepted: u32,
    pub duplicates: u32,
    pub rejected: u32,
    pub transport_errors: u32,
}

impl BatchPushResult {
    pub fn ok_for_cycle(&self) -> bool {
        self.transport_errors == 0
            && (self.accepted > 0 || self.duplicates > 0 || self.rejected == 0)
    }

    pub fn had_hard_failure(&self, fetched: usize) -> bool {
        fetched > 0 && self.accepted == 0 && self.transport_errors > 0
    }
}

/// Push validated events to SpacetimeDB (preferred batch reducer, single-event fallback).
pub async fn push_events(
    stdb: &StdbClient,
    metrics: &IngestMetrics,
    events: &[WorldEvent],
    source_label: &str,
    source_url: &str,
) -> BatchPushResult {
    if events.is_empty() {
        return BatchPushResult::default();
    }

    metrics.record_fetch(events.len());
    let mut total = BatchPushResult::default();

    for chunk in events.chunks(STDB_BATCH_CHUNK) {
        match stdb
            .ingest_events_batch(chunk, source_label, source_url)
            .await
        {
            Ok(partial) => {
                total.accepted += partial.accepted;
                total.duplicates += partial.duplicates;
                total.rejected += partial.rejected;
            }
            Err(batch_err) => {
                warn!(
                    source_label,
                    count = chunk.len(),
                    "batch ingest failed, falling back to single-event calls: {batch_err:#}"
                );
                metrics.record_batch_fallback();
                let fallback = push_events_single(stdb, chunk, source_label, source_url).await;
                total.accepted += fallback.accepted;
                total.duplicates += fallback.duplicates;
                total.rejected += fallback.rejected;
                total.transport_errors += fallback.transport_errors;
            }
        }
    }

    metrics.record_batch_push(&total);
    debug!(
        source_label,
        accepted = total.accepted,
        duplicates = total.duplicates,
        rejected = total.rejected,
        transport_errors = total.transport_errors,
        "ingest push complete"
    );
    total
}

pub async fn push_events_via_state(
    state: &AppState,
    events: Vec<WorldEvent>,
    source_label: &str,
    source_url: &str,
) -> BatchPushResult {
    push_events(
        &state.stdb,
        &state.metrics,
        &events,
        source_label,
        source_url,
    )
    .await
}

async fn push_events_single(
    stdb: &StdbClient,
    events: &[WorldEvent],
    source_label: &str,
    source_url: &str,
) -> BatchPushResult {
    let mut result = BatchPushResult::default();
    for event in events {
        match stdb.ingest_event(event, source_label, source_url).await {
            Ok(IngestOutcome::Accepted) => result.accepted += 1,
            Ok(IngestOutcome::Duplicate) => result.duplicates += 1,
            Err(error) => {
                let msg = error.to_string();
                if msg.contains("failed pre-flight validation") {
                    result.rejected += 1;
                } else {
                    result.transport_errors += 1;
                }
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batch_push_result_ok_for_cycle() {
        assert!(BatchPushResult {
            accepted: 1,
            ..Default::default()
        }
        .ok_for_cycle());
        assert!(BatchPushResult {
            duplicates: 2,
            ..Default::default()
        }
        .ok_for_cycle());
        assert!(!BatchPushResult {
            transport_errors: 1,
            ..Default::default()
        }
        .ok_for_cycle());
    }

    #[test]
    fn batch_push_had_hard_failure() {
        assert!(BatchPushResult {
            transport_errors: 1,
            ..Default::default()
        }
        .had_hard_failure(3));
        assert!(!BatchPushResult {
            accepted: 1,
            ..Default::default()
        }
        .had_hard_failure(3));
    }

    #[test]
    fn stdb_batch_chunk_within_module_max() {
        const { assert!(STDB_BATCH_CHUNK <= 128); }
        const { assert!(STDB_BATCH_CHUNK > 0); }
    }
}
