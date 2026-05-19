//! CoinGecko simple-price feed for a small fixed asset basket.

use std::{collections::HashMap, time::Duration};

use chrono::Utc;
use openatlas_core::Domain;
use reqwest::Client;
use serde::Deserialize;

use super::{
    adapter::FeedDescriptor,
    http::fetch_json,
    normalize::{daily_external_key, drafts_to_events, ratio_severity, ObservationDraft},
};

/// CoinGecko free tier: keep well under documented per-minute caps.
const POLL_INTERVAL: Duration = Duration::from_secs(90);
const SOURCE_URL: &str = "https://www.coingecko.com/";

pub(super) const DESCRIPTOR: FeedDescriptor = FeedDescriptor {
    name: "coingecko",
    source_url: SOURCE_URL,
    poll_interval: POLL_INTERVAL,
    requires_env: None,
    fetch: |client| Box::pin(fetch(client)),
};

const ASSETS: &[&str] = &["bitcoin", "ethereum", "solana"];
const DAILY_SWING_SATURATION_PCT: f64 = 20.0;

#[derive(Debug, Deserialize)]
struct Ticker {
    usd: Option<f64>,
    usd_24h_change: Option<f64>,
}

async fn fetch(client: Client) -> anyhow::Result<Vec<openatlas_core::WorldEvent>> {
    let url = format!(
        "https://api.coingecko.com/api/v3/simple/price?ids={}&vs_currencies=usd&include_24hr_change=true",
        ASSETS.join(","),
    );
    let payload: HashMap<String, Ticker> = fetch_json(&client, "coingecko", &url).await?;
    let now = Utc::now();

    let drafts = ASSETS
        .iter()
        .filter_map(|asset| {
            let entry = payload.get(*asset)?;
            let change = entry.usd_24h_change.unwrap_or(0.0);
            let severity = ratio_severity(change, DAILY_SWING_SATURATION_PCT);
            let external_key = daily_external_key(asset, now);
            Some(
                ObservationDraft::new(external_key, now, Domain::Finance, severity)
                    .field("asset", *asset)
                    .field("usd_price", entry.usd)
                    .field("usd_24h_change", entry.usd_24h_change),
            )
        })
        .collect::<Vec<_>>();

    Ok(drafts_to_events("coingecko", SOURCE_URL, drafts))
}
