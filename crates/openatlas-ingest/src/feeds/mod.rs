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
pub(crate) mod http;
pub mod normalize;

use adapter::FeedDescriptor;

use crate::{
    circuit::{self, is_circuit_open},
    feed_config, feed_poll,
    health::{
        record_feed_failure, record_feed_poll_start, record_feed_success, record_feed_test,
        set_feed_worker_running,
    },
    ingest_mode::ingest_mode,
    pipeline::push_events_via_state,
    state::AppState,
    validate::filter_valid_events,
};

/// Stagger feed worker start so all adapters do not hit upstream APIs at once.
const FEED_START_STAGGER: Duration = Duration::from_secs(3);

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

/// Result of a one-shot feed fetch (Settings → Test).
#[derive(Debug, Clone)]
pub struct FeedTestResult {
    pub ok: bool,
    pub event_count: usize,
    pub message: String,
    pub duration_ms: u64,
}

/// Returns true when live open-data adapters should run.
pub(crate) fn live_enabled() -> bool {
    ingest_mode().live_feeds_enabled()
}

/// Spawns every enabled live feed onto the current tokio runtime. A
/// single shared [`Client`] is reused across feeds so connection
/// pooling, DNS cache, and TLS session tickets amortise across requests.
pub async fn spawn_all(state: AppState) {
    if !live_enabled() {
        info!("live open data feeds disabled (set OPENATLAS_INGEST_MODE=live or hybrid)");
        return;
    }

    let client = build_client();

    let mut spawned = 0usize;
    for (index, descriptor) in REGISTRY.iter().enumerate() {
        if is_dormant(descriptor) {
            continue;
        }
        {
            let mut set = state.spawned_feeds.write().await;
            set.insert(descriptor.name.to_owned());
        }
        spawn_feed(
            state.clone(),
            client.clone(),
            descriptor,
            Duration::from_secs(index as u64 * FEED_START_STAGGER.as_secs()),
        );
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
    feed_config::env_key_present(var)
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
/// Start the supervised worker for one feed if not already running.
pub async fn ensure_feed_worker(state: &AppState, name: &str) -> anyhow::Result<()> {
    let descriptor = descriptor_for(name).ok_or_else(|| anyhow::anyhow!("unknown feed: {name}"))?;
    if is_dormant(descriptor) {
        anyhow::bail!(
            "feed is dormant — configure {} first",
            descriptor.requires_env.unwrap_or("credentials")
        );
    }
    let mut spawned = state.spawned_feeds.write().await;
    if spawned.contains(name) {
        return Ok(());
    }
    spawned.insert(name.to_owned());
    drop(spawned);
    spawn_feed(state.clone(), build_client(), descriptor, Duration::ZERO);
    Ok(())
}

/// One-shot fetch for operator testing (does not write to SpacetimeDB).
pub async fn test_feed_fetch(state: &AppState, name: &str) -> anyhow::Result<FeedTestResult> {
    let descriptor = descriptor_for(name).ok_or_else(|| anyhow::anyhow!("unknown feed: {name}"))?;
    if let Some(key) = descriptor.requires_env {
        if !env_is_set(key) {
            anyhow::bail!("{key} is not set");
        }
    }
    if let Some(remaining) = state.rate_limiter.operator_cooldown_remaining(name).await {
        return Ok(FeedTestResult {
            ok: false,
            event_count: 0,
            message: format!(
                "Rate limited: wait {}s before testing {name} again (protects upstream APIs)",
                remaining.as_secs().max(1)
            ),
            duration_ms: 0,
        });
    }
    let interval = feed_poll::effective_interval(name, descriptor.poll_interval);
    state.rate_limiter.wait_scheduled_poll(name, interval).await;
    state.rate_limiter.record_operator_fetch(name).await;

    let client = build_client();
    let started = std::time::Instant::now();
    match (descriptor.fetch)(client).await {
        Ok(events) => {
            let (events, rejected) = filter_valid_events(events);
            let count = events.len();
            let msg = if rejected > 0 {
                format!("Fetched {count} valid events ({rejected} rejected by validation)")
            } else {
                format!("Fetched {count} events")
            };
            Ok(FeedTestResult {
                ok: true,
                event_count: count,
                message: msg,
                duration_ms: started.elapsed().as_millis() as u64,
            })
        }
        Err(error) => Ok(FeedTestResult {
            ok: false,
            event_count: 0,
            message: error.to_string(),
            duration_ms: started.elapsed().as_millis() as u64,
        }),
    }
}

/// Clear backoff, ensure worker is running, and run a test fetch.
pub async fn reconnect_feed(state: &AppState, name: &str) -> anyhow::Result<FeedTestResult> {
    crate::health::refresh_feed_enabled_flags(state).await;
    circuit::reset_circuit(state, name).await;
    ensure_feed_worker(state, name).await?;
    let result = test_feed_fetch(state, name).await?;
    record_feed_test(
        state,
        name,
        result.ok,
        result.message.clone(),
        result.event_count,
    )
    .await;
    Ok(result)
}

fn spawn_feed(
    state: AppState,
    client: Client,
    descriptor: &'static FeedDescriptor,
    start_delay: Duration,
) {
    let name = descriptor.name.to_owned();
    tokio::spawn(async move {
        if !start_delay.is_zero() {
            tokio::time::sleep(start_delay).await;
        }
        set_feed_worker_running(&state, &name, true).await;
        let name = name.as_str();
        let fetch = descriptor.fetch;

        let source_url = descriptor.source_url;
        loop {
            let interval = feed_poll::effective_interval(name, descriptor.poll_interval);
            state.rate_limiter.wait_scheduled_poll(name, interval).await;
            state.rate_limiter.record_scheduled_poll(name).await;

            if is_circuit_open(&state, name).await {
                debug!("{name}: circuit open — skipping upstream fetch until reconnect");
                record_feed_poll_start(&state, name).await;
                record_feed_failure(
                    &state,
                    name,
                    "circuit open after repeated failures — use Settings → Reconnect".to_owned(),
                    interval,
                )
                .await;
                continue;
            }

            record_feed_poll_start(&state, name).await;

            match fetch(client.clone()).await {
                Ok(events) => {
                    let (events, rejected) = filter_valid_events(events);
                    if rejected > 0 {
                        debug!("{name}: {rejected} events failed ingest validation");
                    }
                    let total = events.len();
                    let push = push_events_via_state(&state, events, name, source_url).await;
                    debug!(
                        "{name} feed cycle: {} new, {} duplicate, {} rejected, {} transport errors / {total} fetched",
                        push.accepted,
                        push.duplicates,
                        push.rejected,
                        push.transport_errors,
                    );
                    if push.had_hard_failure(total) {
                        record_feed_failure(
                            &state,
                            name,
                            format!(
                                "fetched {total} events but none ingested ({} STDB transport errors; {} duplicates)",
                                push.transport_errors, push.duplicates
                            ),
                            interval,
                        )
                        .await;
                        circuit::on_poll_failure(&state, name).await;
                    } else {
                        record_feed_success(&state, name, push.accepted, push.duplicates, interval)
                            .await;
                        circuit::on_poll_success(&state, name).await;
                    }
                }
                Err(error) => {
                    error!("{name} fetch failed: {error}");
                    record_feed_failure(&state, name, error.to_string(), interval).await;
                    circuit::on_poll_failure(&state, name).await;
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

    /// Hits real public APIs. Run: `cargo test -p openatlas-ingest registry_feeds_fetch -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "network: hits public open-data APIs"]
    async fn registry_feeds_fetch_without_error() {
        let client = build_client();
        let mut checked = 0usize;
        let mut failures = Vec::new();
        for descriptor in REGISTRY {
            if let Some(key) = descriptor.requires_env {
                if std::env::var(key).map(|v| v.is_empty()).unwrap_or(true) {
                    eprintln!("skip {} (set {key})", descriptor.name);
                    continue;
                }
            }
            checked += 1;
            match (descriptor.fetch)(client.clone()).await {
                Ok(events) => eprintln!("{} ok — {} events", descriptor.name, events.len()),
                Err(error) => {
                    eprintln!("{} FAIL — {error:#}", descriptor.name);
                    failures.push(descriptor.name);
                }
            }
        }
        assert!(
            checked >= 7,
            "expected at least 7 keyless feeds; got {checked}"
        );
        let hard_fail: Vec<_> = failures
            .iter()
            .filter(|name| **name != "gdelt")
            .copied()
            .collect();
        assert!(
            hard_fail.is_empty(),
            "feeds failed (excluding optional gdelt): {hard_fail:?}"
        );
    }
}
