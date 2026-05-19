//! Shared HTTP + JSON helpers for feed adapters.

use crate::rate_limit::{global as rate_limiter, host_from_url};
use anyhow::{bail, Context, Result};
use reqwest::Client;
use reqwest::StatusCode;
use serde::de::DeserializeOwned;

/// GET + status check + JSON body as `T`.
pub async fn fetch_json<T: DeserializeOwned>(client: &Client, feed: &str, url: &str) -> Result<T> {
    let text = fetch_text(client, feed, url).await?;
    serde_json::from_str(&text).with_context(|| format!("JSON decode failed for {url}"))
}

/// GET + status check; returns raw body text. Applies per-host throttling when the
/// global [`rate_limit::FeedRateLimiter`] is installed (normal ingest process).
pub async fn fetch_text(client: &Client, _feed: &str, url: &str) -> Result<String> {
    if let Some(host) = host_from_url(url) {
        if let Some(limiter) = rate_limiter() {
            limiter.wait_host_request(&host).await;
        }

        let response = client
            .get(url)
            .send()
            .await
            .with_context(|| format!("GET {url} transport error"))?;

        let status = response.status();
        if status == StatusCode::TOO_MANY_REQUESTS {
            let retry_after = response
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_owned());
            if let Some(limiter) = rate_limiter() {
                limiter.record_host_request(&host).await;
            }
            bail!(
                "GET {url} rate limited (HTTP 429){}",
                retry_after
                    .as_ref()
                    .map(|s| format!(", retry-after: {s}"))
                    .unwrap_or_default()
            );
        }

        let response = response
            .error_for_status()
            .with_context(|| format!("GET {url} returned error status"))?;
        let body = response
            .text()
            .await
            .with_context(|| format!("GET {url} body read failed"))?;

        if let Some(limiter) = rate_limiter() {
            limiter.record_host_request(&host).await;
        }

        return Ok(body);
    }

    // Fallback without host-based throttle (should not happen for https URLs).
    let response = client
        .get(url)
        .send()
        .await
        .with_context(|| format!("GET {url} transport error"))?
        .error_for_status()
        .with_context(|| format!("GET {url} returned error status"))?;
    response
        .text()
        .await
        .with_context(|| format!("GET {url} body read failed"))
}

/// Reject HTML error pages and empty bodies before `serde_json::from_str`.
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

/// World Bank v2 envelope: top-level `[metadata, observations]`.
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

/// FRED `series/observations` latest row.
pub fn fred_latest_observation(root: &serde_json::Value) -> Result<&serde_json::Value> {
    root.get("observations")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .context("fred: missing observations[0]")
}

/// EIA v2 `response.data` rows.
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
}
