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
