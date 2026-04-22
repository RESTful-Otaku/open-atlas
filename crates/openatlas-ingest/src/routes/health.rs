//! Liveness, readiness, and aggregated service status handlers.
//!
//! The ingest service is a pusher, not the source of truth — readiness
//! therefore reports whether it can *reach* SpacetimeDB, not whether any
//! events have been ingested.

use axum::{extract::State, response::IntoResponse, Json};
use chrono::Utc;
use serde_json::json;

use crate::{
    health::{FeedHealth, ServiceStatus},
    state::AppState,
};

pub(crate) async fn health() -> &'static str {
    "ok"
}

pub(crate) async fn ready(State(state): State<AppState>) -> impl IntoResponse {
    if state.stdb.is_reachable().await {
        (axum::http::StatusCode::OK, Json(json!({ "ready": true }))).into_response()
    } else {
        (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "ready": false,
                "reason": "spacetimedb unreachable",
                "stdb_uri": state.stdb.uri(),
            })),
        )
            .into_response()
    }
}

pub(crate) async fn service_status(State(state): State<AppState>) -> impl IntoResponse {
    let mut feeds = state
        .feed_runtime
        .read()
        .await
        .values()
        .cloned()
        .collect::<Vec<FeedHealth>>();
    feeds.sort_by(|a, b| a.name.cmp(&b.name));

    let status = ServiceStatus {
        uptime_seconds: Utc::now()
            .signed_duration_since(state.started_at)
            .num_seconds()
            .max(0),
        stdb_uri: state.stdb.uri().to_owned(),
        stdb_database: state.stdb.database().to_owned(),
        stdb_reachable: state.stdb.is_reachable().await,
        feeds,
    };
    Json(status)
}
