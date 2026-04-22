//! Live open-data feed adapters.
//!
//! # How to add a new feed
//!
//! 1. Create `feeds/<your_feed>.rs` with:
//!    - an `async fn fetch(client: Client) -> anyhow::Result<Vec<WorldEvent>>`,
//!    - `pub(super) const DESCRIPTOR: FeedDescriptor = FeedDescriptor { … }`.
//! 2. Declare `mod <your_feed>;` below and append `your_feed::DESCRIPTOR`
//!    to [`REGISTRY`].
//!
//! Supervision, deterministic IDs, backoff, `/status` reporting, and
//! insight source links are all derived from the descriptor — there is
//! nothing else to wire up.
//!
//! # Design invariants
//!
//! - **Pluggable fetchers**: each feed is a free `async fn`, kept pure
//!   (network I/O aside) and easy to unit-test with recorded fixtures.
//! - **Centralised supervision**: retry/backoff/health logic lives once
//!   in [`spawn_feed`], never duplicated per feed.
//! - **Deterministic IDs**: event UUIDs derive from `(source, external_key)`
//!   so re-fetching the same upstream item will not produce duplicates.
//! - **Graceful degradation**: feeds with `requires_env` stay dormant
//!   until the named variable is present and non-empty.
//! - **Rate-limit respect**: poll intervals are chosen per provider and
//!   documented in-module next to the affected code.

use std::time::Duration;

use reqwest::Client;
use tracing::{debug, error, info};
use uuid::Uuid;

pub(crate) mod adapter;

use adapter::FeedDescriptor;

use crate::{
    health::{next_backoff, record_feed_failure, record_feed_success},
    state::AppState,
    stdb::IngestOutcome,
};

mod coingecko;
mod eia;
mod fred;
mod gdelt;
mod nasa_eonet;
mod open_meteo;
mod opensky;
mod usgs;
mod world_bank;

/// The complete set of feed plug-ins compiled into this build. Order is
/// cosmetic only (affects log/startup ordering); correctness does not
/// depend on it.
pub(crate) const REGISTRY: &[FeedDescriptor] = &[
    usgs::DESCRIPTOR,
    open_meteo::DESCRIPTOR,
    coingecko::DESCRIPTOR,
    nasa_eonet::DESCRIPTOR,
    opensky::DESCRIPTOR,
    gdelt::DESCRIPTOR,
    world_bank::DESCRIPTOR,
    fred::DESCRIPTOR,
    eia::DESCRIPTOR,
];

/// Returns the descriptor for `name`, if any. Retained for tests and
/// debug tooling (e.g. the CLI's `feeds` subcommand in the near future).
#[allow(dead_code)]
pub(crate) fn descriptor_for(name: &str) -> Option<&'static FeedDescriptor> {
    REGISTRY.iter().find(|descriptor| descriptor.name == name)
}

/// Returns true when live-feed ingestion is enabled via environment flag.
pub(crate) fn live_enabled() -> bool {
    std::env::var("OPENATLAS_ENABLE_LIVE_FEEDS")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

/// Spawns every enabled live feed onto the current tokio runtime. A
/// single shared [`Client`] is reused across feeds so connection
/// pooling, DNS cache, and TLS session tickets amortise across requests.
pub(crate) fn spawn_all(state: AppState) {
    if !live_enabled() {
        info!("live open data feeds disabled (set OPENATLAS_ENABLE_LIVE_FEEDS=1)");
        return;
    }

    let client = build_client();

    let mut spawned = 0usize;
    for descriptor in REGISTRY {
        if is_dormant(descriptor) {
            continue;
        }
        spawn_feed(state.clone(), client.clone(), descriptor);
        spawned += 1;
    }
    info!(
        "live open data feeds enabled ({spawned}/{} plug-ins)",
        REGISTRY.len()
    );
}

fn build_client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("OpenAtlas/0.1 (+https://github.com/)")
        .build()
        .unwrap_or_else(|_| Client::new())
}

