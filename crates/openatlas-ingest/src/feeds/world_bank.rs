

use std::time::Duration;

use openatlas_core::{Domain, Location};
use reqwest::Client;

use super::{
    adapter::FeedDescriptor,
    http::{fetch_text, parse_json_value, world_bank_observations},
    normalize::{drafts_to_events, parse_date_ymd, ratio_severity, ObservationDraft},
};

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
const GDP_SWING_SATURATION_PCT: f64 = 10.0;
const SAMPLE_COUNTRY_IDS: &[&str] = &["US", "CN", "DE", "JP", "IN", "BR", "ZA", "GB", "FR", "RU"];

async fn fetch(client: Client) -> anyhow::Result<Vec<openatlas_core::WorldEvent>> {
    let countries = SAMPLE_COUNTRY_IDS.join(";");
    let url = format!(
        "https://api.worldbank.org/v2/country/{countries}/indicator/{INDICATOR}?format=json&per_page=60&mrnev=1"
    );

    let body = fetch_text(&client, "world-bank", &url).await?;
    let raw = parse_json_value(&body, "world-bank")?;
    let observations = world_bank_observations(&raw)?;

    let mut drafts = Vec::new();
    for obs in observations.iter().take(MAX_EVENTS) {
        let country_id = obs
            .get("country")
            .and_then(|v| v.get("id"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if !SAMPLE_COUNTRY_IDS.contains(&country_id) {
            continue;
        }
        let country_code = obs
            .get("countryiso3code")
            .and_then(|v| v.as_str())
            .unwrap_or(country_id)
            .to_owned();
        let country_name = obs
            .get("country")
            .and_then(|v| v.get("value"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_owned();
        let date_str = obs.get("date").and_then(|v| v.as_str()).unwrap_or("");
        let Some(gdp_growth) = obs.get("value").and_then(|v| v.as_f64()) else {
            continue;
        };
        let observed_at = parse_date_ymd(date_str).unwrap_or_else(chrono::Utc::now);
        let severity = ratio_severity(gdp_growth, GDP_SWING_SATURATION_PCT);
        let external_key = format!("{country_code}-{date_str}");
        let draft = ObservationDraft::new(external_key, observed_at, Domain::Economy, severity)
            .field("indicator", INDICATOR)
            .field("indicator_label", INDICATOR_LABEL)
            .field("country_code", country_code.clone())
            .field("country", country_name)
            .field("year", date_str)
            .field("value", gdp_growth);
        if let Some(loc) = country_centroid(&country_code) {
            if let Ok(d) = draft.with_location(loc) {
                drafts.push(d);
            }
        } else {
            drafts.push(draft);
        }
    }
    Ok(drafts_to_events("world-bank", SOURCE_URL, drafts))
}

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

    #[test]
    fn parses_fixture_envelope() {
        let body = include_str!("../../tests/fixtures/world_bank_gdp.json");
        let v = parse_json_value(body, "test").unwrap();
        let obs = world_bank_observations(&v).unwrap();
        assert!(!obs.is_empty());
    }
}
