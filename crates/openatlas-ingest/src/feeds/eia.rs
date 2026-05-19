//! U.S. Energy Information Administration — hourly lower-48 electricity demand.

use std::time::Duration;

use chrono::Utc;
use openatlas_core::Domain;
use reqwest::Client;

use super::{
    adapter::FeedDescriptor,
    http::{eia_data_rows, fetch_text, parse_json_value},
    normalize::{drafts_to_events, parse_eia_period, ratio_severity, ObservationDraft},
};

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
            crate::feed_config::secret_value_valid(ENV_API_KEY, api_key.trim())?;
            fetch(client, api_key).await
        })
    },
};

const PEAK_DEMAND_MW: f64 = 720_000.0;

async fn fetch(client: Client, api_key: String) -> anyhow::Result<Vec<openatlas_core::WorldEvent>> {
    let url = format!(
        "https://api.eia.gov/v2/electricity/rto/region-data/data/?api_key={api_key}&frequency=hourly&data[0]=value&facets[respondent][]=US48&facets[type][]=D&sort[0][column]=period&sort[0][direction]=desc&length=12"
    );

    let body = fetch_text(&client, "eia", &url).await?;
    let payload = parse_json_value(&body, "eia")?;
    let observations = eia_data_rows(&payload)?;

    let drafts = observations
        .iter()
        .filter_map(|obs| {
            let period = obs.get("period").and_then(|v| v.as_str()).unwrap_or("");
            let respondent = obs
                .get("respondent")
                .and_then(|v| v.as_str())
                .unwrap_or("US48");
            let value = obs.get("value").and_then(|v| v.as_f64()).or_else(|| {
                obs.get("value")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
            })?;
            let observed_at = parse_eia_period(period).unwrap_or_else(Utc::now);
            let severity_score = ratio_severity(value, PEAK_DEMAND_MW);
            let external_key = format!("{respondent}-{period}");
            Some(
                ObservationDraft::new(external_key, observed_at, Domain::Energy, severity_score)
                    .field("respondent", respondent)
                    .field("period", period)
                    .field("value_mw", value)
                    .field("metric", "hourly_demand"),
            )
        })
        .collect::<Vec<_>>();

    Ok(drafts_to_events("eia", SOURCE_URL, drafts))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fixture_rows() {
        let body = include_str!("../../tests/fixtures/eia_demand.json");
        let v = parse_json_value(body, "eia").unwrap();
        let rows = eia_data_rows(&v).unwrap();
        assert_eq!(rows.len(), 2);
    }
}
