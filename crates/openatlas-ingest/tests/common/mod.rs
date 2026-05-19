//! Shared harness for HTTP integration tests against the ingest router.

use std::sync::Arc;

use axum::Router;
use chrono::Utc;
use openatlas_ingest::{
    feed_config, health::initialize_feed_runtime, ingest_mode::IngestMode, metrics::IngestMetrics,
    rate_limit, routes::router, state::AppState, stdb::StdbClient,
};
use tokio::sync::RwLock;

pub fn test_state() -> AppState {
    let secrets = feed_config::load_secrets_file();
    feed_config::apply_secrets_to_env(&secrets);
    let rate_limiter = Arc::new(rate_limit::FeedRateLimiter::new());
    rate_limit::install(rate_limiter.clone());
    AppState {
        started_at: Utc::now(),
        feed_runtime: Arc::new(RwLock::new(std::collections::HashMap::new())),
        spawned_feeds: Arc::new(RwLock::new(std::collections::HashSet::new())),
        stdb: StdbClient::from_env().expect("stdb client"),
        rate_limiter,
        metrics: Arc::new(IngestMetrics::default()),
    }
}

pub async fn test_router(mode: IngestMode) -> Router {
    let state = test_state();
    initialize_feed_runtime(&state, mode).await;
    router(state)
}
