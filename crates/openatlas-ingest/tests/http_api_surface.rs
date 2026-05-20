//! HTTP API surface tests (health, status, poll config) — no live upstream required.

mod common;

use axum::body::Body;
use openatlas_ingest::ingest_mode::IngestMode;
use tower::ServiceExt;

#[tokio::test]
async fn health_returns_ok_plaintext() {
    let app = common::test_router(IngestMode::Hybrid).await;
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), axum::http::StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    assert_eq!(body, "ok");
}

#[tokio::test]
async fn metrics_returns_prometheus_text() {
    let app = common::test_router(IngestMode::Hybrid).await;
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/metrics")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), axum::http::StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let text = String::from_utf8(body.to_vec()).unwrap();
    assert!(text.contains("openatlas_ingest_events_fetched_total"));
    assert!(text.contains("# TYPE openatlas_ingest_batch_calls_total counter"));
}

#[tokio::test]
async fn status_includes_data_plane_and_metrics() {
    let app = common::test_router(IngestMode::Hybrid).await;
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/status")
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
    assert!(json["ingest_mode"].is_string());
    assert!(json["feeds"].is_array());
    assert!(json["ingest_metrics"].is_object());
    let plane = &json["data_plane"];
    assert_eq!(plane["authoritative_store"], "spacetimedb");
    assert_eq!(plane["ingest_reducer_batch"], "ingest_events_batch");
    assert!(plane["poll_interval_options_secs"].is_array());
}

#[tokio::test]
async fn put_poll_intervals_validates_feed_name() {
    let app = common::test_router(IngestMode::Live).await;
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .method("PUT")
                .uri("/feeds/poll-intervals")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"intervals":{"not-a-feed":60}}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), axum::http::StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn put_poll_intervals_accepts_known_feed() {
    let app = common::test_router(IngestMode::Live).await;
    let body = r#"{"intervals":{"usgs":300}}"#;
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .method("PUT")
                .uri("/feeds/poll-intervals")
                .header("content-type", "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), axum::http::StatusCode::OK);
}
