//! Per-feed health tracking plus the top-level `ServiceStatus` DTO.
//!
//! `FeedHealth` is both the runtime record and the wire shape exposed on
//! `/status`. The records are small, serialisable, and bounded in number
//! (one per feed name) so we can cheaply clone them for the status endpoint.

use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{feed_config, feed_poll, feeds, ingest_mode::IngestMode, state::AppState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedHealth {
    pub(crate) name: String,
    pub(crate) enabled: bool,
    /// Supervisor task is running (may still be in backoff).
    pub(crate) worker_running: bool,
    pub(crate) success_count: u64,
    pub(crate) failure_count: u64,
    pub(crate) consecutive_failures: u32,
    pub(crate) last_success: Option<DateTime<Utc>>,
    pub(crate) last_error: Option<String>,
    pub(crate) next_retry_ms: Option<u64>,
    pub(crate) last_test_at: Option<DateTime<Utc>>,
    pub(crate) last_test_ok: Option<bool>,
    pub(crate) last_test_message: Option<String>,
    pub(crate) last_test_event_count: Option<usize>,
    /// Configured poll cadence (seconds); may differ from descriptor default.
    pub(crate) poll_interval_secs: u64,
    pub(crate) default_poll_interval_secs: u64,
    pub(crate) last_events_accepted: u32,
    pub(crate) last_events_duplicate: u32,
    pub(crate) last_poll_at: Option<DateTime<Utc>>,
    pub(crate) next_poll_at: Option<DateTime<Utc>>,
    /// When true, the supervisor skips upstream fetch until manual reconnect.
    pub(crate) circuit_open: bool,
}

/// `/status` response body. The ingest service no longer owns the world
/// state — all event/causal counts live in SpacetimeDB — so this shape
/// is strictly about the *pusher's* own health.
#[derive(Debug, Serialize)]
pub(crate) struct ServiceStatus {
    pub(crate) uptime_seconds: i64,
    pub(crate) ingest_mode: String,
    pub(crate) simulators_enabled: bool,
    pub(crate) live_feeds_enabled: bool,
    pub(crate) stdb_uri: String,
    pub(crate) stdb_database: String,
    pub(crate) stdb_reachable: bool,
    /// Best-effort row count from `SELECT COUNT(*) AS c FROM event`.
    pub(crate) stdb_event_count: Option<u64>,
    pub(crate) feeds: Vec<FeedHealth>,
}

/// Populate the runtime feed health map from the registered feed catalog.
/// Feeds gated on env-derived API keys start disabled when the key is missing.
/// Logic here is fully data-driven: it walks [`feeds::REGISTRY`] and
/// consults each descriptor's `requires_env`, so adding a new feed (or a
/// new env gate) needs no edit in this file.
pub async fn initialize_feed_runtime(state: &AppState, mode: IngestMode) {
    let live_enabled = mode.live_feeds_enabled();

    let mut feed_map = state.feed_runtime.write().await;
    for descriptor in feeds::REGISTRY {
        let env_satisfied = descriptor
            .requires_env
            .is_none_or(feed_config::env_key_present);
        let enabled = live_enabled && env_satisfied;
        let default_secs = feed_poll::default_interval_secs(descriptor);
        let poll_secs = feed_poll::effective_interval_secs(descriptor.name, default_secs);
        feed_map.insert(
            descriptor.name.to_owned(),
            FeedHealth {
                name: descriptor.name.to_owned(),
                enabled,
                worker_running: false,
                success_count: 0,
                failure_count: 0,
                consecutive_failures: 0,
                last_success: None,
                last_error: None,
                next_retry_ms: None,
                last_test_at: None,
                last_test_ok: None,
                last_test_message: None,
                last_test_event_count: None,
                poll_interval_secs: poll_secs,
                default_poll_interval_secs: default_secs,
                last_events_accepted: 0,
                last_events_duplicate: 0,
                last_poll_at: None,
                next_poll_at: None,
                circuit_open: false,
            },
        );
    }
}

pub(crate) async fn record_feed_poll_start(state: &AppState, feed_name: &str) {
    let mut feeds = state.feed_runtime.write().await;
    if let Some(feed) = feeds.get_mut(feed_name) {
        feed.last_poll_at = Some(Utc::now());
    }
}

pub(crate) async fn record_feed_success(
    state: &AppState,
    feed_name: &str,
    accepted: u32,
    duplicates: u32,
    next_in: Duration,
) {
    let mut feeds = state.feed_runtime.write().await;
    if let Some(feed) = feeds.get_mut(feed_name) {
        feed.success_count = feed.success_count.saturating_add(1);
        feed.consecutive_failures = 0;
        feed.last_success = Some(Utc::now());
        feed.last_error = None;
        feed.next_retry_ms = None;
        feed.last_events_accepted = accepted;
        feed.last_events_duplicate = duplicates;
        feed.next_poll_at = schedule_next_poll(next_in);
    }
}

fn schedule_next_poll(interval: Duration) -> Option<DateTime<Utc>> {
    Some(
        Utc::now() + chrono::Duration::from_std(interval).unwrap_or(chrono::TimeDelta::seconds(60)),
    )
}

pub(crate) async fn record_feed_failure(
    state: &AppState,
    feed_name: &str,
    reason: String,
    retry: Duration,
) {
    let mut feeds = state.feed_runtime.write().await;
    if let Some(feed) = feeds.get_mut(feed_name) {
        feed.failure_count = feed.failure_count.saturating_add(1);
        feed.consecutive_failures = feed.consecutive_failures.saturating_add(1);
        feed.last_error = Some(reason);
        feed.next_retry_ms = Some(retry.as_millis() as u64);
        feed.next_poll_at = schedule_next_poll(retry);
        feed.last_events_accepted = 0;
        feed.last_events_duplicate = 0;
    }
}

pub(crate) async fn sync_poll_intervals_from_config(state: &AppState) {
    let mut feeds = state.feed_runtime.write().await;
    for descriptor in feeds::REGISTRY {
        if let Some(feed) = feeds.get_mut(descriptor.name) {
            let default = feed_poll::default_interval_secs(descriptor);
            feed.default_poll_interval_secs = default;
            feed.poll_interval_secs = feed_poll::effective_interval_secs(descriptor.name, default);
        }
    }
}

/// Exponential backoff with a fixed ceiling. Doubling keeps the math simple
/// and deterministic; the 5-minute cap prevents runaway delay after long
/// outages.
#[allow(dead_code)]
pub(crate) fn next_backoff(current: Duration) -> Duration {
    const MAX_BACKOFF: Duration = Duration::from_secs(300);
    let next = current.saturating_mul(2);
    if next > MAX_BACKOFF {
        MAX_BACKOFF
    } else {
        next
    }
}

pub(crate) async fn record_feed_test(
    state: &AppState,
    feed_name: &str,
    ok: bool,
    message: String,
    event_count: usize,
) {
    let mut feeds = state.feed_runtime.write().await;
    if let Some(feed) = feeds.get_mut(feed_name) {
        feed.last_test_at = Some(Utc::now());
        feed.last_test_ok = Some(ok);
        feed.last_test_message = Some(message);
        feed.last_test_event_count = Some(event_count);
    }
}

pub(crate) async fn set_feed_worker_running(state: &AppState, feed_name: &str, running: bool) {
    let mut feeds = state.feed_runtime.write().await;
    if let Some(feed) = feeds.get_mut(feed_name) {
        feed.worker_running = running;
    }
}

pub(crate) async fn refresh_feed_enabled_flags(state: &AppState) {
    let live_enabled = crate::ingest_mode::ingest_mode().live_feeds_enabled();
    let mut feeds = state.feed_runtime.write().await;
    for descriptor in feeds::REGISTRY {
        let env_satisfied = descriptor
            .requires_env
            .is_none_or(feed_config::env_key_present);
        if let Some(feed) = feeds.get_mut(descriptor.name) {
            feed.enabled = live_enabled && env_satisfied;
        }
    }
}

pub(crate) async fn clear_feed_backoff(state: &AppState, feed_name: &str) {
    let mut feeds = state.feed_runtime.write().await;
    if let Some(feed) = feeds.get_mut(feed_name) {
        feed.consecutive_failures = 0;
        feed.last_error = None;
        feed.next_retry_ms = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_doubles_until_cap() {
        let a = next_backoff(Duration::from_secs(30));
        assert_eq!(a, Duration::from_secs(60));
        let b = next_backoff(Duration::from_secs(180));
        assert_eq!(b, Duration::from_secs(300));
        let c = next_backoff(Duration::from_secs(600));
        assert_eq!(c, Duration::from_secs(300));
    }
}
