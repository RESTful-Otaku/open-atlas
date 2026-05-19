//! HTTP tests for feed catalog and test endpoints.

use std::sync::Arc;

use axum::body::Body;
use chrono::Utc;
use openatlas_ingest::{
    feed_config, health::initialize_feed_runtime, ingest_mode::IngestMode, metrics::IngestMetrics,
    rate_limit, routes::router, state::AppState, stdb::StdbClient,
};
use tokio::sync::RwLock;
use tower::ServiceExt;

fn test_state() -> AppState {
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

#[tokio::test]
async fn list_feeds_returns_catalog() {
    let state = test_state();
    initialize_feed_runtime(&state, IngestMode::Live).await;
    let app = router(state);

    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/feeds")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), axum::http::StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let feeds = json["feeds"].as_array().expect("feeds array");
    assert!(feeds.len() >= 9);
    assert!(feeds.iter().any(|f| f["name"] == "usgs"));
}

#[tokio::test]
async fn test_usgs_feed_fetch() {
    let state = test_state();
    initialize_feed_runtime(&state, IngestMode::Live).await;
    let app = router(state);

    let response = app
        .oneshot(
            axum::http::Request::builder()
                .method("POST")
                .uri("/feeds/usgs/test")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), axum::http::StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["feed"], "usgs");
    assert!(json["ok"].as_bool().unwrap_or(false));
}
