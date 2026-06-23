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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::feeds::normalize::{drafts_to_events, ObservationDraft};

    fn make_asset_draft(
        asset: &str,
        price: f64,
        change: f64,
        now: chrono::DateTime<Utc>,
    ) -> ObservationDraft {
        let severity = crate::validate::clamp_severity(
            (change.abs() / DAILY_SWING_SATURATION_PCT).clamp(0.0, 1.0),
        );
        let external_key = format!("{}-{}", asset, now.format("%Y-%m-%d"));
        let mut fields = serde_json::Map::new();
        fields.insert("asset".to_owned(), serde_json::json!(asset));
        fields.insert("usd_price".to_owned(), serde_json::json!(price));
        fields.insert("usd_24h_change".to_owned(), serde_json::json!(change));
        ObservationDraft {
            external_key,
            observed_at: now,
            domain: Domain::Finance,
            severity,
            location: None,
            fields,
        }
    }

    #[test]
    fn golden_data_produces_three_events() {
        let now = Utc::now();
        let drafts = vec![
            make_asset_draft("bitcoin", 48250.0, 3.21, now),
            make_asset_draft("ethereum", 3150.0, -1.45, now),
            make_asset_draft("solana", 142.0, 7.83, now),
        ];
        let events = drafts_to_events("coingecko", SOURCE_URL, drafts);
        assert_eq!(events.len(), 3);
    }

    #[test]
    fn golden_data_domain_is_finance() {
        let now = Utc::now();
        let drafts = vec![
            make_asset_draft("bitcoin", 50000.0, 1.0, now),
            make_asset_draft("ethereum", 3000.0, -0.5, now),
        ];
        let events = drafts_to_events("coingecko", SOURCE_URL, drafts);
        for event in &events {
            assert_eq!(event.domain, Domain::Finance);
        }
    }

    #[test]
    fn golden_data_severity_in_bounds() {
        let now = Utc::now();
        let drafts = vec![
            make_asset_draft("bitcoin", 50000.0, 25.0, now),
            make_asset_draft("ethereum", 3000.0, -30.0, now),
            make_asset_draft("solana", 100.0, 0.0, now),
        ];
        let events = drafts_to_events("coingecko", SOURCE_URL, drafts);
        for event in &events {
            assert!(
                (0.0..=1.0).contains(&event.severity_score),
                "severity {} out of [0, 1]",
                event.severity_score
            );
        }
    }
}
