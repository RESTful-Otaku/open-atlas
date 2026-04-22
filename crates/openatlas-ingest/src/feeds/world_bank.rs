//! World Bank Open Data — GDP growth (annual %) for a broad country mix.
//! Public API, no auth.

use std::time::Duration;

use chrono::Utc;
use openatlas_core::{Domain, Location, WorldEvent};
use reqwest::Client;
use serde_json::{json, Value};

use super::{adapter::FeedDescriptor, deterministic_event_id};

const POLL_INTERVAL: Duration = Duration::from_secs(3600);
const SOURCE_URL: &str = "https://data.worldbank.org/";

pub(super) const DESCRIPTOR: FeedDescriptor = FeedDescriptor {
    name: "world-bank",
    source_url: SOURCE_URL,
    poll_interval: POLL_INTERVAL,
    requires_env: None,
    fetch: |client| Box::pin(fetch(client)),
};

const INDICATOR: &str = "NY.GDP.MKTP.KD.ZG";
const INDICATOR_LABEL: &str = "GDP growth (annual %)";
const MAX_EVENTS: usize = 20;

/// A 10% swing in either direction saturates severity.
const GDP_SWING_SATURATION_PCT: f64 = 10.0;

async fn fetch(client: Client) -> anyhow::Result<Vec<WorldEvent>> {
    let url = format!(
        "https://api.worldbank.org/v2/country/USA;CHN;DEU;JPN;IND;BRA;ZAF;GBR;FRA;RUS/indicator/{INDICATOR}?format=json&per_page=60&mrnev=1"
    );

    let raw = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    let observations = raw
        .as_array()
        .and_then(|arr| arr.get(1))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut events = Vec::new();
    for obs in observations.into_iter().take(MAX_EVENTS) {
        let country_code = obs
            .get("countryiso3code")
            .and_then(|v| v.as_str())
            .unwrap_or("UNK")
            .to_owned();
        let country_name = obs
            .get("country")
            .and_then(|v| v.get("value"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_owned();
        let date_str = obs
            .get("date")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned();
        let Some(gdp_growth) = obs.get("value").and_then(|v| v.as_f64()) else {
            continue;
        };

        let severity_score = (gdp_growth.abs() / GDP_SWING_SATURATION_PCT).clamp(0.0, 1.0);
        let external_key = format!("{country_code}-{date_str}");

        events.push(WorldEvent {
            id: deterministic_event_id("world-bank", &external_key),
            timestamp: Utc::now(),
            domain: Domain::Economy,
            location: country_centroid(&country_code),
            severity_score,
            payload: json!({
                "source": "world-bank",
                "source_url": SOURCE_URL,
                "indicator": INDICATOR,
                "indicator_label": INDICATOR_LABEL,
                "country_code": country_code,
                "country": country_name,
                "year": date_str,
                "value": gdp_growth
            }),
        });
    }
    Ok(events)
}

/// Rough country centroids for the small World Bank sample set. Using
/// approximate centres is sufficient for map marker rendering and avoids
/// pulling in a full ISO-3166 geocoding dataset.
fn country_centroid(iso3: &str) -> Option<Location> {
    let (lat, lon) = match iso3 {
        "USA" => (38.0, -97.0),
        "CHN" => (35.0, 105.0),
        "DEU" => (51.0, 10.0),
        "JPN" => (36.0, 138.0),
        "IND" => (21.0, 78.0),
        "BRA" => (-14.0, -51.0),
        "ZAF" => (-30.0, 25.0),
        "GBR" => (54.0, -2.0),
        "FRA" => (46.0, 2.0),
        "RUS" => (61.0, 105.0),
        _ => return None,
    };
    Some(Location {
        lat,
        lon,
        region_tags: vec!["world-bank".to_owned(), iso3.to_owned()],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn country_centroid_covers_sample_set() {
        assert!(country_centroid("USA").is_some());
        assert!(country_centroid("ZZZ").is_none());
    }
}
