//! Plug-in surface for live open-data feeds.
//!
//! # Goal
//!
//! Adding a new provider must require touching exactly **two** places:
//!
//! 1. Create `feeds/<name>.rs` and implement `fetch` + an exported
//!    [`FeedDescriptor`] const named `DESCRIPTOR`.
//! 2. Append the new `DESCRIPTOR` to [`crate::feeds::REGISTRY`].
//!
//! Supervision, health tracking, deterministic ingestion, backoff, and
//! documentation links are derived automatically from the descriptor. No
//! match arms to update, no parallel `const FEED_NAMES` array to keep in
//! sync, no bespoke spawn logic per feed.
//!
//! # Shape
//!
//! The descriptor is a small, `const`-constructible value:
//!
//! ```ignore
//! use std::time::Duration;
//! use crate::feeds::adapter::FeedDescriptor;
//!
//! pub(super) const DESCRIPTOR: FeedDescriptor = FeedDescriptor {
//!     name: "my-feed",
//!     source_url: "https://example.com/",
//!     poll_interval: Duration::from_secs(60),
//!     requires_env: None,
//!     fetch: |client| Box::pin(fetch(client)),
//! };
//! ```
//!
//! For feeds that need an API key, set `requires_env: Some("MY_KEY")`.
//! The supervisor will (a) skip the feed when the env var is unset and
//! (b) expect the `fetch` closure to read the same variable from the
//! environment — the descriptor itself stays free of secrets.

use std::{future::Future, pin::Pin, time::Duration};

use openatlas_core::WorldEvent;
use reqwest::Client;

/// Plain fn pointer so `FeedDescriptor` is fully `const`-constructible.
/// Boxed dyn `Future` keeps adapter signatures uniform regardless of the
/// concrete future type returned by each `async fn`.
pub(crate) type FetchFn =
    fn(Client) -> Pin<Box<dyn Future<Output = anyhow::Result<Vec<WorldEvent>>> + Send>>;

/// Everything the supervisor needs to know about a feed. No behaviour
/// lives here — only metadata and a fetch entry point.
#[derive(Clone, Copy)]
pub(crate) struct FeedDescriptor {
    /// Stable identifier used for deterministic event ids, log lines,
    /// `/status` reporting, and `insight::source_url_for_source` lookup.
    /// Kebab-case by convention.
    pub name: &'static str,
    /// Human-facing documentation or homepage URL — surfaced in UI
    /// insight cards. No query params, no API paths.
    pub source_url: &'static str,
    /// Cadence between successful cycles. Chosen to respect the
    /// provider's documented rate limits (see comments in each module).
    pub poll_interval: Duration,
    /// When `Some(name)`, the supervisor treats the feed as dormant
    /// unless the environment variable is set and non-empty. The
    /// descriptor's `fetch` is then expected to resolve the same
    /// variable internally.
    pub requires_env: Option<&'static str>,
    /// Single-shot fetch. Returning `Err` triggers the backoff path;
    /// returning `Ok(vec![])` is a successful no-op cycle.
    pub fetch: FetchFn,
}

#[cfg(test)]
mod tests {
    use super::*;

    const _CONST_TEST: FeedDescriptor = FeedDescriptor {
        name: "const-test",
        source_url: "https://example.com/",
        poll_interval: Duration::from_secs(60),
        requires_env: None,
        fetch: |_| Box::pin(async { Ok(vec![]) }),
    };

    #[tokio::test]
    async fn fetch_fn_is_callable() {
        let client = Client::new();
        let result = (_CONST_TEST.fetch)(client).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn descriptor_is_const_constructible() {
        assert_eq!(_CONST_TEST.name, "const-test");
        assert_eq!(_CONST_TEST.source_url, "https://example.com/");
        assert_eq!(_CONST_TEST.poll_interval, Duration::from_secs(60));
        assert!(_CONST_TEST.requires_env.is_none());
    }
}
