use std::collections::HashMap;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::{
    auth,
    feed_config::{self, feed_label, known_secret_keys, mask_secret, FeedSecretsFile},
    feed_poll::{self, POLL_INTERVAL_OPTIONS_SECS},
    feeds::{self, descriptor_for},
    health::{record_feed_test, refresh_feed_enabled_flags, sync_poll_intervals_from_config},
    ingest_mode::ingest_mode,
    state::AppState,
};

#[derive(Debug, Serialize)]
pub struct FeedCatalogResponse {
    pub secrets_path: String,
    pub poll_config_path: String,
    pub retention_hours: u64,
    pub poll_interval_options_secs: Vec<u64>,
    pub ingest_mode: String,
    pub live_feeds_enabled: bool,
    pub feeds: Vec<FeedRow>,
    pub secret_fields: Vec<SecretFieldRow>,
}

#[derive(Debug, Serialize)]
pub struct FeedRow {
    pub name: String,
    pub label: String,
    pub source_url: String,
    pub poll_interval_secs: u64,
    pub default_poll_interval_secs: u64,
    pub last_events_accepted: u32,
    pub last_events_duplicate: u32,
    pub last_poll_at: Option<chrono::DateTime<Utc>>,
    pub next_poll_at: Option<chrono::DateTime<Utc>>,
    pub circuit_open: bool,
    pub requires_env: Option<String>,
    pub api_key_configured: bool,
    pub api_key_preview: Option<String>,
    pub enabled: bool,
    pub worker_running: bool,
    pub connection: String,
    pub success_count: u64,
    pub failure_count: u64,
    pub consecutive_failures: u32,
    pub last_success: Option<chrono::DateTime<Utc>>,
    pub last_error: Option<String>,
    pub next_retry_ms: Option<u64>,
    pub last_test_at: Option<chrono::DateTime<Utc>>,
    pub last_test_ok: Option<bool>,
    pub last_test_message: Option<String>,
    pub last_test_event_count: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct SecretFieldRow {
    pub env_key: String,
    pub description: String,
    pub configured: bool,
    pub preview: Option<String>,
    pub feeds: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSecretsRequest {
    pub secrets: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePollIntervalsRequest {
    pub intervals: HashMap<String, u64>,
}

#[derive(Debug, Serialize)]
pub struct FeedTestResponse {
    pub feed: String,
    pub ok: bool,
    pub event_count: usize,
    pub message: String,
    pub duration_ms: u64,
}

#[derive(Debug, Serialize)]
pub struct ErrorBody {
    pub error: String,
}

pub async fn list_feeds(State(state): State<AppState>) -> impl IntoResponse {
    let mode = ingest_mode();
    let runtime = state.feed_runtime.read().await;
    let file = feed_config::load_secrets_file();

    let mut feeds = Vec::with_capacity(feeds::REGISTRY.len());
    for descriptor in feeds::REGISTRY {
        let health = runtime.get(descriptor.name);
        let requires_env = descriptor.requires_env.map(str::to_owned);
        let api_key_configured = requires_env
            .as_ref()
            .is_none_or(|key| feed_config::env_key_present(key))
            || (descriptor.name == "opensky" && feed_config::opensky_oauth_configured());
        let preview = if descriptor.name == "opensky" && feed_config::opensky_oauth_configured() {
            file.secrets
                .get("OPENSKY_CLIENT_ID")
                .filter(|v| !v.is_empty())
                .map(|v| mask_secret(v))
                .map(|p| format!("OAuth {p}"))
        } else {
            requires_env.as_ref().and_then(|key| {
                file.secrets
                    .get(key)
                    .filter(|v| !v.is_empty())
                    .map(|v| mask_secret(v))
            })
        };

        let (enabled, worker_running, success_count, failure_count, consecutive_failures) = health
            .map(|h| {
                (
                    h.enabled,
                    h.worker_running,
                    h.success_count,
                    h.failure_count,
                    h.consecutive_failures,
                )
            })
            .unwrap_or((false, false, 0, 0, 0));

        let connection = connection_status(
            mode.live_feeds_enabled(),
            api_key_configured,
            enabled,
            health,
        );

        let default_poll = feed_poll::default_interval_secs(descriptor);
        let poll_secs = health
            .map(|h| h.poll_interval_secs)
            .unwrap_or_else(|| feed_poll::effective_interval_secs(descriptor.name, default_poll));

        feeds.push(FeedRow {
            name: descriptor.name.to_owned(),
            label: feed_label(descriptor.name).to_owned(),
            source_url: descriptor.source_url.to_owned(),
            poll_interval_secs: poll_secs,
            default_poll_interval_secs: default_poll,
            last_events_accepted: health.map(|h| h.last_events_accepted).unwrap_or(0),
            last_events_duplicate: health.map(|h| h.last_events_duplicate).unwrap_or(0),
            last_poll_at: health.and_then(|h| h.last_poll_at),
            next_poll_at: health.and_then(|h| h.next_poll_at),
            circuit_open: health.map(|h| h.circuit_open).unwrap_or(false),
            requires_env,
            api_key_configured,
            api_key_preview: preview,
            enabled,
            worker_running,
            connection: connection.to_owned(),
            success_count,
            failure_count,
            consecutive_failures,
            last_success: health.and_then(|h| h.last_success),
            last_error: health.and_then(|h| h.last_error.clone()),
            next_retry_ms: health.and_then(|h| h.next_retry_ms),
            last_test_at: health.and_then(|h| h.last_test_at),
            last_test_ok: health.and_then(|h| h.last_test_ok),
            last_test_message: health.and_then(|h| h.last_test_message.clone()),
            last_test_event_count: health.and_then(|h| h.last_test_event_count),
        });
    }

    let secret_fields = build_secret_fields(&file, &runtime);

    Json(FeedCatalogResponse {
        secrets_path: feed_config::secrets_file_display(),
        poll_config_path: feed_poll::poll_config_display(),
        retention_hours: feed_poll::DEFAULT_RETENTION_HOURS,
        poll_interval_options_secs: POLL_INTERVAL_OPTIONS_SECS.to_vec(),
        ingest_mode: mode.to_string(),
        live_feeds_enabled: mode.live_feeds_enabled(),
        feeds,
        secret_fields,
    })
}

fn build_secret_fields(
    file: &FeedSecretsFile,
    runtime: &HashMap<String, crate::health::FeedHealth>,
) -> Vec<SecretFieldRow> {
    let mut rows = Vec::new();
    for key in known_secret_keys() {
        let value = file
            .secrets
            .get(key)
            .cloned()
            .or_else(|| std::env::var(key).ok());
        let configured = value.as_ref().is_some_and(|v| !v.trim().is_empty());
        let preview = value
            .as_ref()
            .filter(|v| !v.is_empty())
            .map(|v| mask_secret(v));
        let linked = feed_config::feeds_for_secret_key(key);
        rows.push(SecretFieldRow {
            env_key: key.to_owned(),
            description: feed_config::env_key_description(key).to_owned(),
            configured,
            preview,
            feeds: linked,
        });
    }
    let _ = runtime;
    rows
}

fn connection_status(
    live_feeds_enabled: bool,
    api_key_configured: bool,
    enabled: bool,
    health: Option<&crate::health::FeedHealth>,
) -> &'static str {
    if !live_feeds_enabled {
        return "mode_off";
    }
    if !api_key_configured {
        return "needs_key";
    }
    if !enabled {
        return "disabled";
    }
    let Some(h) = health else {
        return "idle";
    };
    if h.last_test_ok == Some(false) {
        return "test_failed";
    }
    if h.circuit_open {
        return "circuit_open";
    }
    if h.consecutive_failures > 0 && h.last_success.is_none() {
        return "error";
    }
    if h.consecutive_failures > 0 {
        return "degraded";
    }
    if h.success_count > 0 || h.last_success.is_some() {
        return "ok";
    }
    if h.worker_running {
        return "starting";
    }
    "idle"
}

pub async fn update_poll_intervals(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<UpdatePollIntervalsRequest>,
) -> impl IntoResponse {
    if let Err(resp) = auth::check_admin_auth(&headers, &state.bind_addr) {
        return resp;
    }
    let current = feed_poll::load_poll_config();
    match feed_poll::merge_and_persist(current, body.intervals) {
        Ok(_) => {
            sync_poll_intervals_from_config(&state).await;
            list_feeds(State(state)).await.into_response()
        }
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(ErrorBody {
                error: error.to_string(),
            }),
        )
            .into_response(),
    }
}

pub async fn update_secrets(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<UpdateSecretsRequest>,
) -> impl IntoResponse {
    if let Err(resp) = auth::check_admin_auth(&headers, &state.bind_addr) {
        return resp;
    }
    let current = feed_config::load_secrets_file();
    match feed_config::merge_and_persist(current, body.secrets) {
        Ok(_) => {
            refresh_feed_enabled_flags(&state).await;
            for descriptor in feeds::REGISTRY {
                if descriptor
                    .requires_env
                    .is_some_and(feed_config::env_key_present)
                {
                    let _ = feeds::ensure_feed_worker(&state, descriptor.name).await;
                }
            }
            list_feeds(State(state)).await.into_response()
        }
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(ErrorBody {
                error: error.to_string(),
            }),
        )
            .into_response(),
    }
}

