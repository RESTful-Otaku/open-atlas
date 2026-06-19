//! Shared, clone-cheap runtime state for the ingest service.
//!
//! With SpacetimeDB as the authoritative store the ingest service is now
//! a stateless pusher: it tracks only its own lifecycle (started_at) and
//! per-feed health for `/status`. Everything domain-related lives in the
//! SpacetimeDB module.

use std::{collections::HashSet, net::SocketAddr, sync::Arc};

use chrono::{DateTime, Utc};
use tokio::sync::RwLock;

use crate::{
    health::FeedHealth, metrics::IngestMetrics, rate_limit::FeedRateLimiter, stdb::StdbClient,
};

type FeedRuntimeMap = std::collections::HashMap<String, FeedHealth>;

/// Service-wide state handed to every feed worker, simulator, and
/// HTTP handler. Cheap to clone (all fields are `Arc` or `Copy`).
#[derive(Clone)]
pub struct AppState {
    /// HTTP listen address (drives admin auth policy for mutating routes).
    pub bind_addr: SocketAddr,
    pub started_at: DateTime<Utc>,
    pub feed_runtime: Arc<RwLock<FeedRuntimeMap>>,
    /// Feed supervisor tasks already spawned (avoids duplicate workers).
    pub spawned_feeds: Arc<RwLock<HashSet<String>>>,
    pub stdb: StdbClient,
    pub rate_limiter: Arc<FeedRateLimiter>,
    pub metrics: Arc<IngestMetrics>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_state_is_clone_cheap() {
        let state = AppState {
            bind_addr: "127.0.0.1:8080".parse().unwrap(),
            started_at: Utc::now(),
            feed_runtime: Arc::new(RwLock::new(std::collections::HashMap::new())),
            spawned_feeds: Arc::new(RwLock::new(HashSet::new())),
            stdb: crate::stdb::StdbClient::from_env().unwrap(),
            rate_limiter: Arc::new(crate::rate_limit::FeedRateLimiter::new()),
            metrics: Arc::new(crate::metrics::IngestMetrics::default()),
        };
        let cloned = state.clone();
        assert!(Arc::ptr_eq(&state.feed_runtime, &cloned.feed_runtime));
        assert!(Arc::ptr_eq(&state.spawned_feeds, &cloned.spawned_feeds));
        assert!(Arc::ptr_eq(&state.rate_limiter, &cloned.rate_limiter));
        assert!(Arc::ptr_eq(&state.metrics, &cloned.metrics));
        assert_eq!(state.bind_addr, cloned.bind_addr);
    }

    #[tokio::test]
    async fn feed_runtime_initializes_empty() {
        let state = AppState {
            bind_addr: "127.0.0.1:8080".parse().unwrap(),
            started_at: Utc::now(),
            feed_runtime: Arc::new(RwLock::new(std::collections::HashMap::new())),
            spawned_feeds: Arc::new(RwLock::new(HashSet::new())),
            stdb: crate::stdb::StdbClient::from_env().unwrap(),
            rate_limiter: Arc::new(crate::rate_limit::FeedRateLimiter::new()),
            metrics: Arc::new(crate::metrics::IngestMetrics::default()),
        };
        let map = state.feed_runtime.read().await;
        assert!(map.is_empty());
    }

    #[tokio::test]
    async fn spawned_feeds_initializes_empty_set() {
        let state = AppState {
            bind_addr: "127.0.0.1:8080".parse().unwrap(),
            started_at: Utc::now(),
            feed_runtime: Arc::new(RwLock::new(std::collections::HashMap::new())),
            spawned_feeds: Arc::new(RwLock::new(HashSet::new())),
            stdb: crate::stdb::StdbClient::from_env().unwrap(),
            rate_limiter: Arc::new(crate::rate_limit::FeedRateLimiter::new()),
            metrics: Arc::new(crate::metrics::IngestMetrics::default()),
        };
        let set = state.spawned_feeds.read().await;
        assert!(set.is_empty());
    }
}
