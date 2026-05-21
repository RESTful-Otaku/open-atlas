//! Optional cloud LLM proxy on the ingest HTTP surface (`/api/llm/v1/*`).
//!
//! SpacetimeDB modules cannot call external LLM APIs (determinism, no I/O).
//! When `OPENATLAS_CLOUD_GEMINI_API_KEY` (or `GEMINI_API_KEY`) is set, ingest
//! exposes the same paths as `openatlas-llm-bridge` so mobile/web can use
//! `VITE_LLM_BASE=https://your-ingest-host/api/llm` without a local PC.

use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use crate::state::{AppState, LlmProxyState};
use serde::Serialize;
use serde_json::Value;
use tracing::error;

const MAX_JSON_CHARS: usize = 120_000;
const MAX_USER_PROMPT: usize = 4_000;

static SYSTEM_PROMPT: &str = r"You are a senior global risk and systems analyst for the OpenAtlas command dashboard.
Rules:
- Use ONLY the JSON telemetry in the user message. Do not invent events, numbers, or regions not present in the data.
- If the snapshot is empty or too sparse, say so briefly and list what data would help.
- Write in clear, accessible prose. Prefer short sections with headings: Summary, Cross-domain linkages, Notable stress points, Suggested follow-ups.
- Distinguish facts (from the data) from interpretation (your judgment).
- Do not claim secret or classified information.";

pub fn gemini_api_key_from_env() -> Option<String> {
    std::env::var("OPENATLAS_CLOUD_GEMINI_API_KEY")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| std::env::var("GEMINI_API_KEY").ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn gemini_model_from_env() -> String {
    std::env::var("OPENATLAS_CLOUD_GEMINI_MODEL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "gemini-2.0-flash".to_string())
}

pub fn llm_proxy_enabled() -> bool {
    gemini_api_key_from_env().is_some()
}

pub fn new_llm_proxy_state() -> Option<LlmProxyState> {
    let api_key = gemini_api_key_from_env()?;
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .ok()?;
    Some(LlmProxyState {
        http,
        api_key: Arc::from(api_key.as_str()),
        model: Arc::from(gemini_model_from_env().as_str()),
    })
}

#[derive(serde::Deserialize)]
pub(crate) struct InsightRequest {
    snapshot: Value,
    user_prompt: Option<String>,
}

#[derive(Serialize)]
struct InsightResponse {
    text: String,
    model: String,
    ollama_base: String,
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

fn llm_from_app(state: &AppState) -> Result<Arc<LlmProxyState>, (StatusCode, Json<ErrorBody>)> {
    state.llm.clone().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        Json(ErrorBody {
            error: "cloud LLM proxy not configured (set OPENATLAS_CLOUD_GEMINI_API_KEY on ingest host)".into(),
        }),
    ))
}

pub async fn ready(State(state): State<AppState>) -> impl IntoResponse {
    let Ok(llm) = llm_from_app(&state) else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorBody {
                error: "cloud LLM proxy not configured".into(),
            }),
        )
            .into_response();
    };
    if llm.api_key.is_empty() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorBody {
                error: "cloud LLM proxy not configured".into(),
            }),
        )
            .into_response();
    }
    (StatusCode::OK, Json(serde_json::json!({ "ready": true, "provider": "gemini" }))).into_response()
}

pub async fn insight(
    State(state): State<AppState>,
    Json(req): Json<InsightRequest>,
) -> impl IntoResponse {
    let llm = match llm_from_app(&state) {
        Ok(l) => l,
        Err(e) => return e.into_response(),
    };
    let snapshot_str = match serde_json::to_string(&req.snapshot) {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorBody {
                    error: format!("invalid snapshot: {e}"),
                }),
            )
                .into_response();
        }
    };
    if snapshot_str.len() > MAX_JSON_CHARS {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(ErrorBody {
                error: format!("snapshot exceeds {MAX_JSON_CHARS} chars"),
            }),
        )
            .into_response();
    }
    let user_prompt = req.user_prompt.unwrap_or_default();
    if user_prompt.len() > MAX_USER_PROMPT {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(ErrorBody {
                error: format!("user_prompt exceeds {MAX_USER_PROMPT} chars"),
            }),
        )
            .into_response();
    }

    let user_text = if user_prompt.trim().is_empty() {
        format!("Snapshot JSON:\n{snapshot_str}")
    } else {
        format!("{}\n\nSnapshot JSON:\n{snapshot_str}", user_prompt.trim())
    };

    let model_id = llm.model.to_string();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent"
    );

    let body = serde_json::json!({
        "contents": [{
            "role": "user",
            "parts": [{ "text": format!("{SYSTEM_PROMPT}\n\n{user_text}") }]
        }],
        "generationConfig": { "temperature": 0.35, "maxOutputTokens": 2048 }
    });

    let r = match llm
        .http
        .post(&url)
        .query(&[("key", llm.api_key.as_ref())])
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            error!(error = %e, "gemini request failed");
            return (
                StatusCode::BAD_GATEWAY,
                Json(ErrorBody {
                    error: format!("gemini request failed: {e}"),
                }),
            )
                .into_response();
        }
    };

    let status = r.status();
    let text = r.text().await.unwrap_or_default();
    if !status.is_success() {
        return (
            StatusCode::BAD_GATEWAY,
            Json(ErrorBody {
                error: format!("gemini API {}: {text}", status.as_u16()),
            }),
        )
            .into_response();
    }

    let parsed: Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(ErrorBody {
                    error: format!("gemini response parse error: {e}"),
                }),
            )
                .into_response();
        }
    };

    let out = parsed["candidates"][0]["content"]["parts"]
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter_map(|p| p["text"].as_str())
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
        .trim()
        .to_string();

    if out.is_empty() {
        return (
            StatusCode::BAD_GATEWAY,
            Json(ErrorBody {
                error: "gemini returned empty text".into(),
            }),
        )
            .into_response();
    }

    (
        StatusCode::OK,
        Json(InsightResponse {
            text: out,
            model: model_id,
            ollama_base: "gemini-cloud-proxy".into(),
        }),
    )
        .into_response()
}

