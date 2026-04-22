//! Open-Meteo current-weather snapshot for a fixed sample of metro regions.
//! No API key required; generous 10k/day anonymous quota.

use std::time::Duration;

use chrono::{DateTime, NaiveDateTime, Utc};
use openatlas_core::{Domain, Location, WorldEvent};
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;

use super::{adapter::FeedDescriptor, deterministic_event_id};

const POLL_INTERVAL: Duration = Duration::from_secs(60);
const SOURCE_URL: &str = "https://open-meteo.com/";

pub(super) const DESCRIPTOR: FeedDescriptor = FeedDescriptor {
    name: "open-meteo",
    source_url: SOURCE_URL,
    poll_interval: POLL_INTERVAL,
    requires_env: None,
    fetch: |client| Box::pin(fetch(client)),
};

struct Region {
    tag: &'static str,
    lat: f64,
    lon: f64,
}

/// Fixed rotating sample of globally significant metropolitan regions.
const REGIONS: &[Region] = &[
    Region {
        tag: "tokyo",
        lat: 35.6762,
        lon: 139.6503,
    },
    Region {
        tag: "new-york",
        lat: 40.7128,
        lon: -74.0060,
    },
    Region {
        tag: "london",
        lat: 51.5072,
        lon: -0.1276,
    },
    Region {
        tag: "sao-paulo",
        lat: -23.5505,
        lon: -46.6333,
    },
    Region {
        tag: "mumbai",
        lat: 19.0760,
        lon: 72.8777,
    },
    Region {
        tag: "lagos",
        lat: 6.5244,
        lon: 3.3792,
    },
];

/// Hurricane-equivalent wind speed at which severity saturates (km/h).
const WIND_SATURATION_KMH: f64 = 120.0;
/// Flood-equivalent precipitation at which severity saturates (mm/hour).
const PRECIP_SATURATION_MM: f64 = 30.0;

#[derive(Debug, Deserialize)]
struct Response {
    latitude: f64,
    longitude: f64,
    current: Option<Current>,
}

#[derive(Debug, Deserialize)]
struct Current {
    time: String,
    temperature_2m: Option<f64>,
    wind_speed_10m: Option<f64>,
    precipitation: Option<f64>,
}

async fn fetch(client: Client) -> anyhow::Result<Vec<WorldEvent>> {
    let mut events = Vec::new();
    for region in REGIONS.iter() {
        let url = format!(
            "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,wind_speed_10m,precipitation",
            lat = region.lat,
            lon = region.lon,
        );
        let payload = client
            .get(url)
            .send()
            .await?
            .error_for_status()?
            .json::<Response>()
            .await?;

        let Some(current) = payload.current else {
            continue;
        };
        let timestamp = NaiveDateTime::parse_from_str(&current.time, "%Y-%m-%dT%H:%M")
            .ok()
            .map(|naive| DateTime::from_naive_utc_and_offset(naive, Utc))
            .unwrap_or_else(Utc::now);
        let wind = current.wind_speed_10m.unwrap_or(0.0);
        let precipitation = current.precipitation.unwrap_or(0.0);
        let severity_score =
            ((wind / WIND_SATURATION_KMH) + (precipitation / PRECIP_SATURATION_MM)).clamp(0.0, 1.0);
        let external_key = format!("{}-{}", region.tag, current.time);

        events.push(WorldEvent {
            id: deterministic_event_id("open-meteo", &external_key),
            timestamp,
            domain: Domain::Climate,
            location: Some(Location {
                lat: payload.latitude,
                lon: payload.longitude,
                region_tags: vec![region.tag.to_owned(), "open-meteo".to_owned()],
            }),
            severity_score,
            payload: json!({
                "source": "open-meteo",
                "source_url": SOURCE_URL,
                "temperature_2m": current.temperature_2m,
                "wind_speed_10m": current.wind_speed_10m,
                "precipitation": current.precipitation,
                "region": region.tag
            }),
        });
    }
    Ok(events)
}
