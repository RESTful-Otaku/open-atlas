use crate::rate_limit::{
    default_rate_limit_cooldown, global as rate_limiter, host_from_url, retry_after_duration,
};
use anyhow::{bail, Context, Result};
use reqwest::Client;
use reqwest::StatusCode;
use serde::de::DeserializeOwned;

fn sanitize_url(url: &str) -> String {
    url.split_once('?')
        .map(|(b, _)| b.to_owned())
        .unwrap_or_else(|| url.to_owned())
}

fn transport_error(url: &str, err: reqwest::Error) -> anyhow::Error {
    let safe = sanitize_url(url);
    if err.is_timeout() {
        anyhow::anyhow!(
            "GET {safe} timed out (upstream slow or unreachable — will retry on next poll)"
        )
    } else {
        anyhow::anyhow!("GET {safe} transport error: {err}")
    }
}

fn upstream_error_detail(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(msg) = value.get("error_message").and_then(|v| v.as_str()) {
            return format!(" — {msg}");
        }
        if let Some(msg) = value
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|v| v.as_str())
        {
            return format!(" — {msg}");
        }
    }
    let snippet: String = trimmed.chars().take(120).collect();
    if snippet.is_empty() {
        String::new()
    } else {
        format!(" — {snippet}")
    }
}

pub async fn fetch_json<T: DeserializeOwned>(client: &Client, feed: &str, url: &str) -> Result<T> {
    let text = fetch_text(client, feed, url).await?;
    serde_json::from_str(&text)
        .with_context(|| format!("JSON decode failed for {}", sanitize_url(url)))
}

pub async fn fetch_text(client: &Client, feed: &str, url: &str) -> Result<String> {
    fetch_text_with_request(client, feed, url, client.get(url)).await
}

pub async fn fetch_text_with_request(
    client: &Client,
    _feed: &str,
    url: &str,
    request: reqwest::RequestBuilder,
) -> Result<String> {
    if let Some(host) = host_from_url(url) {
        if let Some(limiter) = rate_limiter() {
            limiter.wait_and_record_host_request(&host).await;
        }

        let response = request
            .send()
            .await
            .map_err(|err| transport_error(url, err))?;

        let status = response.status();
        if status == StatusCode::TOO_MANY_REQUESTS {
            let retry_after = response
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_owned());
            let cooldown = retry_after
                .as_deref()
                .and_then(retry_after_duration)
                .unwrap_or_else(|| default_rate_limit_cooldown(&host));
            if let Some(limiter) = rate_limiter() {
                limiter.penalize_host(&host, cooldown).await;
            }
            bail!(
                "GET {} rate limited (HTTP 429){}",
                sanitize_url(url),
                retry_after
                    .as_ref()
                    .map(|s| format!(", retry-after: {s}"))
                    .unwrap_or_default()
            );
        }

        let body = if status.is_success() {
            response
                .text()
                .await
                .with_context(|| format!("GET {} body read failed", sanitize_url(url)))?
        } else {
            let body = response.text().await.unwrap_or_default();
            bail!(
                "GET {} returned {status}{}",
                sanitize_url(url),
                upstream_error_detail(&body)
            );
        };

        return Ok(body);
    }

    // Fallback without host-based throttle.
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| transport_error(url, err))?;
    let status = response.status();
    if status.is_success() {
        return response
            .text()
            .await
            .with_context(|| format!("GET {} body read failed", sanitize_url(url)));
    }
    let body = response.text().await.unwrap_or_default();
    bail!(
        "GET {} returned {status}{}",
        sanitize_url(url),
        upstream_error_detail(&body)
    );
}

pub fn parse_json_value(body: &str, context: &str) -> Result<serde_json::Value> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        bail!("{context}: empty response body");
    }
    if !trimmed.starts_with('{') && !trimmed.starts_with('[') {
        bail!(
            "{context}: response does not look like JSON (starts with {:?})",
            trimmed.chars().take(24).collect::<String>()
        );
    }
    serde_json::from_str(trimmed).with_context(|| format!("{context}: JSON parse failed"))
}

pub fn world_bank_observations(root: &serde_json::Value) -> Result<&[serde_json::Value]> {
    let arr = root
        .as_array()
        .context("world bank: expected top-level array")?;
    let obs = arr
        .get(1)
        .and_then(|v| v.as_array())
        .context("world bank: missing observations array at index 1")?;
    Ok(obs.as_slice())
}

pub fn fred_latest_observation(root: &serde_json::Value) -> Result<&serde_json::Value> {
    root.get("observations")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .context("fred: missing observations[0]")
}

pub fn eia_data_rows(root: &serde_json::Value) -> Result<&[serde_json::Value]> {
    root.get("response")
        .and_then(|v| v.get("data"))
        .and_then(|v| v.as_array())
        .map(|a| a.as_slice())
        .context("eia: missing response.data array")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_html() {
        assert!(parse_json_value("<html>", "test").is_err());
    }

    #[test]
    fn parses_wb_envelope() {
        let v = serde_json::json!([{"pages": 1}, [{"country": {"id": "US"}}]]);
        let obs = world_bank_observations(&v).unwrap();
        assert_eq!(obs.len(), 1);
    }

    #[test]
    fn upstream_error_detail_extracts_fred_message() {
        let body = r#"{"error_message":"Bad Request. invalid api_key"}"#;
        assert!(upstream_error_detail(body).contains("invalid api_key"));
    }
}
