//! Per-feed circuit breaker — stops polling upstream after repeated failures
//! (industry pattern: fail fast, manual recovery via Settings reconnect).

use crate::{health, state::AppState};

/// Open the circuit after this many consecutive failed poll cycles.
pub const CIRCUIT_FAILURE_THRESHOLD: u32 = 5;

pub async fn is_circuit_open(state: &AppState, feed: &str) -> bool {
    let feeds = state.feed_runtime.read().await;
    feeds
        .get(feed)
        .is_some_and(|h| h.circuit_open)
}

pub async fn on_poll_success(state: &AppState, feed: &str) {
    let mut feeds = state.feed_runtime.write().await;
    if let Some(h) = feeds.get_mut(feed) {
        h.circuit_open = false;
    }
}

pub async fn on_poll_failure(state: &AppState, feed: &str) {
    let mut feeds = state.feed_runtime.write().await;
    if let Some(h) = feeds.get_mut(feed) {
        if h.consecutive_failures >= CIRCUIT_FAILURE_THRESHOLD {
            h.circuit_open = true;
        }
    }
}

pub async fn reset_circuit(state: &AppState, feed: &str) {
    health::clear_feed_backoff(state, feed).await;
    let mut feeds = state.feed_runtime.write().await;
    if let Some(h) = feeds.get_mut(feed) {
        h.circuit_open = false;
        h.consecutive_failures = 0;
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use chrono::Utc;
    use tokio::sync::RwLock;

    use crate::{
        health::initialize_feed_runtime,
        ingest_mode::IngestMode,
        metrics::IngestMetrics,
        rate_limit,
        state::AppState,
        stdb::StdbClient,
    };

    use super::*;

    async fn test_state() -> AppState {
        let rate_limiter = Arc::new(rate_limit::FeedRateLimiter::new());
        rate_limit::install(rate_limiter.clone());
        let state = AppState {
            started_at: Utc::now(),
            feed_runtime: Arc::new(RwLock::new(std::collections::HashMap::new())),
            spawned_feeds: Arc::new(RwLock::new(std::collections::HashSet::new())),
            stdb: StdbClient::from_env().expect("stdb client"),
            rate_limiter,
            metrics: Arc::new(IngestMetrics::default()),
        };
        initialize_feed_runtime(&state, IngestMode::Live).await;
        state
    }

    async fn set_failures(state: &AppState, feed: &str, n: u32) {
        let mut feeds = state.feed_runtime.write().await;
        let h = feeds.get_mut(feed).expect("feed in runtime");
        h.consecutive_failures = n;
        h.circuit_open = false;
    }

    #[tokio::test]
    async fn circuit_opens_after_threshold() {
        let state = test_state().await;
        set_failures(&state, "usgs", CIRCUIT_FAILURE_THRESHOLD).await;
        on_poll_failure(&state, "usgs").await;
        assert!(is_circuit_open(&state, "usgs").await);
    }

    #[tokio::test]
    async fn success_closes_circuit() {
        let state = test_state().await;
        set_failures(&state, "usgs", CIRCUIT_FAILURE_THRESHOLD).await;
        on_poll_failure(&state, "usgs").await;
        on_poll_success(&state, "usgs").await;
        assert!(!is_circuit_open(&state, "usgs").await);
    }

    #[tokio::test]
    async fn reset_circuit_clears_failures() {
        let state = test_state().await;
        set_failures(&state, "usgs", CIRCUIT_FAILURE_THRESHOLD + 2).await;
        on_poll_failure(&state, "usgs").await;
        reset_circuit(&state, "usgs").await;
        assert!(!is_circuit_open(&state, "usgs").await);
        let feeds = state.feed_runtime.read().await;
        assert_eq!(feeds["usgs"].consecutive_failures, 0);
    }
}
