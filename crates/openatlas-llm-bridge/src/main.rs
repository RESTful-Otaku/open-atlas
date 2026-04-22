//! OpenAtlas LLM bridge — forwards **bounded** telemetry JSON from the
//! web UI to a self-hosted Ollama instance. This keeps
//! `openatlas-stdb-module` reducers strictly deterministic: no model
//! calls happen inside SpacetimeDB.
//!
//! ## Run (recommended stack)
//! - Install [Ollama](https://ollama.com/), then:
//!   `ollama serve`  (in one terminal)
//!   `ollama pull llama3.2`  (or e.g. `qwen2.5:7b`, `mistral:7b`)
//! - `cargo run -p openatlas-llm-bridge`
//! - In dev, Vite proxies `/api/llm/*` to this service (default :3847).
//!
//! The UI sends a size-capped JSON snapshot; the model is instructed to
//! ground answers only in that data.

use std::sync::Arc;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Json;
use clap::Parser;
use serde::Serialize;
use serde_json::Value;
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tracing::{error, info};

mod ollama;

const MAX_BODY: usize = 512 * 1024;
const MAX_JSON_CHARS: usize = 120_000;
const MAX_USER_PROMPT: usize = 4_000;

static SYSTEM_PROMPT: &str = r"You are a senior global risk and systems analyst for the OpenAtlas command dashboard.
Rules:
- Use ONLY the JSON telemetry in the user message. Do not invent events, numbers, or regions not present in the data.
- If the snapshot is empty or too sparse, say so briefly and list what data would help.
- Write in clear, accessible prose. Prefer short sections with headings: Summary, Cross-domain linkages, Notable stress points, Suggested follow-ups.
- Distinguish facts (from the data) from interpretation (your judgment).
- Do not claim secret or classified information.";

/// CLI for the local inference bridge. Defaults work with a stock Ollama install.
#[derive(Parser, Debug)]
#[command(name = "openatlas-llm-bridge", version)]
struct Args {
    /// Listen address (HTTP).
    #[arg(long, default_value = "127.0.0.1:3847", env = "OPENATLAS_LLM_LISTEN")]
    listen: String,
    /// Ollama base URL (no path).
    #[arg(
        long,
        default_value = "http://127.0.0.1:11434",
        env = "OPENATLAS_OLLAMA_BASE"
    )]
    ollama_base: String,
    /// Model name as known to Ollama (after `ollama pull`).
    #[arg(long, default_value = "llama3.2", env = "OPENATLAS_OLLAMA_MODEL")]
    ollama_model: String,
    /// Upstream request timeout in seconds.
    #[arg(long, default_value = "300", env = "OPENATLAS_OLLAMA_TIMEOUT_SECS")]
    ollama_timeout_secs: u64,
}

struct AppState {
    http: reqwest::Client,
    ollama_base: String,
    model: String,
    timeout_secs: u64,
}

#[derive(serde::Deserialize)]
struct InsightRequest {
    /// Structured dashboard snapshot (JSON object or array from the UI).
    snapshot: Value,
    /// Optional operator follow-up.
    user_prompt: Option<String>,
}

#[derive(Serialize)]
struct InsightResponse {
    text: String,
    model: String,
    ollama_base: String,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()))
        .init();
    let args = Args::parse();
    let http = reqwest::Client::builder()
        .user_agent(concat!("openatlas-llm-bridge/", env!("CARGO_PKG_VERSION")))
        .build()?;

    let state = Arc::new(AppState {
        http,
        ollama_base: args.ollama_base.clone(),
        model: args.ollama_model.clone(),
        timeout_secs: args.ollama_timeout_secs,
    });

    let app = axum::Router::new()
        .route("/health", get(health))
        .route("/v1/ready", get(ready))
        .route(
            "/v1/insight",
            axum::routing::post(insight).layer(RequestBodyLimitLayer::new(MAX_BODY)),
        )
        .with_state(state)
        .layer(
            CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any),
        );

    let listener = tokio::net::TcpListener::bind(&args.listen).await?;
    info!(
        "openatlas-llm-bridge listening on http://{}  (Ollama: {} model {})",
        args.listen, args.ollama_base, args.ollama_model
    );
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true, "service": "openatlas-llm-bridge" }))
}

async fn ready(State(s): State<Arc<AppState>>) -> impl IntoResponse {
    match ollama::ping_ollama(&s.http, &s.ollama_base, 5).await {
        Ok(()) => (StatusCode::OK, "ollama reachable").into_response(),
        Err(e) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
}

async fn insight(
    State(s): State<Arc<AppState>>,
    Json(body): Json<InsightRequest>,
) -> impl IntoResponse {
    let snapshot_str = match serde_json::to_string_pretty(&body.snapshot) {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
                .into_response();
        }
    };
    let snapshot_limited = truncate_chars(&snapshot_str, MAX_JSON_CHARS);
    let user_extra = body
        .user_prompt
        .as_deref()
        .map(|p| truncate_chars(p, MAX_USER_PROMPT))
        .filter(|p| !p.is_empty());
    let user_content = if let Some(p) = user_extra {
        format!(
            "TELEMETRY_JSON:\n{}\n\nOPERATOR_REQUEST:\n{}",
            snapshot_limited, p
        )
    } else {
        format!("TELEMETRY_JSON:\n{}", snapshot_limited)
    };
    let text = match ollama::chat_completion(
        &s.http,
        &s.ollama_base,
        &s.model,
        SYSTEM_PROMPT,
        &user_content,
        s.timeout_secs,
    )
    .await
    {
        Ok(t) => t,
        Err(e) => {
            error!("ollama chat_completion: {e:#}");
            return (
                StatusCode::BAD_GATEWAY,
                Json(ErrorResponse {
                    error: format!("ollama: {e}"),
                }),
            )
                .into_response();
        }
    };
    (
        StatusCode::OK,
        Json(InsightResponse {
            text,
            model: s.model.clone(),
            ollama_base: s.ollama_base.clone(),
        }),
    )
        .into_response()
}

fn truncate_chars(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    s.chars().take(max).collect()
}
