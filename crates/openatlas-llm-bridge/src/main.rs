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

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Json;
use clap::Parser;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::timeout::TimeoutLayer;
use tracing::{error, info, warn};

mod ollama;

const MAX_BODY: usize = 512 * 1024;
const MAX_JSON_CHARS: usize = 120_000;
const MAX_USER_PROMPT: usize = 4_000;

/// Consecutive Ollama failures before the circuit breaker opens.
const CB_THRESHOLD: u64 = 3;
/// Seconds to stay open before allowing a probe.
const CB_OPEN_SECS: u64 = 30;
/// Max seconds for any single Axum request (margin over Ollama timeout).
const AXUM_TIMEOUT_SECS: u64 = 130;

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
    /// Upstream request timeout in seconds (raise for slow CPU models).
    #[arg(long, default_value = "120", env = "OPENATLAS_OLLAMA_TIMEOUT_SECS")]
    ollama_timeout_secs: u64,
}

struct CircuitState {
    /// Consecutive /v1/insight failures.
    consecutive_failures: AtomicU64,
    /// Timestamp (std::time::Instant ticks) when circuit was opened.
    opened_at: AtomicU64,
}

impl CircuitState {
    fn new() -> Self {
        Self {
            consecutive_failures: AtomicU64::new(0),
            opened_at: AtomicU64::new(0),
        }
    }

    fn record_success(&self) {
        self.consecutive_failures.store(0, Ordering::SeqCst);
        self.opened_at.store(0, Ordering::SeqCst);
    }

    fn record_failure(&self) -> bool {
        if self.is_open() {
            return false;
        }
        let prev = self.consecutive_failures.fetch_add(1, Ordering::SeqCst);
        let now = prev + 1;
        if now >= CB_THRESHOLD {
            self.opened_at.store(now_ticks(), Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    fn is_open(&self) -> bool {
        let failures = self.consecutive_failures.load(Ordering::SeqCst);
        if failures < CB_THRESHOLD {
            return false;
        }
        let opened = self.opened_at.load(Ordering::SeqCst);
        if opened == 0 {
            return false;
        }
        let elapsed = now_ticks().saturating_sub(opened);
        if elapsed >= CB_OPEN_SECS * 1000 {
            self.consecutive_failures.store(CB_THRESHOLD - 1, Ordering::SeqCst);
            return false;
        }
        true
    }
}

fn now_ticks() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

struct AppState {
    http: reqwest::Client,
    ollama_base: String,
    model: String,
    timeout_secs: u64,
    circuit: CircuitState,
}

#[derive(Deserialize)]
struct InsightRequest {
    snapshot: Value,
    user_prompt: Option<String>,
    #[serde(default)]
    cpu_only: bool,
}

#[derive(Serialize)]
struct InsightResponse {
    text: String,
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
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()?;

    let state = Arc::new(AppState {
        http,
        ollama_base: args.ollama_base.clone(),
        model: args.ollama_model.clone(),
        timeout_secs: args.ollama_timeout_secs,
        circuit: CircuitState::new(),
    });

    let app = axum::Router::new()
        .route("/health", get(health))
        .route("/v1/ready", get(ready))
        .route("/v1/capable", get(capable))
        .route(
            "/v1/insight",
            axum::routing::post(insight).layer(RequestBodyLimitLayer::new(MAX_BODY)),
        )
        .with_state(state)
        .layer(TimeoutLayer::with_status_code(
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Duration::from_secs(AXUM_TIMEOUT_SECS),
        ))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([axum::http::Method::GET, axum::http::Method::POST, axum::http::Method::OPTIONS])
                .allow_headers([axum::http::header::CONTENT_TYPE, axum::http::header::AUTHORIZATION]),
        );

    let listener = tokio::net::TcpListener::bind(&args.listen).await?;
    info!(
        "openatlas-llm-bridge listening on http://{}  (Ollama: {} model {})",
        args.listen, args.ollama_base, args.ollama_model
    );
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            tokio::signal::ctrl_c()
                .await
                .expect("failed to install SIGINT handler");
            info!("received SIGINT — shutting down gracefully");
        })
        .await?;
    info!("openatlas-llm-bridge stopped");
    Ok(())
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true, "service": "openatlas-llm-bridge" }))
}

