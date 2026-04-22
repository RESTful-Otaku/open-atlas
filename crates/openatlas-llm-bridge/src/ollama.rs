//! HTTP client for [Ollama](https://ollama.com/)'s OpenAI-compatible API
//! (`/v1/chat/completions`). Run `ollama serve` and `ollama pull
//! llama3.2` (or any open model) before using this bridge.

use serde::{Deserialize, Serialize};

const OPENAI_PATH: &str = "/v1/chat/completions";

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    stream: bool,
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

/// Call Ollama and return assistant text, or a structured error string.
pub async fn chat_completion(
    client: &reqwest::Client,
    base: &str,
    model: &str,
    system: &str,
    user: &str,
    timeout_secs: u64,
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
        // Lower temperature keeps summaries grounded in the supplied
        // telemetry rather than free-associating.
        temperature: Some(0.25),
        stream: false,
    };
    let resp = client
        .post(&url)
        .json(&body)
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .send()
        .await?;
    let status = resp.status();
    if !status.is_success() {
        let txt = resp.text().await.unwrap_or_default();
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

/// GET `/api/tags` is not OpenAI; use it for readiness. Returns `Ok` if
/// the server answers HTTP 2xx.
pub async fn ping_ollama(
    client: &reqwest::Client,
    base: &str,
    timeout_secs: u64,
) -> anyhow::Result<()> {
    let url = format!("{}/api/tags", base.trim_end_matches('/'));
    client
        .get(&url)
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}
