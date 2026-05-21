//! Operator-configurable feed poll intervals (persisted on disk).
//!
//! Defaults come from each feed's `FeedDescriptor::poll_interval`. The UI may
//! override per feed using one of [`POLL_INTERVAL_OPTIONS_SECS`].

use std::{collections::HashMap, fs, path::PathBuf, time::Duration};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::feeds::{self, adapter::FeedDescriptor};

const DEFAULT_POLL_FILE: &str = ".dev/feed-poll.json";

/// Selectable poll cadences (Settings UI).
pub const POLL_INTERVAL_OPTIONS_SECS: &[u64] = &[30, 60, 300, 1800, 3600, 14_400];

pub const DEFAULT_RETENTION_HOURS: u64 = 24;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FeedPollConfigFile {
    #[serde(flatten)]
    pub intervals: HashMap<String, u64>,
}

pub fn poll_config_path() -> PathBuf {
    std::env::var("OPENATLAS_FEED_POLL_CONFIG")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(DEFAULT_POLL_FILE))
}

pub fn load_poll_config() -> FeedPollConfigFile {
    let path = poll_config_path();
    if !path.exists() {
        return FeedPollConfigFile::default();
    }
    let raw = fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save_poll_config(file: &FeedPollConfigFile) -> Result<()> {
    let path = poll_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    let body = serde_json::to_string_pretty(file).context("serialize feed poll config")?;
    fs::write(&path, body).with_context(|| format!("write {}", path.display()))?;
    Ok(())
}

pub fn poll_config_display() -> String {
    poll_config_path().display().to_string()
}

/// Provider-aware minimum interval (protects fragile APIs).
pub fn min_interval_secs(feed: &str) -> u64 {
    match feed {
        "gdelt" => 300,
        "opensky" => 900,
        "world-bank" | "eia" | "fred" => 300,
        "nasa-eonet" => 180,
        "coingecko" => 60,
        _ => 30,
    }
}

pub fn max_interval_secs(_feed: &str) -> u64 {
    14_400
}

pub(crate) fn default_interval_secs(descriptor: &FeedDescriptor) -> u64 {
    descriptor.poll_interval.as_secs().max(1)
}

pub fn effective_interval_secs(feed: &str, default: u64) -> u64 {
    let file = load_poll_config();
    let chosen = file.intervals.get(feed).copied().unwrap_or(default);
    chosen.clamp(min_interval_secs(feed), max_interval_secs(feed))
}

pub fn effective_interval(feed: &str, default: Duration) -> Duration {
    Duration::from_secs(effective_interval_secs(feed, default.as_secs()))
}

pub fn validate_poll_intervals(updates: &HashMap<String, u64>) -> Result<()> {
    for (feed, secs) in updates {
        let Some(descriptor) = feeds::descriptor_for(feed) else {
            anyhow::bail!("unknown feed '{feed}'");
        };
        if !POLL_INTERVAL_OPTIONS_SECS.contains(secs) {
            anyhow::bail!(
                "invalid poll interval {secs}s for {feed} — choose one of: {}",
                POLL_INTERVAL_OPTIONS_SECS
                    .iter()
                    .map(|s| s.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            );
        }
        let min = min_interval_secs(feed);
        let max = max_interval_secs(feed);
        if *secs < min || *secs > max {
            anyhow::bail!("poll interval {secs}s for {feed} out of range [{min}, {max}]");
        }
        let _ = descriptor;
    }
    Ok(())
}

pub fn merge_and_persist(
    mut current: FeedPollConfigFile,
    updates: HashMap<String, u64>,
) -> Result<FeedPollConfigFile> {
    validate_poll_intervals(&updates)?;
    for (feed, secs) in updates {
        let default = feeds::descriptor_for(&feed)
            .map(default_interval_secs)
            .unwrap_or(60);
        if secs == default {
            current.intervals.remove(&feed);
        } else {
            current.intervals.insert(feed, secs);
        }
    }
    save_poll_config(&current)?;
    Ok(current)
}

pub fn interval_label(secs: u64) -> &'static str {
    match secs {
        30 => "30 seconds",
        60 => "1 minute",
        300 => "5 minutes",
        1800 => "30 minutes",
        3600 => "1 hour",
        14_400 => "4 hours",
        _ => "custom",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_allowed_intervals() {
        let mut ok = HashMap::new();
        ok.insert("usgs".to_owned(), 60);
        assert!(validate_poll_intervals(&ok).is_ok());

        let mut bad = HashMap::new();
        bad.insert("usgs".to_owned(), 45);
        assert!(validate_poll_intervals(&bad).is_err());
    }
}