async fn ready(State(s): State<Arc<AppState>>) -> impl IntoResponse {
    match ollama::ping_ollama(&s.http, &s.ollama_base, 10).await {
        Ok(()) => (StatusCode::OK, "ollama reachable").into_response(),
        Err(e) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: sanitize_error(&e.to_string()),
            }),
        )
            .into_response(),
    }
}

/// Verifies the configured model can complete a tiny chat (catches CUDA / load failures).
async fn capable(State(s): State<Arc<AppState>>) -> impl IntoResponse {
    match ollama::chat_completion(
        &s.http,
        &s.ollama_base,
        &s.model,
        "Reply briefly.",
        "Say exactly: OK",
        s.timeout_secs.min(120),
        false,
    )
    .await
    {
        Ok(_) => (StatusCode::OK, "model inference ok").into_response(),
        Err(e) => {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ErrorResponse {
                    error: sanitize_error(&e.to_string()),
                }),
            )
                .into_response()
        }
    }
}

async fn insight(
    State(s): State<Arc<AppState>>,
    Json(body): Json<InsightRequest>,
) -> impl IntoResponse {
    if s.circuit.is_open() {
        warn!("circuit breaker open — rejecting /v1/insight (auto-recovery pending)");
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "LLM bridge circuit breaker is open after repeated failures — "
                    .to_string()
                    + &format!("retry in ~{}s (or check Ollama logs)", CB_OPEN_SECS),
            }),
        )
            .into_response();
    }

    if let Err(e) = check_json_depth(&body.snapshot, 64) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: e }),
        )
            .into_response();
    }

    let snapshot_str = match serde_json::to_string(&body.snapshot) {
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
        body.cpu_only,
    )
    .await
    {
        Ok(t) => {
            s.circuit.record_success();
            t
        }
        Err(e) => {
            let opened = s.circuit.record_failure();
            if opened {
                warn!(
                    consecutive = CB_THRESHOLD,
                    "circuit breaker opened after {CB_THRESHOLD} consecutive Ollama failures"
                );
            }
            error!("ollama chat_completion: {e:#}");
            return (
                StatusCode::BAD_GATEWAY,
                Json(ErrorResponse {
                    error: sanitize_error(&format!("ollama request failed: {e}")),
                }),
            )
                .into_response();
        }
    };
    (
        StatusCode::OK,
        Json(InsightResponse {
            text,
        }),
    )
        .into_response()
}

fn check_json_depth(value: &serde_json::Value, max_depth: usize) -> Result<(), String> {
    fn recurse(v: &serde_json::Value, depth: usize, max: usize) -> Result<(), String> {
        if depth > max {
            return Err(format!("JSON exceeds maximum nesting depth of {max}"));
        }
        match v {
            serde_json::Value::Array(arr) => {
                for item in arr {
                    recurse(item, depth + 1, max)?;
                }
            }
            serde_json::Value::Object(obj) => {
                for v in obj.values() {
                    recurse(v, depth + 1, max)?;
                }
            }
            _ => {}
        }
        Ok(())
    }
    recurse(value, 0, max_depth)
}

fn sanitize_error(msg: &str) -> String {
    let cleaned: String = msg
        .lines()
        .filter(|l| !l.contains("http://") && !l.contains("https://"))
        .collect::<Vec<_>>()
        .join("\n");
    if cleaned.is_empty() {
        "LLM request failed (details logged server-side)".to_string()
    } else {
        cleaned
    }
}

