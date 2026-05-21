//! OpenSky OAuth2 client credentials (Bearer token on REST calls).
//!
//! See <https://openskynetwork.github.io/opensky-api/rest.html#authentication>.

use std::{
    sync::OnceLock,
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use reqwest::Client;
use serde::Deserialize;
use tokio::sync::Mutex;

pub const ENV_CLIENT_ID: &str = "OPENSKY_CLIENT_ID";
pub const ENV_CLIENT_SECRET: &str = "OPENSKY_CLIENT_SECRET";

const TOKEN_URL: &str =
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const TOKEN_REFRESH_MARGIN: Duration = Duration::from_secs(30);

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

struct CachedToken {
    access_token: String,
    expires_at: Instant,
}

static TOKEN_CACHE: OnceLock<Mutex<Option<CachedToken>>> = OnceLock::new();

fn token_cache() -> &'static Mutex<Option<CachedToken>> {
    TOKEN_CACHE.get_or_init(|| Mutex::new(None))
}

/// Both env vars set and non-empty.
pub fn client_credentials_from_env() -> Option<(String, String)> {
    let id = std::env::var(ENV_CLIENT_ID).ok()?;
    let secret = std::env::var(ENV_CLIENT_SECRET).ok()?;
    let id = id.trim();
    let secret = secret.trim();
    if id.is_empty() || secret.is_empty() {
        return None;
    }
    Some((id.to_owned(), secret.to_owned()))
}

pub async fn bearer_authorization(client: &Client) -> Result<Option<String>> {
    let Some((client_id, client_secret)) = client_credentials_from_env() else {
        return Ok(None);
    };

    {
        let cache = token_cache().lock().await;
        if let Some(entry) = cache.as_ref() {
            if Instant::now() < entry.expires_at {
                return Ok(Some(entry.access_token.clone()));
            }
        }
    }

    let token = fetch_token(client, &client_id, &client_secret).await?;
    let expires_in = token.expires_in.max(60);
    let expires_at = Instant::now()
        + Duration::from_secs(expires_in.saturating_sub(TOKEN_REFRESH_MARGIN.as_secs()));

    let mut cache = token_cache().lock().await;
    *cache = Some(CachedToken {
        access_token: token.access_token.clone(),
        expires_at,
    });

    Ok(Some(token.access_token))
}

async fn fetch_token(
    client: &Client,
    client_id: &str,
    client_secret: &str,
) -> Result<TokenResponse> {
    let response = client
        .post(TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&[
            ("grant_type", "client_credentials"),
            ("client_id", client_id),
            ("client_secret", client_secret),
        ])
        .send()
        .await
        .context("OpenSky token request failed")?;

    let status = response.status();
    let body = response
        .text()
        .await
        .context("OpenSky token response body read failed")?;

    if !status.is_success() {
        anyhow::bail!(
            "OpenSky token endpoint returned {status} — {}",
            body.chars().take(200).collect::<String>()
        );
    }

    serde_json::from_str(&body).context("OpenSky token JSON decode failed")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn env_pair_requires_both_keys() {
        // Without env in unit tests, returns None.
        assert!(client_credentials_from_env().is_none());
    }
}
