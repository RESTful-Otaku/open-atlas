//! FRED (St. Louis Fed) macro indicators. Requires `FRED_API_KEY`.

use std::time::Duration;

use chrono::Utc;
use openatlas_core::Domain;
use reqwest::Client;

use super::{
    adapter::FeedDescriptor,
    http::{fetch_text, fred_latest_observation, parse_json_value},
    normalize::{drafts_to_events, parse_date_ymd, ObservationDraft},
};

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

const SERIES: &[(&str, &str)] = &[
    ("DGS10", "10-Year Treasury Yield"),
    ("UNRATE", "Unemployment Rate"),
    ("CPIAUCSL", "Consumer Price Index"),
    ("VIXCLS", "CBOE Volatility Index"),
];

async fn fetch(client: Client, api_key: String) -> anyhow::Result<Vec<openatlas_core::WorldEvent>> {
    let mut drafts = Vec::new();
    for (series_id, label) in SERIES {
        let url = format!(
            "https://api.stlouisfed.org/fred/series/observations?series_id={series_id}&api_key={api_key}&file_type=json&sort_order=desc&limit=1"
        );
        let body = fetch_text(&client, "fred", &url).await?;
        let payload = parse_json_value(&body, "fred")?;
        let obs = match fred_latest_observation(&payload) {
            Ok(o) => o,
            Err(_) => continue,
        };
        let date_str = obs.get("date").and_then(|v| v.as_str()).unwrap_or("");
        let value_str = obs.get("value").and_then(|v| v.as_str()).unwrap_or("");
        let Ok(value) = value_str.parse::<f64>() else {
            continue;
        };
        let observed_at = parse_date_ymd(date_str).unwrap_or_else(Utc::now);
        let severity_score = severity(series_id, value);
        let external_key = format!("{series_id}-{date_str}");
        drafts.push(
            ObservationDraft::new(external_key, observed_at, Domain::Finance, severity_score)
                .field("series_id", *series_id)
                .field("label", *label)
                .field("observation_date", date_str)
                .field("value", value),
        );
    }
    Ok(drafts_to_events("fred", SOURCE_URL, drafts))
}

fn severity(series_id: &str, value: f64) -> f64 {
    let raw = match series_id {
        "DGS10" => value / 8.0,
        "UNRATE" => value / 15.0,
        "CPIAUCSL" => (value - 250.0).abs() / 100.0,
        "VIXCLS" => value / 40.0,
        _ => 0.3,
    };
    raw.clamp(0.0, 1.0)
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
    }

    #[test]
    fn parses_fixture() {
        let body = include_str!("../../tests/fixtures/fred_observations.json");
        let v = parse_json_value(body, "fred").unwrap();
        let obs = fred_latest_observation(&v).unwrap();
        assert_eq!(obs["date"], "2024-01-15");
    }
}
