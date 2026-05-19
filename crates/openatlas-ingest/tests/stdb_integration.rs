//! Optional integration tests against a running SpacetimeDB instance.
//!
//! Run with: `OPENATLAS_STDB_INTEGRATION=1 cargo test -p openatlas-ingest --test stdb_integration -- --ignored`

mod common;

use axum::body::Body;
use openatlas_ingest::ingest_mode::IngestMode;
use tower::ServiceExt;

fn integration_enabled() -> bool {
    std::env::var("OPENATLAS_STDB_INTEGRATION")
        .ok()
        .is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"))
}

#[tokio::test]
#[ignore = "requires SpacetimeDB at OPENATLAS_STDB_URI (default http://127.0.0.1:3000)"]
async fn ready_reflects_stdb_reachability() {
    if !integration_enabled() {
        eprintln!("skip: set OPENATLAS_STDB_INTEGRATION=1 to run");
        return;
    }
    let app = common::test_router(IngestMode::Hybrid).await;
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/ready")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    if status == axum::http::StatusCode::OK {
        assert_eq!(json["ready"], true);
    } else {
        assert_eq!(json["ready"], false);
        assert!(json["stdb_uri"].is_string());
    }
}
