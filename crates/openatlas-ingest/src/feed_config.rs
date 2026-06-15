//! Operator-managed API keys for feed adapters (persisted on disk for dev).
//!
//! Feed keys live in `.dev/feed-secrets.json` by default (gitignored). General
//! config uses `.env` and `.dev/local.env` via `local_env`. See `docs/CONFIG.md`.
//! Keys from the secrets file override dotenv files when ingest starts.

use std::{collections::HashMap, fs, path::PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::feeds::{self, opensky_auth};

const DEFAULT_SECRETS_FILE: &str = ".dev/feed-secrets.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FeedSecretsFile {
    #[serde(flatten)]
    pub secrets: HashMap<String, String>,
}

pub fn secrets_path() -> PathBuf {
    std::env::var("OPENATLAS_FEED_SECRETS")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(DEFAULT_SECRETS_FILE))
}

pub fn load_secrets_file() -> FeedSecretsFile {
    let path = secrets_path();
    if !path.exists() {
        return FeedSecretsFile::default();
    }
    let raw = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return FeedSecretsFile::default(),
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save_secrets_file(file: &FeedSecretsFile) -> Result<()> {
    let path = secrets_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    let body = serde_json::to_string_pretty(file).context("serialize feed secrets")?;
    fs::write(&path, body).with_context(|| format!("write {}", path.display()))?;
    Ok(())
}

/// Apply stored secrets to the process environment (does not remove unset keys).
pub fn apply_secrets_to_env(file: &FeedSecretsFile) {
    for (key, value) in &file.secrets {
        if value.is_empty() {
            continue;
        }
        std::env::set_var(key, value);
    }
}

pub fn env_key_present(key: &str) -> bool {
    std::env::var(key)
        .ok()
        .is_some_and(|value| secret_value_valid(key, value.trim()).is_ok())
}

/// Validate a feed API key before persisting or treating a feed as enabled.
pub fn secret_value_valid(key: &str, value: &str) -> Result<()> {
    if value.is_empty() {
        anyhow::bail!("{key} must not be empty");
    }
    if is_placeholder_secret(value) {
        anyhow::bail!(
            "{key} looks like a placeholder — use a real key from {}",
            env_key_description(key)
        );
    }
    match key {
        "FRED_API_KEY" => validate_fred_key(value),
        "EIA_API_KEY" => validate_eia_key(value),
        opensky_auth::ENV_CLIENT_ID => validate_opensky_client_id(value),
        opensky_auth::ENV_CLIENT_SECRET => validate_opensky_client_secret(value),
        _ => Ok(()),
    }
}

fn validate_opensky_client_id(value: &str) -> Result<()> {
    if value.len() < 4 || value.len() > 128 {
        anyhow::bail!(
            "{} must be between 4 and 128 characters (from opensky-network.org account API client)",
            opensky_auth::ENV_CLIENT_ID
        );
    }
    Ok(())
}

fn validate_opensky_client_secret(value: &str) -> Result<()> {
    if value.len() < 8 {
        anyhow::bail!(
            "{} is too short — use the client secret from your OpenSky API client",
            opensky_auth::ENV_CLIENT_SECRET
        );
    }
    Ok(())
}

/// True when both OpenSky OAuth env vars are set (Settings / feed-secrets.json).
pub fn opensky_oauth_configured() -> bool {
    env_key_present(opensky_auth::ENV_CLIENT_ID) && env_key_present(opensky_auth::ENV_CLIENT_SECRET)
}

pub(crate) fn feeds_for_secret_key(key: &str) -> Vec<String> {
    feeds::REGISTRY
        .iter()
        .filter(|d| {
            d.requires_env == Some(key)
                || (d.name == "opensky"
                    && (key == opensky_auth::ENV_CLIENT_ID
                        || key == opensky_auth::ENV_CLIENT_SECRET))
        })
        .map(|d| d.name.to_owned())
        .collect()
}

fn is_placeholder_secret(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    const PLACEHOLDERS: &[&str] = &[
        "test-fred",
        "test-eia",
        "your-fred",
        "your-eia",
        "your-fred-key",
        "your-eia-key",
        "your_client",
        "your-client",
        "client_secret",
        "changeme",
        "example",
        "placeholder",
        "xxx",
    ];
    PLACEHOLDERS.iter().any(|p| lower.contains(p))
}

fn validate_fred_key(value: &str) -> Result<()> {
    let len = value.len();
    let alphanumeric = value.chars().all(|c| c.is_ascii_alphanumeric());
    if len == 32 && alphanumeric {
        return Ok(());
    }
    anyhow::bail!(
        "FRED_API_KEY must be a 32-character alphanumeric string (see fred.stlouisfed.org/docs/api/api_key.html)"
    );
}

fn validate_eia_key(value: &str) -> Result<()> {
    if value.len() < 20 {
        anyhow::bail!("EIA_API_KEY is too short — register at eia.gov/opendata/register.php");
    }
    if !value.chars().all(|c| c.is_ascii_alphanumeric()) {
        anyhow::bail!("EIA_API_KEY must contain only letters and digits");
    }
    Ok(())
}

pub fn mask_secret(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.len() <= 4 {
        return "••••".to_owned();
    }
    let tail: String = trimmed
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("••••{tail}")
}

pub fn known_secret_keys() -> Vec<&'static str> {
    let mut keys: Vec<&'static str> = feeds::REGISTRY
        .iter()
        .filter_map(|d| d.requires_env)
        .collect();
    keys.push(opensky_auth::ENV_CLIENT_ID);
    keys.push(opensky_auth::ENV_CLIENT_SECRET);
    keys.sort_unstable();
    keys.dedup();
    keys
}

