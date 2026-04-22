//! CoinGecko simple-price feed for a small fixed asset basket.
//! Public API, no auth, rate-limited to ~10–30 calls/minute.

use std::{collections::HashMap, time::Duration};

use chrono::Utc;
use openatlas_core::{Domain, WorldEvent};
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;

use super::{adapter::FeedDescriptor, deterministic_event_id};

const POLL_INTERVAL: Duration = Duration::from_secs(60);
const SOURCE_URL: &str = "https://www.coingecko.com/";

pub(super) const DESCRIPTOR: FeedDescriptor = FeedDescriptor {
    name: "coingecko",
    source_url: SOURCE_URL,
    poll_interval: POLL_INTERVAL,
    requires_env: None,
    fetch: |client| Box::pin(fetch(client)),
};

/// Assets tracked. Changing this list changes the event fan-out; keep small.
const ASSETS: &[&str] = &["bitcoin", "ethereum", "solana"];

/// A 20% daily swing saturates severity at 1.0.
const DAILY_SWING_SATURATION_PCT: f64 = 20.0;

#[derive(Debug, Deserialize)]
struct Ticker {
    usd: Option<f64>,
    usd_24h_change: Option<f64>,
}

async fn fetch(client: Client) -> anyhow::Result<Vec<WorldEvent>> {
    let url = format!(
        "https://api.coingecko.com/api/v3/simple/price?ids={}&vs_currencies=usd&include_24hr_change=true",
        ASSETS.join(","),
    );
    let payload = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json::<HashMap<String, Ticker>>()
        .await?;

    let now = Utc::now();
    let mut events = Vec::new();
    for asset in ASSETS {
        let Some(entry) = payload.get(*asset) else {
            continue;
        };
        let change = entry.usd_24h_change.unwrap_or(0.0);
        let severity_score = (change.abs() / DAILY_SWING_SATURATION_PCT).clamp(0.0, 1.0);
        let external_key = format!("{asset}-{}", now.timestamp() / 60);

        events.push(WorldEvent {
            id: deterministic_event_id("coingecko", &external_key),
            timestamp: now,
            domain: Domain::Finance,
            location: None,
            severity_score,
            payload: json!({
                "source": "coingecko",
                "source_url": SOURCE_URL,
                "asset": asset,
                "usd_price": entry.usd,
                "usd_24h_change": entry.usd_24h_change
            }),
        });
    }
    Ok(events)
}
