//! Plug-in surface for live open-data feeds.

use std::{future::Future, pin::Pin, time::Duration};

use openatlas_core::WorldEvent;
use reqwest::Client;

pub(crate) type FetchFn =
    fn(Client) -> Pin<Box<dyn Future<Output = anyhow::Result<Vec<WorldEvent>>> + Send>>;

#[derive(Clone, Copy)]
pub(crate) struct FeedDescriptor {
    pub name: &'static str,
    pub source_url: &'static str,
    pub poll_interval: Duration,
    pub requires_env: Option<&'static str>,
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