fn env_is_set(var: &str) -> bool {
    std::env::var(var)
        .map(|value| !value.is_empty())
        .unwrap_or(false)
}

/// A feed is dormant when it declares an env gate that is currently
/// unsatisfied. Splitting this out keeps `spawn_all` inside the NASA
/// "one function, one screen" budget and makes the predicate unit
/// testable.
fn is_dormant(descriptor: &FeedDescriptor) -> bool {
    let Some(env_name) = descriptor.requires_env else {
        return false;
    };
    if env_is_set(env_name) {
        return false;
    }
    info!(
        "{} feed dormant: set {} to enable",
        descriptor.name, env_name
    );
    true
}

/// Core supervised worker loop used by every feed, parametrised only by
/// its [`FeedDescriptor`]. Any logic that might diverge per provider
/// (cadence, data parsing, env needs) lives on the descriptor.
fn spawn_feed(state: AppState, client: Client, descriptor: &'static FeedDescriptor) {
    tokio::spawn(async move {
        let name = descriptor.name;
        let interval = descriptor.poll_interval;
        let fetch = descriptor.fetch;
        let mut backoff = Duration::from_secs(5);

        let source_url = descriptor.source_url;
        loop {
            match fetch(client.clone()).await {
                Ok(events) => {
                    let total = events.len();
                    let mut pushed = 0;
                    for event in events {
                        match state.stdb.ingest_event(&event, name, source_url).await {
                            Ok(IngestOutcome::Accepted) => pushed += 1,
                            Ok(IngestOutcome::Duplicate) => {}
                            Err(error) => {
                                error!("{name} event push failed: {error:#}");
                            }
                        }
                    }
                    debug!("{name} feed cycle: {pushed}/{total} events pushed to stdb");
                    record_feed_success(&state, name).await;
                    backoff = Duration::from_secs(5);
                    tokio::time::sleep(interval).await;
                }
                Err(error) => {
                    error!("{name} fetch failed: {error}");
                    record_feed_failure(&state, name, error.to_string(), backoff).await;
                    tokio::time::sleep(backoff).await;
                    backoff = next_backoff(backoff);
                }
            }
        }
    });
}

/// Produces a deterministic UUID for an upstream item so repeated
/// fetches converge to the same event identity.
pub(crate) fn deterministic_event_id(source: &str, key: &str) -> Uuid {
    let seed = format!("{source}:{key}");
    Uuid::new_v5(&Uuid::NAMESPACE_URL, seed.as_bytes())
}

/// Returns the homepage/documentation URL for a registered feed, if any.
/// Used by tests and kept on the public surface for any tool that needs
/// to turn a feed name into a doc link.
#[allow(dead_code)]
pub(crate) fn source_url_for_source(source: &str) -> Option<&'static str> {
    descriptor_for(source).map(|d| d.source_url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_event_id_is_stable() {
        let a = deterministic_event_id("usgs", "us7000abcd");
        let b = deterministic_event_id("usgs", "us7000abcd");
        assert_eq!(a, b);
        let c = deterministic_event_id("usgs", "us7000abce");
        assert_ne!(a, c);
    }

    #[test]
    fn registry_is_unique_and_fully_documented() {
        let mut seen = std::collections::HashSet::new();
        for descriptor in REGISTRY {
            assert!(
                seen.insert(descriptor.name),
                "duplicate feed in REGISTRY: {}",
                descriptor.name
            );
            assert!(
                descriptor.source_url.starts_with("http"),
                "{} source_url must be a URL",
                descriptor.name
            );
            assert!(
                !descriptor.poll_interval.is_zero(),
                "{} poll_interval must be > 0",
                descriptor.name
            );
        }
    }

    #[test]
    fn source_url_matches_registered_feeds() {
        for descriptor in REGISTRY {
            assert_eq!(
                source_url_for_source(descriptor.name),
                Some(descriptor.source_url)
            );
        }
        assert_eq!(source_url_for_source("unknown-feed"), None);
    }
}
