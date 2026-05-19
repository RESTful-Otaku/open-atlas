//! Outbound API rate limiting for live feed adapters.
//!
//! Protects upstream providers (and your API keys) from bursty traffic caused by
//! parallel feeds, multi-request cycles (FRED, Open-Meteo), or Settings test/reconnect.

use std::{
    collections::HashMap,
    sync::OnceLock,
    time::{Duration, Instant},
};

use tokio::sync::RwLock;

/// Minimum spacing between HTTP calls to a given host (all feeds sharing that host).
fn host_min_gap(host: &str) -> Duration {
    match host {
        "api.stlouisfed.org" => Duration::from_secs(2),
        "api.eia.gov" => Duration::from_secs(2),
        "api.coingecko.com" => Duration::from_secs(12),
        "opensky-network.org" => Duration::from_secs(10),
        "api.worldbank.org" => Duration::from_secs(2),
        "earthquake.usgs.gov" => Duration::from_secs(1),
        "api.open-meteo.com" => Duration::from_secs(1),
        "eonet.gsfc.nasa.gov" => Duration::from_secs(5),
        "api.gdeltproject.org" => Duration::from_secs(30),
        _ => Duration::from_secs(1),
    }
}

fn operator_cooldown_from_env() -> Duration {
    std::env::var("OPENATLAS_OPERATOR_FETCH_COOLDOWN_SECS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .map(Duration::from_secs)
        .unwrap_or(Duration::from_secs(30))
}

#[derive(Default)]
struct Inner {
    last_feed_poll: HashMap<String, Instant>,
    last_host_request: HashMap<String, Instant>,
    last_operator_fetch: HashMap<String, Instant>,
}

/// Shared limiter installed once at process start (see `install`).
pub struct FeedRateLimiter {
    inner: RwLock<Inner>,
    operator_cooldown: Duration,
}

impl Default for FeedRateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

impl FeedRateLimiter {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(Inner::default()),
            operator_cooldown: operator_cooldown_from_env(),
        }
    }

    /// Wait until a scheduled poll for `feed` may run (`poll_interval` since last cycle).
    pub async fn wait_scheduled_poll(&self, feed: &str, poll_interval: Duration) {
        loop {
            let wait = {
                let inner = self.inner.read().await;
                inner
                    .last_feed_poll
                    .get(feed)
                    .and_then(|last| {
                        let elapsed = last.elapsed();
                        poll_interval.checked_sub(elapsed)
                    })
                    .filter(|d| !d.is_zero())
            };
            match wait {
                Some(d) => tokio::time::sleep(d).await,
                None => break,
            }
        }
    }

    /// Enforce spacing before each HTTP call (per host).
    pub async fn wait_host_request(&self, host: &str) {
        let min_gap = host_min_gap(host);
        loop {
            let wait = {
                let inner = self.inner.read().await;
                inner
                    .last_host_request
                    .get(host)
                    .and_then(|last| min_gap.checked_sub(last.elapsed()))
                    .filter(|d| !d.is_zero())
            };
            match wait {
                Some(d) => tokio::time::sleep(d).await,
                None => break,
            }
        }
    }

    /// Operator test/reconnect: returns remaining cooldown if too soon.
    pub async fn operator_cooldown_remaining(&self, feed: &str) -> Option<Duration> {
        let inner = self.inner.read().await;
        let last = inner.last_operator_fetch.get(feed)?;
        let elapsed = last.elapsed();
        if elapsed >= self.operator_cooldown {
            None
        } else {
            Some(self.operator_cooldown - elapsed)
        }
    }

    pub async fn record_scheduled_poll(&self, feed: &str) {
        let mut inner = self.inner.write().await;
        inner.last_feed_poll.insert(feed.to_owned(), Instant::now());
    }

    pub async fn record_host_request(&self, host: &str) {
        let mut inner = self.inner.write().await;
        inner
            .last_host_request
            .insert(host.to_owned(), Instant::now());
    }

    pub async fn record_operator_fetch(&self, feed: &str) {
        let mut inner = self.inner.write().await;
        inner
            .last_operator_fetch
            .insert(feed.to_owned(), Instant::now());
        inner.last_feed_poll.insert(feed.to_owned(), Instant::now());
    }
}

static GLOBAL: OnceLock<std::sync::Arc<FeedRateLimiter>> = OnceLock::new();

pub fn install(limiter: std::sync::Arc<FeedRateLimiter>) {
    let _ = GLOBAL.set(limiter);
}

pub fn global() -> Option<std::sync::Arc<FeedRateLimiter>> {
    GLOBAL.get().cloned()
}

/// Extract hostname from an HTTP(S) URL for per-host throttling.
pub fn host_from_url(url: &str) -> Option<String> {
    let after_scheme = url.split("://").nth(1)?;
    let authority = after_scheme.split('/').next()?;
    let host = authority.rsplit('@').next()?;
    let host = host.split(':').next()?;
    if host.is_empty() {
        None
    } else {
        Some(host.to_ascii_lowercase())
    }
}

/// True when upstream likely rate-limited us (HTTP 429 or similar body text).
pub fn is_rate_limit_error(err: &anyhow::Error) -> bool {
    let msg = err.to_string().to_ascii_lowercase();
    msg.contains("429")
        || msg.contains("too many requests")
        || msg.contains("rate limit")
        || msg.contains("quota exceeded")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_host_from_url() {
        assert_eq!(
            host_from_url("https://api.stlouisfed.org/fred/series/observations?x=1"),
            Some("api.stlouisfed.org".into())
        );
        assert_eq!(host_from_url("not-a-url"), None);
    }

    #[test]
    fn detects_rate_limit_errors() {
        assert!(is_rate_limit_error(&anyhow::anyhow!("GET x returned 429")));
        assert!(!is_rate_limit_error(&anyhow::anyhow!("connection reset")));
    }

    #[tokio::test]
    async fn operator_cooldown_blocks_rapid_retries() {
        let limiter = FeedRateLimiter::new();
        limiter.record_operator_fetch("fred").await;
        assert!(limiter.operator_cooldown_remaining("fred").await.is_some());
        assert!(limiter.operator_cooldown_remaining("eia").await.is_none());
    }
}
