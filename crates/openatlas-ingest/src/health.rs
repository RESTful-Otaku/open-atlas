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
    /// When the circuit was opened (for auto-recovery cooldown).
    pub(crate) circuit_opened_since: Option<DateTime<Utc>>,
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
                circuit_opened_since: None,
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
    use std::collections::HashMap;
    use std::collections::HashSet;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn test_state() -> AppState {
        AppState {
            bind_addr: "127.0.0.1:0".parse().unwrap(),
            started_at: Utc::now(),
            feed_runtime: Arc::new(RwLock::new(HashMap::new())),
            spawned_feeds: Arc::new(RwLock::new(HashSet::new())),
            stdb: crate::stdb::StdbClient::from_env().unwrap(),
            rate_limiter: Arc::new(crate::rate_limit::FeedRateLimiter::new()),
            metrics: Arc::new(crate::metrics::IngestMetrics::default()),
        }
    }

    async fn insert_feed(state: &AppState, name: &str) {
        let mut map = state.feed_runtime.write().await;
        map.insert(
            name.to_owned(),
            FeedHealth {
                name: name.to_owned(),
                enabled: true,
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
                poll_interval_secs: 60,
                default_poll_interval_secs: 60,
                last_events_accepted: 0,
                last_events_duplicate: 0,
                last_poll_at: None,
                next_poll_at: None,
                circuit_open: false,
                circuit_opened_since: None,
            },
        );
    }

    #[tokio::test]
    async fn initialize_feed_runtime_populates_all_registered_feeds() {
        let state = test_state();
        initialize_feed_runtime(&state, IngestMode::Live).await;
        let map = state.feed_runtime.read().await;
        assert_eq!(map.len(), feeds::REGISTRY.len());
        for descriptor in feeds::REGISTRY {
            let entry = map
                .get(descriptor.name)
                .unwrap_or_else(|| panic!("missing feed: {}", descriptor.name));
            assert_eq!(entry.name, descriptor.name);
        }
    }

    #[tokio::test]
    async fn initialize_feed_runtime_respects_env_gating() {
        std::env::remove_var("FRED_API_KEY");
        std::env::remove_var("EIA_API_KEY");
        std::env::remove_var("OPENSKY_CLIENT_ID");
        std::env::remove_var("OPENSKY_CLIENT_SECRET");
        let state = test_state();
        initialize_feed_runtime(&state, IngestMode::Live).await;
        let map = state.feed_runtime.read().await;
        for descriptor in feeds::REGISTRY {
            let entry = map.get(descriptor.name).unwrap();
            let env_satisfied = descriptor
                .requires_env
                .is_none_or(feed_config::env_key_present);
            assert_eq!(
                entry.enabled, env_satisfied,
                "feed {} enabled={} but env_satisfied={}",
                descriptor.name, entry.enabled, env_satisfied
            );
        }
    }

    #[tokio::test]
    async fn record_feed_success_updates_counts() {
        let state = test_state();
        insert_feed(&state, "test-feed").await;
        record_feed_success(&state, "test-feed", 5, 2, Duration::from_secs(60)).await;
        let map = state.feed_runtime.read().await;
        let feed = map.get("test-feed").unwrap();
        assert_eq!(feed.success_count, 1);
        assert_eq!(feed.consecutive_failures, 0);
        assert!(feed.last_success.is_some());
        assert!(feed.last_error.is_none());
        assert_eq!(feed.last_events_accepted, 5);
        assert_eq!(feed.last_events_duplicate, 2);
        assert!(feed.next_poll_at.is_some());
    }

    #[tokio::test]
    async fn record_feed_failure_updates_counts() {
        let state = test_state();
        insert_feed(&state, "test-feed").await;
        record_feed_failure(&state, "test-feed", "timeout".into(), Duration::from_secs(30)).await;
        let map = state.feed_runtime.read().await;
        let feed = map.get("test-feed").unwrap();
        assert_eq!(feed.failure_count, 1);
        assert_eq!(feed.consecutive_failures, 1);
        assert_eq!(feed.last_error.as_deref(), Some("timeout"));
        assert_eq!(feed.last_events_accepted, 0);
        assert_eq!(feed.last_events_duplicate, 0);
    }

    #[tokio::test]
    async fn consecutive_failures_saturate_at_u32_max() {
        let state = test_state();
        insert_feed(&state, "saturating-feed").await;
        {
            let mut map = state.feed_runtime.write().await;
            let feed = map.get_mut("saturating-feed").unwrap();
            feed.consecutive_failures = u32::MAX;
        }
        record_feed_failure(
            &state,
            "saturating-feed",
            "another error".into(),
            Duration::from_secs(60),
        )
        .await;
        let map = state.feed_runtime.read().await;
        let feed = map.get("saturating-feed").unwrap();
        assert_eq!(feed.consecutive_failures, u32::MAX);
        assert_eq!(feed.failure_count, 1);
    }

    #[tokio::test]
    async fn record_feed_poll_start_records_timestamp() {
        let state = test_state();
        insert_feed(&state, "poll-feed").await;
        record_feed_poll_start(&state, "poll-feed").await;
        let map = state.feed_runtime.read().await;
        let feed = map.get("poll-feed").unwrap();
        assert!(feed.last_poll_at.is_some());
    }

    #[tokio::test]
    async fn sync_poll_intervals_reflects_config() {
        let state = test_state();
        initialize_feed_runtime(&state, IngestMode::Live).await;
        {
            let mut map = state.feed_runtime.write().await;
            for (_, feed) in map.iter_mut() {
                feed.poll_interval_secs = 9999;
                feed.default_poll_interval_secs = 9999;
            }
        }
        sync_poll_intervals_from_config(&state).await;
        let map = state.feed_runtime.read().await;
        for descriptor in feeds::REGISTRY {
            let entry = map.get(descriptor.name).unwrap();
            let expected_default = feed_poll::default_interval_secs(descriptor);
            assert_eq!(
                entry.default_poll_interval_secs, expected_default,
                "{} default should be {} not {}",
                descriptor.name, expected_default, entry.default_poll_interval_secs
            );
        }
    }

    #[tokio::test]
    async fn record_feed_test_records_all_fields() {
        let state = test_state();
        insert_feed(&state, "testable-feed").await;
        record_feed_test(&state, "testable-feed", true, "all good".into(), 7).await;
        let map = state.feed_runtime.read().await;
        let feed = map.get("testable-feed").unwrap();
        assert!(feed.last_test_at.is_some());
        assert_eq!(feed.last_test_ok, Some(true));
        assert_eq!(feed.last_test_message.as_deref(), Some("all good"));
        assert_eq!(feed.last_test_event_count, Some(7));
    }

    #[tokio::test]
    async fn set_feed_worker_running_toggles_flag() {
        let state = test_state();
        insert_feed(&state, "worker-feed").await;
        set_feed_worker_running(&state, "worker-feed", true).await;
        {
            let map = state.feed_runtime.read().await;
            assert!(map.get("worker-feed").unwrap().worker_running);
        }
        set_feed_worker_running(&state, "worker-feed", false).await;
        {
            let map = state.feed_runtime.read().await;
            assert!(!map.get("worker-feed").unwrap().worker_running);
        }
    }

    #[tokio::test]
    async fn refresh_feed_enabled_flags_updates_enabled() {
        std::env::set_var("OPENATLAS_INGEST_MODE", "live");
        let state = test_state();
        initialize_feed_runtime(&state, IngestMode::Live).await;
        {
            let mut map = state.feed_runtime.write().await;
            for (_, feed) in map.iter_mut() {
                feed.enabled = false;
            }
        }
        std::env::remove_var("FRED_API_KEY");
        std::env::remove_var("EIA_API_KEY");
        std::env::remove_var("OPENSKY_CLIENT_ID");
        std::env::remove_var("OPENSKY_CLIENT_SECRET");
        refresh_feed_enabled_flags(&state).await;
        let map = state.feed_runtime.read().await;
        for descriptor in feeds::REGISTRY {
            let entry = map.get(descriptor.name).unwrap();
            let env_satisfied = descriptor
                .requires_env
                .is_none_or(feed_config::env_key_present);
            assert!(entry.enabled == env_satisfied);
        }
    }

    #[tokio::test]
    async fn clear_feed_backoff_resets_failure_state() {
        let state = test_state();
        insert_feed(&state, "backoff-feed").await;
        {
            let mut map = state.feed_runtime.write().await;
            let feed = map.get_mut("backoff-feed").unwrap();
            feed.consecutive_failures = 7;
            feed.last_error = Some("boom".into());
            feed.next_retry_ms = Some(30_000);
        }
        clear_feed_backoff(&state, "backoff-feed").await;
        let map = state.feed_runtime.read().await;
        let feed = map.get("backoff-feed").unwrap();
        assert_eq!(feed.consecutive_failures, 0);
        assert!(feed.last_error.is_none());
        assert!(feed.next_retry_ms.is_none());
    }

    #[test]
    fn feed_health_serde_round_trip() {
        let health = FeedHealth {
            name: "test-feed".into(),
            enabled: true,
            worker_running: false,
            success_count: 42,
            failure_count: 3,
            consecutive_failures: 1,
            last_success: Some(Utc::now()),
            last_error: Some("oops".into()),
            next_retry_ms: Some(5_000),
            last_test_at: None,
            last_test_ok: Some(true),
            last_test_message: Some("ok".into()),
            last_test_event_count: Some(10),
            poll_interval_secs: 60,
            default_poll_interval_secs: 60,
            last_events_accepted: 5,
            last_events_duplicate: 2,
            last_poll_at: Some(Utc::now()),
            next_poll_at: Some(Utc::now()),
            circuit_open: false,
            circuit_opened_since: None,
        };
        let json = serde_json::to_string(&health).expect("serialize");
        let deserialized: FeedHealth = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized.name, "test-feed");
        assert_eq!(deserialized.success_count, 42);
        assert_eq!(deserialized.consecutive_failures, 1);
        assert_eq!(
            deserialized.last_error.as_deref(),
            Some("oops")
        );
    }

    #[test]
    fn service_status_can_be_serialized() {
        let status = ServiceStatus {
            uptime_seconds: 3600,
            ingest_mode: "live".into(),
            simulators_enabled: false,
            live_feeds_enabled: true,
            stdb_uri: "http://localhost:3000".into(),
            stdb_database: "openatlas".into(),
            stdb_reachable: true,
            stdb_event_count: Some(1000),
            feeds: vec![FeedHealth {
                name: "usgs".into(),
                enabled: true,
                worker_running: true,
                success_count: 10,
                failure_count: 0,
                consecutive_failures: 0,
                last_success: Some(Utc::now()),
                last_error: None,
                next_retry_ms: None,
                last_test_at: None,
                last_test_ok: None,
                last_test_message: None,
                last_test_event_count: None,
                poll_interval_secs: 45,
                default_poll_interval_secs: 45,
                last_events_accepted: 3,
                last_events_duplicate: 1,
                last_poll_at: Some(Utc::now()),
                next_poll_at: Some(Utc::now()),
                circuit_open: false,
                circuit_opened_since: None,
            }],
        };
        let json = serde_json::to_string(&status).expect("serialize");
        assert!(json.contains("usgs"));
        assert!(json.contains("live"));
    }
}


