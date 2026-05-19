//! HTTP surface for the ingest service.
//!
//! With SpacetimeDB as the single source of truth, the ingest service no
//! longer owns read endpoints. The only HTTP surface is:
//!
//! * `/health` — unauthenticated liveness (process alive).
//! * `/ready`  — readiness (can reach SpacetimeDB).
//! * `/status` — per-feed health + stdb connection info.
//! * `/feeds` — feed catalog, API key config (`PUT`), test/reconnect.
//!
//! **Security:** no authentication on these routes — bind to localhost in
//! production or place behind a trusted reverse proxy. `PUT /feeds` only
//! accepts known feed API key env names.
//! * fallback  — serves `web/dist/` if a bundle is present, so a bare
//!   `cargo run` can still boot a dashboard.
//!
//! All *writes* go through SpacetimeDB reducers directly from feeds and
//! the simulator. All *reads* go straight from the browser to SpacetimeDB
//! over the SDK's WebSocket subscriptions.

use axum::{routing::get, Router};
use tower_http::{cors::CorsLayer, services::ServeDir};

use crate::state::AppState;

mod feeds;
mod health;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health::health))
        .route("/ready", get(health::ready))
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
