//! Admin authentication for mutating `/feeds` routes.

mod common;

use std::sync::Mutex;

use axum::body::Body;
use openatlas_ingest::{auth, ingest_mode::IngestMode};
use tower::ServiceExt;

/// Serializes env mutation — parallel tests would race on `OPENATLAS_API_KEY`.
static ENV_LOCK: Mutex<()> = Mutex::new(());

#[allow(clippy::await_holding_lock)]
async fn with_env<F, Fut>(key: &str, value: Option<&str>, f: F)
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    // Lock must be held across the await to prevent other test binaries
    // (running in parallel) from modifying the same env var.
    let _guard = ENV_LOCK.lock().expect("env lock");
    let prior = std::env::var(key).ok();
    match value {
        Some(v) => unsafe { std::env::set_var(key, v) },
        None => unsafe { std::env::remove_var(key) },
    }
    f().await;
    match prior {
        Some(v) => unsafe { std::env::set_var(key, v) },
        None => unsafe { std::env::remove_var(key) },
    }
}

#[tokio::test]
async fn put_poll_intervals_allowed_on_loopback_without_api_key() {
    with_env("OPENATLAS_API_KEY", None, || async {
        let app = common::test_router(IngestMode::Live).await;
        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .method("PUT")
                    .uri("/feeds/poll-intervals")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"intervals":{"usgs":300}}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
    })
    .await;
}

#[tokio::test]
async fn put_poll_intervals_requires_key_when_api_key_env_set() {
    with_env("OPENATLAS_API_KEY", Some("test-secret-key"), || async {
        let app = common::test_router(IngestMode::Live).await;
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method("PUT")
                    .uri("/feeds/poll-intervals")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"intervals":{"usgs":300}}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::UNAUTHORIZED);

        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .method("PUT")
                    .uri("/feeds/poll-intervals")
                    .header("content-type", "application/json")
                    .header(auth::ADMIN_KEY_HEADER, "test-secret-key")
                    .body(Body::from(r#"{"intervals":{"usgs":300}}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
    })
    .await;
}

#[tokio::test]
async fn non_loopback_bind_requires_api_key_env() {
    with_env("OPENATLAS_API_KEY", None, || async {
        let mut state = common::test_state();
        state.bind_addr = "0.0.0.0:8080".parse().expect("parse");
        let app = openatlas_ingest::routes::router(state);
        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .method("PUT")
                    .uri("/feeds/poll-intervals")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"intervals":{"usgs":300}}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::FORBIDDEN);
    })
    .await;
}