fn truncate_chars(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    s.chars().take(max).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── truncate_chars ──

    #[test]
    fn truncate_chars_limits_by_char_count() {
        let s = "a".repeat(10);
        assert_eq!(truncate_chars(&s, 5).len(), 5);
        assert_eq!(truncate_chars(&s, 20), s);
    }

    #[test]
    fn truncate_chars_handles_empty() {
        assert_eq!(truncate_chars("", 5), "");
    }

    #[test]
    fn truncate_chars_preserves_unicode_boundary() {
        let s = "🦀🔥💧";
        let truncated = truncate_chars(s, 2);
        assert_eq!(truncated.chars().count(), 2);
    }

    #[test]
    fn truncate_chars_exact_boundary() {
        let s = "hello";
        assert_eq!(truncate_chars(s, 5), "hello");
    }

    // ── CircuitState ──

    #[test]
    fn circuit_starts_closed() {
        let c = CircuitState::new();
        assert!(!c.is_open());
        assert_eq!(c.consecutive_failures.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn single_failure_does_not_open_circuit() {
        let c = CircuitState::new();
        let opened = c.record_failure();
        assert!(!opened);
        assert!(!c.is_open());
    }

    #[test]
    fn threshold_failures_open_circuit() {
        let c = CircuitState::new();
        for _ in 0..CB_THRESHOLD - 1 {
            c.record_failure();
        }
        let opened = c.record_failure();
        assert!(opened);
        assert!(c.is_open());
    }

    #[test]
    fn success_closes_circuit() {
        let c = CircuitState::new();
        for _ in 0..CB_THRESHOLD {
            c.record_failure();
        }
        assert!(c.is_open());
        c.record_success();
        assert!(!c.is_open());
        assert_eq!(c.consecutive_failures.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn success_resets_opened_at() {
        let c = CircuitState::new();
        for _ in 0..CB_THRESHOLD {
            c.record_failure();
        }
        assert!(c.opened_at.load(Ordering::SeqCst) > 0);
        c.record_success();
        assert_eq!(c.opened_at.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn below_threshold_is_closed() {
        let c = CircuitState::new();
        for _ in 0..CB_THRESHOLD - 1 {
            c.record_failure();
        }
        assert!(!c.is_open());
    }

    #[test]
    fn record_failure_tracks_consecutive_count() {
        let c = CircuitState::new();
        c.record_failure();
        c.record_failure();
        assert_eq!(c.consecutive_failures.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn circuit_closes_after_recovery_duration() {
        let c = CircuitState::new();
        for _ in 0..CB_THRESHOLD {
            c.record_failure();
        }
        assert!(c.is_open());
        // Simulate CB_OPEN_SECS having elapsed by setting opened_at far in the past
        let past = now_ticks().saturating_sub(CB_OPEN_SECS * 1000 + 1);
        c.opened_at.store(past, Ordering::SeqCst);
        assert!(!c.is_open());
    }

    #[test]
    fn circuit_stays_open_before_recovery_duration() {
        let c = CircuitState::new();
        for _ in 0..CB_THRESHOLD {
            c.record_failure();
        }
        assert!(c.is_open());
        // Set opened_at just barely within the window
        let recent = now_ticks().saturating_sub(CB_OPEN_SECS * 1000 - 100);
        c.opened_at.store(recent, Ordering::SeqCst);
        assert!(c.is_open());
    }

    #[test]
    fn half_open_resets_failure_count_on_close() {
        let c = CircuitState::new();
        for _ in 0..CB_THRESHOLD {
            c.record_failure();
        }
        let past = now_ticks().saturating_sub(CB_OPEN_SECS * 1000 + 1);
        c.opened_at.store(past, Ordering::SeqCst);
        // is_open() transitions to half-open and resets counter to CB_THRESHOLD - 1
        assert!(!c.is_open());
        assert_eq!(
            c.consecutive_failures.load(Ordering::SeqCst),
            CB_THRESHOLD - 1
        );
    }

    #[test]
    fn opened_at_is_zero_before_first_failure() {
        let c = CircuitState::new();
        assert_eq!(c.opened_at.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn consecutive_failures_cleared_on_success() {
        let c = CircuitState::new();
        for _ in 0..CB_THRESHOLD {
            c.record_failure();
        }
        assert_eq!(c.consecutive_failures.load(Ordering::SeqCst), CB_THRESHOLD);
        c.record_success();
        assert_eq!(c.consecutive_failures.load(Ordering::SeqCst), 0);
    }

    // ── now_ticks ──

    #[test]
    fn now_ticks_is_monotonic() {
        let t1 = now_ticks();
        let t2 = now_ticks();
        assert!(t2 >= t1);
    }

    #[test]
    fn now_ticks_is_positive() {
        assert!(now_ticks() > 1_700_000_000_000);
    }

    #[test]
    fn now_ticks_precision_is_milliseconds() {
        let t1 = now_ticks();
        let d = std::time::Duration::from_millis(10);
        std::thread::sleep(d);
        let t2 = now_ticks();
        assert!(
            t2 >= t1 + 9,
            "expected ms precision: t1={t1} t2={t2} delta={}",
            t2 - t1
        );
    }
}
