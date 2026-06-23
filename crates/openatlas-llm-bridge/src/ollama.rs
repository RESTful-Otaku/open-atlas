//! HTTP client for Ollama's OpenAI-compatible `/v1/chat/completions` endpoint.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tracing::warn;

const OPENAI_PATH: &str = "/v1/chat/completions";

const RETRY_BASE_MS: u64 = 500;
const RETRY_MAX_ATTEMPTS: usize = 3;

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<ChatOptions>,
    stream: bool,
}

#[derive(Serialize)]
struct ChatOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    num_gpu: Option<i32>,
}

#[derive(Serialize, Deserialize, Clone)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Option<Vec<Choice>>,
    error: Option<OllamaErrorBody>,
}

#[derive(Deserialize)]
struct Choice {
    message: Option<ChatMessage>,
}

#[derive(Deserialize)]
struct OllamaErrorBody {
    message: Option<String>,
}

pub fn cuda_incompatibility_hint(raw: &str) -> Option<String> {
    let lower = raw.to_lowercase();
    if !lower.contains("cuda error") && !lower.contains("architectural feature absent") {
        return None;
    }
    Some(
        "Ollama tried to use CUDA but this GPU/build combination is unsupported. \
         Restart Ollama in CPU-only mode: stop the running `ollama serve`, then run \
         `./scripts/ollama-serve-cpu.sh` (or `CUDA_VISIBLE_DEVICES=\"\" ollama serve`). \
         API `num_gpu: 0` alone does not fix this — the server process must be restarted."
            .to_string(),
    )
}

fn chat_options(cpu_only: bool) -> Option<ChatOptions> {
    if let Ok(v) = std::env::var("OPENATLAS_OLLAMA_NUM_GPU") {
        if let Ok(n) = v.parse::<i32>() {
            return Some(ChatOptions { num_gpu: Some(n) });
        }
    }
    if cpu_only {
        return Some(ChatOptions { num_gpu: Some(0) });
    }
    None
}

fn is_transient_error(e: &anyhow::Error) -> bool {
    let msg = e.to_string().to_lowercase();
    msg.contains("connection refused")
        || msg.contains("connection reset")
        || msg.contains("timeout")
        || msg.contains("timed out")
        || msg.contains("5xx")
        || msg.contains("service unavailable")
        || msg.contains("bad gateway")
        || msg.contains("broken pipe")
        || msg.contains("econnreset")
        || msg.contains("econnrefused")
}

/// Retries up to 3 times with exponential backoff on transient errors.
pub async fn chat_completion(
    client: &reqwest::Client,
    base: &str,
    model: &str,
    system: &str,
    user: &str,
    timeout_secs: u64,
    cpu_only: bool,
) -> anyhow::Result<String> {
    let url = format!("{}{}", base.trim_end_matches('/'), OPENAI_PATH);
    let body = ChatRequest {
        model: model.to_string(),
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: system.to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: user.to_string(),
            },
        ],
        temperature: Some(0.25),
        options: chat_options(cpu_only),
        stream: false,
    };

    let mut last_error: anyhow::Error = anyhow::anyhow!("no attempt made");
    for attempt in 0..RETRY_MAX_ATTEMPTS {
        if attempt > 0 {
            let delay = Duration::from_millis(RETRY_BASE_MS * (1 << (attempt - 1)));
            tokio::time::sleep(delay).await;
        }

        match chat_completion_attempt(client, &url, &body, timeout_secs).await {
            Ok(text) => return Ok(text),
            Err(e) => {
                last_error = e;
                if !is_transient_error(&last_error) {
                    break;
                }
                warn!(
                    attempt = attempt + 1,
                    max = RETRY_MAX_ATTEMPTS,
                    error = %last_error,
                    "chat_completion transient failure, retrying"
                );
            }
        }
    }
    Err(last_error)
}

async fn chat_completion_attempt(
    client: &reqwest::Client,
    url: &str,
    body: &ChatRequest,
    timeout_secs: u64,
) -> anyhow::Result<String> {
    let resp = client
        .post(url)
        .json(body)
        .timeout(Duration::from_secs(timeout_secs))
        .send()
        .await?;
    let status = resp.status();
    if !status.is_success() {
        let txt = resp.text().await.unwrap_or_default();
        if let Some(hint) = cuda_incompatibility_hint(&txt) {
            anyhow::bail!("ollama HTTP {}: {} — {}", status, txt, hint);
        }
        if status.as_u16() >= 500 {
            anyhow::bail!("ollama HTTP {}: {} (5xx transient)", status, txt);
        }
        anyhow::bail!("ollama HTTP {}: {}", status, txt);
    }
    let parsed: ChatResponse = resp.json().await?;
    if let Some(err) = parsed.error {
        let m = err
            .message
            .unwrap_or_else(|| "unknown ollama error".to_string());
        anyhow::bail!("ollama: {}", m);
    }
    let text = parsed
        .choices
        .as_ref()
        .and_then(|c| c.first())
        .and_then(|c| c.message.as_ref())
        .map(|m| m.content.clone())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| anyhow::anyhow!("ollama: empty response"))?;
    Ok(text)
}

