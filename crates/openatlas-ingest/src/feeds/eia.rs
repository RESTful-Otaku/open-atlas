//! U.S. Energy Information Administration — hourly lower-48 electricity
//! demand. Requires `EIA_API_KEY`. Dormant by default.

use std::time::Duration;

use chrono::Utc;
use openatlas_core::{Domain, WorldEvent};
use reqwest::Client;
use serde_json::{json, Value};

use super::{adapter::FeedDescriptor, deterministic_event_id};

const POLL_INTERVAL: Duration = Duration::from_secs(900);
const SOURCE_URL: &str = "https://www.eia.gov/";
const ENV_API_KEY: &str = "EIA_API_KEY";

pub(super) const DESCRIPTOR: FeedDescriptor = FeedDescriptor {
    name: "eia",
    source_url: SOURCE_URL,
    poll_interval: POLL_INTERVAL,
    requires_env: Some(ENV_API_KEY),
    fetch: |client| {
        Box::pin(async move {
            let api_key = std::env::var(ENV_API_KEY)
                .map_err(|_| anyhow::anyhow!("EIA_API_KEY is not set"))?;
            fetch(client, api_key).await
        })
    },
};

/// Approximate U.S. peak demand in MW; clamps severity at 1.0.
const PEAK_DEMAND_MW: f64 = 720_000.0;

async fn fetch(client: Client, api_key: String) -> anyhow::Result<Vec<WorldEvent>> {
    let url = format!(
        "https://api.eia.gov/v2/electricity/rto/region-data/data/?api_key={api_key}&frequency=hourly&data[0]=value&facets[respondent][]=US48&facets[type][]=D&sort[0][column]=period&sort[0][direction]=desc&length=12"
    );

    let payload = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    let observations = payload
        .get("response")
        .and_then(|v| v.get("data"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut events = Vec::new();
    for obs in observations.into_iter() {
        let period = obs
            .get("period")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned();
        let respondent = obs
            .get("respondent")
            .and_then(|v| v.as_str())
            .unwrap_or("US48")
            .to_owned();
        let value = obs.get("value").and_then(|v| v.as_f64()).or_else(|| {
            obs.get("value")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<f64>().ok())
        });
        let Some(value) = value else { continue };

        let severity_score = (value / PEAK_DEMAND_MW).clamp(0.0, 1.0);
        let external_key = format!("{respondent}-{period}");
        events.push(WorldEvent {
            id: deterministic_event_id("eia", &external_key),
            timestamp: Utc::now(),
            domain: Domain::Energy,
            location: None,
            severity_score,
            payload: json!({
                "source": "eia",
                "source_url": SOURCE_URL,
                "respondent": respondent,
                "period": period,
                "value_mw": value,
                "metric": "hourly_demand"
            }),
        });
    }
    Ok(events)
}