pub async fn test_feed(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if descriptor_for(&name).is_none() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorBody {
                error: format!("unknown feed: {name}"),
            }),
        )
            .into_response();
    }
    match feeds::test_feed_fetch(&state, &name).await {
        Ok(result) => {
            record_feed_test(
                &state,
                &name,
                result.ok,
                result.message.clone(),
                result.event_count,
            )
            .await;
            (
                StatusCode::OK,
                Json(FeedTestResponse {
                    feed: name,
                    ok: result.ok,
                    event_count: result.event_count,
                    message: result.message,
                    duration_ms: result.duration_ms,
                }),
            )
                .into_response()
        }
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(ErrorBody {
                error: error.to_string(),
            }),
        )
            .into_response(),
    }
}

pub async fn reconnect_feed(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if descriptor_for(&name).is_none() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorBody {
                error: format!("unknown feed: {name}"),
            }),
        )
            .into_response();
    }
    match feeds::reconnect_feed(&state, &name).await {
        Ok(result) => (
            StatusCode::OK,
            Json(FeedTestResponse {
                feed: name,
                ok: result.ok,
                event_count: result.event_count,
                message: result.message,
                duration_ms: result.duration_ms,
            }),
        )
            .into_response(),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(ErrorBody {
                error: error.to_string(),
            }),
        )
            .into_response(),
    }
}