pub async fn ping_ollama(
    client: &reqwest::Client,
    base: &str,
    timeout_secs: u64,
) -> anyhow::Result<()> {
    let url = format!("{}/api/tags", base.trim_end_matches('/'));
    let mut last_error: anyhow::Error = anyhow::anyhow!("no attempt made");
    for attempt in 0..2 {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        match client
            .get(&url)
            .timeout(Duration::from_secs(timeout_secs))
            .send()
            .await
        {
            Ok(resp) => {
                if let Err(e) = resp.error_for_status() {
                    last_error = e.into();
                    if attempt == 0 && is_transient_error(&last_error) {
                        continue;
                    }
                    return Err(last_error);
                }
                return Ok(());
            }
            Err(e) => {
                last_error = e.into();
                if !is_transient_error(&last_error) {
                    return Err(last_error);
                }
            }
        }
    }
    Err(last_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cuda_hint_detects_architecture_error() {
        let msg = r#"CUDA error: architectural feature absent from the device"#;
        assert!(cuda_incompatibility_hint(msg).is_some());
    }

    #[test]
    fn cuda_hint_ignores_unrelated_errors() {
        assert!(cuda_incompatibility_hint("connection refused").is_none());
    }

    #[test]
    fn cuda_hint_matches_case_insensitive() {
        let msg = "Cuda Error: out of memory";
        assert!(cuda_incompatibility_hint(msg).is_some());
    }

    #[test]
    fn cuda_hint_detects_architectural_feature_absent() {
        let msg = "Architectural feature absent from the device (CUDA)";
        assert!(cuda_incompatibility_hint(msg).is_some());
    }

    #[test]
    fn cuda_hint_returns_actionable_message() {
        let hint = cuda_incompatibility_hint("CUDA error").unwrap();
        assert!(hint.contains("CPU-only"));
        assert!(hint.contains("ollama serve"));
    }

    #[test]
    fn transient_connection_refused() {
        let e = anyhow::anyhow!("connection refused");
        assert!(is_transient_error(&e));
    }

    #[test]
    fn transient_connection_reset() {
        let e = anyhow::anyhow!("Connection reset by peer");
        assert!(is_transient_error(&e));
    }

    #[test]
    fn transient_timeout() {
        let e = anyhow::anyhow!("timeout: operation timed out after 30s");
        assert!(is_transient_error(&e));
    }

    #[test]
    fn transient_5xx() {
        let e = anyhow::anyhow!("HTTP 502 Bad Gateway");
        assert!(is_transient_error(&e));
    }

    #[test]
    fn transient_service_unavailable() {
        let e = anyhow::anyhow!("Service Unavailable");
        assert!(is_transient_error(&e));
    }

    #[test]
    fn transient_bad_gateway() {
        let e = anyhow::anyhow!("Bad Gateway upstream error");
        assert!(is_transient_error(&e));
    }

    #[test]
    fn transient_broken_pipe() {
        let e = anyhow::anyhow!("broken pipe: connection lost");
        assert!(is_transient_error(&e));
    }

    #[test]
    fn transient_econnreset() {
        let e = anyhow::anyhow!("econnreset (os error 104)");
        assert!(is_transient_error(&e));
    }

    #[test]
    fn transient_econnrefused() {
        let e = anyhow::anyhow!("econnrefused (os error 111)");
        assert!(is_transient_error(&e));
    }

    #[test]
    fn non_transient_4xx() {
        let e = anyhow::anyhow!("HTTP 400 Bad Request: invalid model name");
        assert!(!is_transient_error(&e));
    }

    #[test]
    fn non_transient_404() {
        let e = anyhow::anyhow!("HTTP 404 Not Found");
        assert!(!is_transient_error(&e));
    }

    #[test]
    fn non_transient_model_error() {
        let e = anyhow::anyhow!("model 'llama99' not found, try pulling it first");
        assert!(!is_transient_error(&e));
    }

    #[test]
    fn non_transient_empty_message() {
        let e = anyhow::anyhow!("");
        assert!(!is_transient_error(&e));
    }

    #[test]
    fn chat_options_cpu_only_returns_num_gpu_0() {
        let opts = chat_options(true);
        assert!(opts.is_some());
        assert_eq!(opts.unwrap().num_gpu, Some(0));
    }

    #[test]
    fn chat_options_not_cpu_only_returns_none_without_env() {
        let opts = chat_options(false);
        assert!(opts.is_none());
    }
}
