//! USGS Earthquake Hazards — all earthquakes in the past hour (GeoJSON).
//! Public feed, no auth, ~1 MiB/response.

use std::time::Duration;

use chrono::{DateTime, Utc};
use openatlas_core::{Domain, Location, WorldEvent};
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;

use super::{adapter::FeedDescriptor, deterministic_event_id};

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

/// Maximum quakes ingested per cycle. USGS returns everything in the last
/// hour; we cap to keep downstream processing bounded.
const MAX_EVENTS: usize = 80;

/// Richter magnitude saturation point for severity normalisation. 10 is the
/// theoretical ceiling; anything at or above maps to 1.0 severity.
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

async fn fetch(client: Client) -> anyhow::Result<Vec<WorldEvent>> {
    let payload = client
        .get(SOURCE_URL)
        .send()
        .await?
        .error_for_status()?
        .json::<Feed>()
        .await?;

    let mut events = Vec::new();
    for feature in payload.features.into_iter().take(MAX_EVENTS) {
        let Some(timestamp_ms) = feature.properties.time else {
            continue;
        };
        let Some(timestamp) = DateTime::<Utc>::from_timestamp_millis(timestamp_ms) else {
            continue;
        };
        if feature.geometry.coordinates.len() < 2 {
            continue;
        }
        let lon = feature.geometry.coordinates[0];
        let lat = feature.geometry.coordinates[1];
        let magnitude = feature.properties.mag.unwrap_or(0.0);
        let severity_score = (magnitude / MAG_SATURATION).clamp(0.0, 1.0);

        events.push(WorldEvent {
            id: deterministic_event_id("usgs", &feature.id),
            timestamp,
            domain: Domain::Seismic,
            location: Some(Location {
                lat,
                lon,
                region_tags: vec!["usgs".to_owned()],
            }),
            severity_score,
            payload: json!({
                "source": "usgs",
                "source_url": SOURCE_URL,
                "magnitude": magnitude,
                "place": feature.properties.place,
                "external_id": feature.id
            }),
        });
    }
    Ok(events)
}
