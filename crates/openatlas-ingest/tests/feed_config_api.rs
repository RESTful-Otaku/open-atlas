//! HTTP tests for feed catalog and test endpoints.

mod common;

use axum::body::Body;
use openatlas_ingest::ingest_mode::IngestMode;
use tower::ServiceExt;

#[tokio::test]
async fn list_feeds_returns_catalog() {
    let app = common::test_router(IngestMode::Live).await;

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
    let app = common::test_router(IngestMode::Live).await;

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
