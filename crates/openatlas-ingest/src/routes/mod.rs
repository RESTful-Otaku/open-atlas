//! HTTP surface for the ingest service.
//!
//! With SpacetimeDB as the single source of truth, the ingest service no
//! longer owns read endpoints. The only HTTP surface is:
//!
//! * `/health` — unauthenticated liveness (process alive).
//! * `/ready`  — readiness (can reach SpacetimeDB).
//! * `/status` — per-feed health + stdb connection info.
//! * fallback  — serves `web/dist/` if a bundle is present, so a bare
//!   `cargo run` can still boot a dashboard.
//!
//! All *writes* go through SpacetimeDB reducers directly from feeds and
//! the simulator. All *reads* go straight from the browser to SpacetimeDB
//! over the SDK's WebSocket subscriptions.

use axum::{routing::get, Router};
use tower_http::{cors::CorsLayer, services::ServeDir};

use crate::state::AppState;

mod health;

pub(crate) fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health::health))
        .route("/ready", get(health::ready))
        .route("/status", get(health::service_status))
        .fallback_service(ServeDir::new("web/dist"))
        .layer(CorsLayer::permissive())
        .with_state(state)
}
