//! Per-feed health tracking plus the top-level `ServiceStatus` DTO.
//!
//! `FeedHealth` is both the runtime record and the wire shape exposed on
//! `/status`. The records are small, serialisable, and bounded in number
//! (one per feed name) so we can cheaply clone them for the status endpoint.

use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{feeds, state::AppState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct FeedHealth {
    pub(crate) name: String,
    pub(crate) enabled: bool,
    pub(crate) success_count: u64,
    pub(crate) failure_count: u64,
    pub(crate) consecutive_failures: u32,
    pub(crate) last_success: Option<DateTime<Utc>>,
    pub(crate) last_error: Option<String>,
    pub(crate) next_retry_ms: Option<u64>,
}

/// `/status` response body. The ingest service no longer owns the world
/// state — all event/causal counts live in SpacetimeDB — so this shape
/// is strictly about the *pusher's* own health.
#[derive(Debug, Serialize)]
pub(crate) struct ServiceStatus {
    pub(crate) uptime_seconds: i64,
    pub(crate) stdb_uri: String,
    pub(crate) stdb_database: String,
    pub(crate) stdb_reachable: bool,
    pub(crate) feeds: Vec<FeedHealth>,
}

/// Populate the runtime feed health map from the registered feed catalog.
/// Feeds gated on env-derived API keys start disabled when the key is missing.
/// Logic here is fully data-driven: it walks [`feeds::REGISTRY`] and
/// consults each descriptor's `requires_env`, so adding a new feed (or a
/// new env gate) needs no edit in this file.
pub(crate) async fn initialize_feed_runtime(state: &AppState) {
    let live_enabled = feeds::live_enabled();

    let mut feed_map = state.feed_runtime.write().await;
    for descriptor in feeds::REGISTRY {
        let env_satisfied = descriptor.requires_env.is_none_or(env_key_present);
        let enabled = live_enabled && env_satisfied;
        feed_map.insert(
            descriptor.name.to_owned(),
            FeedHealth {
                name: descriptor.name.to_owned(),
                enabled,
                success_count: 0,
                failure_count: 0,
                consecutive_failures: 0,
                last_success: None,
                last_error: None,
                next_retry_ms: None,
            },
        );
    }
}

pub(crate) async fn record_feed_success(state: &AppState, feed_name: &str) {
    let mut feeds = state.feed_runtime.write().await;
    if let Some(feed) = feeds.get_mut(feed_name) {
        feed.success_count = feed.success_count.saturating_add(1);
        feed.consecutive_failures = 0;
        feed.last_success = Some(Utc::now());
        feed.last_error = None;
        feed.next_retry_ms = None;
    }
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
    }
}

/// Exponential backoff with a fixed ceiling. Doubling keeps the math simple
/// and deterministic; the 5-minute cap prevents runaway delay after long
/// outages.
pub(crate) fn next_backoff(current: Duration) -> Duration {
    const MAX_BACKOFF: Duration = Duration::from_secs(300);
    let next = current.saturating_mul(2);
    if next > MAX_BACKOFF {
        MAX_BACKOFF
    } else {
        next
    }
}

fn env_key_present(key: &str) -> bool {
    std::env::var(key)
        .map(|value| !value.is_empty())
        .unwrap_or(false)
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
