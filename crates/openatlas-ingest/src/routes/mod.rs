//! HTTP surface: /health, /ready, /metrics, /status, /feeds.

use axum::{routing::get, Router};
use tower_http::{cors::CorsLayer, services::ServeDir};

use crate::state::AppState;

mod feeds;
mod health;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health::health))
        .route("/ready", get(health::ready))
        .route("/metrics", get(health::metrics))
        .route("/status", get(health::service_status))
        .route("/feeds", get(feeds::list_feeds).put(feeds::update_secrets))
        .route(
            "/feeds/poll-intervals",
            axum::routing::put(feeds::update_poll_intervals),
        )
        .route("/feeds/{name}/test", axum::routing::post(feeds::test_feed))
        .route(
            "/feeds/{name}/reconnect",
            axum::routing::post(feeds::reconnect_feed),
        )
        .fallback_service(ServeDir::new("web/dist"))
        .layer(CorsLayer::permissive())
        .with_state(state)
}
