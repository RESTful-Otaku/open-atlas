//! FRED (St. Louis Fed) macro indicators. Requires `FRED_API_KEY`.
//! Dormant by default.

use std::time::Duration;

use chrono::Utc;
use openatlas_core::{Domain, WorldEvent};
use reqwest::Client;
use serde_json::{json, Value};

use super::{adapter::FeedDescriptor, deterministic_event_id};

const POLL_INTERVAL: Duration = Duration::from_secs(600);
const SOURCE_URL: &str = "https://fred.stlouisfed.org/";
const ENV_API_KEY: &str = "FRED_API_KEY";

pub(super) const DESCRIPTOR: FeedDescriptor = FeedDescriptor {
    name: "fred",
    source_url: SOURCE_URL,
    poll_interval: POLL_INTERVAL,
    requires_env: Some(ENV_API_KEY),
    fetch: |client| {
        Box::pin(async move {
            let api_key = std::env::var(ENV_API_KEY)
                .map_err(|_| anyhow::anyhow!("FRED_API_KEY is not set"))?;
            fetch(client, api_key).await
        })
    },
};

/// Curated macro series that ship in a typical MVP dashboard.
const SERIES: &[(&str, &str)] = &[
    ("DGS10", "10-Year Treasury Yield"),
    ("UNRATE", "Unemployment Rate"),
    ("CPIAUCSL", "Consumer Price Index"),
    ("VIXCLS", "CBOE Volatility Index"),
];

async fn fetch(client: Client, api_key: String) -> anyhow::Result<Vec<WorldEvent>> {
    let mut events = Vec::new();
    for (series_id, label) in SERIES {
        let url = format!(
            "https://api.stlouisfed.org/fred/series/observations?series_id={series_id}&api_key={api_key}&file_type=json&sort_order=desc&limit=1"
        );
        let payload = client
            .get(url)
            .send()
            .await?
            .error_for_status()?
            .json::<Value>()
            .await?;

        let Some(obs) = payload
            .get("observations")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
        else {
            continue;
        };
        let date_str = obs
            .get("date")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned();
        let value_str = obs.get("value").and_then(|v| v.as_str()).unwrap_or("");
        let Ok(value) = value_str.parse::<f64>() else {
            continue;
        };

        let severity_score = severity(series_id, value);
        let external_key = format!("{series_id}-{date_str}");
        events.push(WorldEvent {
            id: deterministic_event_id("fred", &external_key),
            timestamp: Utc::now(),
            domain: Domain::Finance,
            location: None,
            severity_score,
            payload: json!({
                "source": "fred",
                "source_url": SOURCE_URL,
                "series_id": series_id,
                "label": label,
                "observation_date": date_str,
                "value": value
            }),
        });
    }
    Ok(events)
}

/// Each series has its own natural range; normalise approximately so that
/// elevated-but-plausible values map to higher severity without saturating.
fn severity(series_id: &str, value: f64) -> f64 {
    match series_id {
        "DGS10" => (value / 8.0).clamp(0.0, 1.0),
        "UNRATE" => (value / 15.0).clamp(0.0, 1.0),
        "CPIAUCSL" => ((value - 250.0).abs() / 100.0).clamp(0.0, 1.0),
        "VIXCLS" => (value / 40.0).clamp(0.0, 1.0),
        _ => 0.3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn severity_stays_in_unit_interval() {
        for (series, _) in SERIES {
            assert!((0.0..=1.0).contains(&severity(series, 0.0)));
            assert!((0.0..=1.0).contains(&severity(series, 1_000.0)));
        }
        assert!((0.0..=1.0).contains(&severity("UNKNOWN", 42.0)));
    }
}
