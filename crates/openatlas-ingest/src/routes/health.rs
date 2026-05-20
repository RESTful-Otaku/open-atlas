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

/// Prometheus text exposition of process-local ingest counters.
pub(crate) async fn metrics(State(state): State<AppState>) -> impl IntoResponse {
    let body = state.metrics.snapshot().to_prometheus_text();
    (
        [(axum::http::header::CONTENT_TYPE, "text/plain; version=0.0.4; charset=utf-8")],
        body,
    )
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

    let mode = crate::ingest_mode::ingest_mode();
    let stdb_reachable = state.stdb.is_reachable().await;
    let stdb_event_count = if stdb_reachable {
        state.stdb.count_rows("event").await
    } else {
        None
    };
    let stdb_audit_count = if stdb_reachable {
        state.stdb.count_rows("ingest_audit").await
    } else {
        None
    };
    let ingest_metrics = state.metrics.snapshot();
    let status = ServiceStatus {
        uptime_seconds: Utc::now()
            .signed_duration_since(state.started_at)
            .num_seconds()
            .max(0),
        ingest_mode: mode.to_string(),
        simulators_enabled: mode.simulators_enabled(),
        live_feeds_enabled: mode.live_feeds_enabled(),
        stdb_uri: state.stdb.uri().to_owned(),
        stdb_database: state.stdb.database().to_owned(),
        stdb_reachable,
        stdb_event_count,
        feeds,
    };
    let body = serde_json::to_value(&status).unwrap_or_default();
    let mut envelope = body.as_object().cloned().unwrap_or_default();
    envelope.insert("ingest_metrics".to_owned(), json!(ingest_metrics));
    envelope.insert(
        "data_plane".to_owned(),
        json!({
            "authoritative_store": "spacetimedb",
            "event_retention_hours": crate::feed_poll::DEFAULT_RETENTION_HOURS,
            "ingest_batch_chunk": crate::pipeline::STDB_BATCH_CHUNK,
            "ingest_reducer_batch": "ingest_events_batch",
            "ingest_audit_table": "ingest_audit",
            "stdb_audit_row_count": stdb_audit_count,
            "circuit_breaker_threshold": crate::circuit::CIRCUIT_FAILURE_THRESHOLD,
            "external_api_access": "ingest_feed_workers_only",
            "browser_reads": "spacetimedb_websocket_subscriptions",
            "ui_never_calls_live_open_data_apis": true,
            "poll_interval_options_secs": crate::feed_poll::POLL_INTERVAL_OPTIONS_SECS,
        }),
    );
    Json(serde_json::Value::Object(envelope))
}
