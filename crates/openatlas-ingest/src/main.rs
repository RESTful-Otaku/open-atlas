//! OpenAtlas ingest service entrypoint.
//!
//! The ingest service is a thin *pusher*: it polls live open-data feeds
//! and runs simulators, converts each event into a canonical shape, and
//! pushes it into SpacetimeDB by invoking the `ingest_event` reducer.
//! SpacetimeDB is the single source of truth; the browser subscribes to
//! it directly via the TypeScript SDK, so this service never needs to
//! serve events, signals, or state over HTTP.
//!
//! # Module map
//! * [`state`]: shared runtime handle passed to every task (stdb client + health).
//! * [`stdb`]: typed HTTP client for SpacetimeDB reducer calls.
//! * [`health`]: per-feed health tracking and `/status` DTO.
//! * [`simulator`]: synthetic event generators.
//! * [`feeds`]: live open-data feed adapters (one provider per file).
//! * [`routes`]: minimal axum surface (`/health`, `/ready`, `/status`, static fallback).

mod feeds;
mod health;
mod routes;
mod simulator;
mod state;
mod stdb;

use std::{collections::HashMap, net::SocketAddr, sync::Arc};

use anyhow::Context;
use chrono::Utc;
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::{
    health::initialize_feed_runtime, routes::router, simulator::spawn_simulators, state::AppState,
    stdb::StdbClient,
};

/// Bind address. Keeping this as a `const` makes deployment profiles easy
/// to inspect; override via reverse proxy rather than env.
const BIND_ADDR: &str = "0.0.0.0:8080";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_tracing();

    let stdb = StdbClient::from_env().context("failed to construct SpacetimeDB client")?;
    info!(
        stdb_uri = stdb.uri(),
        stdb_database = stdb.database(),
        "configured SpacetimeDB target"
    );
    if !stdb.is_reachable().await {
        warn!(
            uri = stdb.uri(),
            "SpacetimeDB is not reachable yet; ingest will start anyway and retry per-event"
        );
    }

    let feed_runtime = Arc::new(RwLock::new(HashMap::new()));
    let state = AppState {
        started_at: Utc::now(),
        feed_runtime,
        stdb,
    };

    initialize_feed_runtime(&state).await;
    spawn_simulators(state.clone());
    feeds::spawn_all(state.clone());

    let app = router(state);
    let addr: SocketAddr = BIND_ADDR.parse().context("invalid bind address")?;
    info!("openatlas-ingest listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .context("bind failed")?;
    axum::serve(listener, app).await.context("server failed")
}

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "openatlas_ingest=info,info".to_owned()),
        )
        .compact()
        .init();
}
