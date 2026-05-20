//! OpenAtlas ingest service binary.

use std::{collections::HashMap, sync::Arc};

use anyhow::Context;
use chrono::Utc;
use openatlas_ingest::logging;
use openatlas_ingest::{
    auth, feed_config, feeds,
    fixtures::push_static_fixtures,
    health::initialize_feed_runtime,
    ingest_mode::{ingest_mode, IngestMode},
    local_env,
    metrics::IngestMetrics,
    rate_limit,
    routes::router,
    simulator::spawn_simulators,
    state::AppState,
    stdb::StdbClient,
};
use tokio::sync::RwLock;
use tracing::{info, warn};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    logging::init_tracing();

    // Load .env before StdbClient::from_env (local or cloud URI comes from here or the shell).
    local_env::load_gitignored_env_files();
    let env_files = local_env::env_file_paths();
    if !env_files.is_empty() {
        info!(files = ?env_files, "loaded local env files");
    }

    let secrets = feed_config::load_secrets_file();
    feed_config::apply_secrets_to_env(&secrets);

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
    info!(
        secrets_path = %feed_config::secrets_file_display(),
        keys = secrets.secrets.len(),
        "loaded feed API keys"
    );

    let rate_limiter = Arc::new(rate_limit::FeedRateLimiter::new());
    rate_limit::install(rate_limiter.clone());

    let bind_addr = auth::resolve_bind_addr().context("invalid OPENATLAS_BIND")?;

    let feed_runtime = Arc::new(RwLock::new(HashMap::new()));
    let spawned_feeds = Arc::new(RwLock::new(std::collections::HashSet::new()));
    let state = AppState {
        bind_addr,
        started_at: Utc::now(),
        feed_runtime,
        spawned_feeds,
        stdb,
        rate_limiter,
        metrics: Arc::new(IngestMetrics::default()),
    };

    let mode = ingest_mode();
    info!(ingest_mode = %mode, "ingest mode selected");
    initialize_feed_runtime(&state, mode).await;
    match mode {
        IngestMode::Static => push_static_fixtures(&state).await,
        _ if mode.simulators_enabled() => spawn_simulators(state.clone()),
        _ => {}
    }
    feeds::spawn_all(state.clone()).await;

    let app = router(state);
    info!(
        listen = %bind_addr,
        admin_auth = auth::mutations_require_auth(&bind_addr),
        "openatlas-ingest listening"
    );

    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .context("bind failed")?;
    axum::serve(listener, app).await.context("server failed")
}
