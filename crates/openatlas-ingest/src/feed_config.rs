//! Operator-managed API keys for feed adapters (persisted on disk for dev).
//!
//! Feed keys live in `.dev/feed-secrets.json` by default (gitignored). General
//! config uses `.env` and `.dev/local.env` via `local_env`. See `docs/CONFIG.md`.
//! Keys from the secrets file override dotenv files when ingest starts.

use std::{collections::HashMap, fs, path::PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::feeds;

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
        // SAFETY: single-process ingest service; feeds read env on each fetch.
        unsafe { std::env::set_var(key, value) };
    }
}

pub fn env_key_present(key: &str) -> bool {
    std::env::var(key)
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
}

pub fn mask_secret(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.len() <= 4 {
        return "••••".to_owned();
    }
    let tail: String = trimmed.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("••••{tail}")
}

pub fn known_secret_keys() -> Vec<&'static str> {
    let mut keys: Vec<&'static str> = feeds::REGISTRY
        .iter()
        .filter_map(|d| d.requires_env)
        .collect();
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
        _ => "API key for this feed",
    }
}

pub fn validate_secret_keys(updates: &HashMap<String, String>) -> Result<()> {
    let allowed = known_secret_keys();
    for key in updates.keys() {
        if !allowed.contains(&key.as_str()) {
            let names = allowed.join(", ");
            anyhow::bail!("unknown secret key '{key}' — only feed API keys are accepted: {names}");
        }
    }
    Ok(())
}

pub fn merge_and_persist(mut current: FeedSecretsFile, updates: HashMap<String, String>) -> Result<FeedSecretsFile> {
    validate_secret_keys(&updates)?;
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
}