pub fn feed_label(name: &str) -> &'static str {
    match name {
        "usgs" => "USGS Earthquakes",
        "open-meteo" => "Open-Meteo Weather",
        "coingecko" => "CoinGecko Markets",
        "nasa-eonet" => "NASA EONET Events",
        "opensky" => "OpenSky Aircraft",
        "gdelt" => "GDELT News",
        "world-bank" => "World Bank Indicators",
        "fred" => "FRED (St. Louis Fed)",
        "eia" => "EIA Energy Data",
        _ => "Unknown feed",
    }
}

pub fn env_key_description(key: &str) -> &'static str {
    match key {
        "FRED_API_KEY" => "Free API key from fred.stlouisfed.org/docs/api/api_key.html",
        "EIA_API_KEY" => "Free API key from eia.gov/opendata/register.php",
        k if k == opensky_auth::ENV_CLIENT_ID => {
            "OpenSky API client ID (OAuth2) — opensky-network.org → Account → API clients"
        }
        k if k == opensky_auth::ENV_CLIENT_SECRET => {
            "OpenSky API client secret — pair with OPENSKY_CLIENT_ID; higher rate limits than anonymous"
        }
        _ => "API key for this feed",
    }
}

pub fn validate_secret_keys(updates: &HashMap<String, String>) -> Result<()> {
    let allowed = known_secret_keys();
    for (key, value) in updates {
        if !allowed.contains(&key.as_str()) {
            let names = allowed.join(", ");
            anyhow::bail!("unknown secret key '{key}' — only feed API keys are accepted: {names}");
        }
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        secret_value_valid(key, trimmed)?;
    }
    Ok(())
}

pub fn merge_and_persist(
    mut current: FeedSecretsFile,
    updates: HashMap<String, String>,
) -> Result<FeedSecretsFile> {
    validate_secret_keys(&updates)?;
    validate_opensky_pair_after_merge(&current, &updates)?;
    for (key, value) in updates {
        if value.trim().is_empty() {
            current.secrets.remove(&key);
        } else {
            current.secrets.insert(key, value.trim().to_owned());
        }
    }
    save_secrets_file(&current)?;
    apply_secrets_to_env(&current);
    Ok(current)
}

pub fn secrets_file_display() -> String {
    secrets_path().display().to_string()
}

fn validate_opensky_pair_after_merge(
    current: &FeedSecretsFile,
    updates: &HashMap<String, String>,
) -> Result<()> {
    let id = updates
        .get(opensky_auth::ENV_CLIENT_ID)
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .or_else(|| current.secrets.get(opensky_auth::ENV_CLIENT_ID).cloned());
    let secret = updates
        .get(opensky_auth::ENV_CLIENT_SECRET)
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            current
                .secrets
                .get(opensky_auth::ENV_CLIENT_SECRET)
                .cloned()
        });
    let has_id = id.as_ref().is_some_and(|s| !s.is_empty());
    let has_secret = secret.as_ref().is_some_and(|s| !s.is_empty());
    if has_id ^ has_secret {
        anyhow::bail!(
            "OpenSky OAuth requires both {} and {} — set or clear both together",
            opensky_auth::ENV_CLIENT_ID,
            opensky_auth::ENV_CLIENT_SECRET
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mask_short_and_long_secrets() {
        assert_eq!(mask_secret("ab"), "••••");
        assert_eq!(mask_secret("abcdefgh"), "••••efgh");
    }

    #[test]
    fn rejects_unknown_secret_keys() {
        let mut bad = HashMap::new();
        bad.insert("PATH".to_owned(), "/tmp".to_owned());
        assert!(validate_secret_keys(&bad).is_err());
    }

    #[test]
    fn rejects_placeholder_and_invalid_fred_keys() {
        assert!(secret_value_valid("FRED_API_KEY", "test-fred").is_err());
        assert!(
            secret_value_valid("FRED_API_KEY", "your-fred-key-from-fred.stlouisfed.org").is_err()
        );
        assert!(secret_value_valid("FRED_API_KEY", "short").is_err());
        let valid = "a".repeat(32);
        assert!(secret_value_valid("FRED_API_KEY", &valid).is_ok());
    }

    #[test]
    fn rejects_short_eia_keys() {
        assert!(secret_value_valid("EIA_API_KEY", "test-eia").is_err());
        let valid = "a".repeat(32);
        assert!(secret_value_valid("EIA_API_KEY", &valid).is_ok());
    }

    #[test]
    fn accepts_opensky_oauth_keys() {
        assert!(
            secret_value_valid(opensky_auth::ENV_CLIENT_ID, "restful-otaku-api-client").is_ok()
        );
        let secret = "a".repeat(16);
        assert!(secret_value_valid(opensky_auth::ENV_CLIENT_SECRET, &secret).is_ok());
    }

    #[test]
    fn known_keys_include_opensky_oauth() {
        let keys = known_secret_keys();
        assert!(keys.contains(&opensky_auth::ENV_CLIENT_ID));
        assert!(keys.contains(&opensky_auth::ENV_CLIENT_SECRET));
    }
}
