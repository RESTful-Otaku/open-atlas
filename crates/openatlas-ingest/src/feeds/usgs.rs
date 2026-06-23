

use std::time::Duration;

use openatlas_core::Domain;
use reqwest::Client;
use serde::Deserialize;

use super::{
    adapter::FeedDescriptor,
    http::fetch_json,
    normalize::{
        drafts_to_events, location_from_coords, parse_epoch_millis, ratio_severity,
        ObservationDraft,
    },
};

const POLL_INTERVAL: Duration = Duration::from_secs(45);
const SOURCE_URL: &str =
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

pub(super) const DESCRIPTOR: FeedDescriptor = FeedDescriptor {
    name: "usgs",
    source_url: SOURCE_URL,
    poll_interval: POLL_INTERVAL,
    requires_env: None,
    fetch: |client| Box::pin(fetch(client)),
};

const MAX_EVENTS: usize = 80;
const MAG_SATURATION: f64 = 10.0;

#[derive(Debug, Deserialize)]
struct Feed {
    features: Vec<Feature>,
}

#[derive(Debug, Deserialize)]
struct Feature {
    id: String,
    properties: Properties,
    geometry: Geometry,
}

#[derive(Debug, Deserialize)]
struct Properties {
    mag: Option<f64>,
    place: Option<String>,
    time: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct Geometry {
    coordinates: Vec<f64>,
}

async fn fetch(client: Client) -> anyhow::Result<Vec<openatlas_core::WorldEvent>> {
    let payload: Feed = fetch_json(&client, "usgs", SOURCE_URL).await?;
    let mut drafts = Vec::new();
    for feature in payload.features.into_iter().take(MAX_EVENTS) {
        let Some(timestamp_ms) = feature.properties.time else {
            continue;
        };
        let Some(timestamp) = parse_epoch_millis(timestamp_ms) else {
            continue;
        };
        if feature.geometry.coordinates.len() < 2 {
            continue;
        }
        let lon = feature.geometry.coordinates[0];
        let lat = feature.geometry.coordinates[1];
        let Ok(location) = location_from_coords(lat, lon, vec!["usgs".to_owned()]) else {
            continue;
        };
        let magnitude = feature.properties.mag.unwrap_or(0.0);
        let severity = ratio_severity(magnitude, MAG_SATURATION);
        let draft = ObservationDraft::new(feature.id.clone(), timestamp, Domain::Seismic, severity)
            .field("magnitude", magnitude)
            .field("place", feature.properties.place.unwrap_or_default());
        if let Ok(d) = draft.with_location(location) {
            drafts.push(d);
        }
    }
    Ok(drafts_to_events("usgs", SOURCE_URL, drafts))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fixture() {
        let body = include_str!("../../tests/fixtures/usgs_hour.json");
        let feed: Feed = serde_json::from_str(body).expect("fixture");
        assert!(!feed.features.is_empty());
        let f = &feed.features[0];
        assert!(!f.id.is_empty());
    }
}
