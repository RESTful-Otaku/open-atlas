//! Open-Meteo current-weather snapshot for a fixed sample of metro regions.

use std::time::Duration;

use chrono::{DateTime, NaiveDateTime, Utc};
use openatlas_core::Domain;
use reqwest::Client;
use serde::Deserialize;

use super::{
    adapter::FeedDescriptor,
    http::fetch_json,
    normalize::{drafts_to_events, location_from_coords, ratio_severity, ObservationDraft},
};

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

const WIND_SATURATION_KMH: f64 = 120.0;
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

async fn fetch(client: Client) -> anyhow::Result<Vec<openatlas_core::WorldEvent>> {
    let mut drafts = Vec::new();
    for region in REGIONS.iter() {
        let url = format!(
            "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,wind_speed_10m,precipitation",
            lat = region.lat,
            lon = region.lon,
        );
        let payload: Response = match fetch_json(&client, "open-meteo", &url).await {
            Ok(p) => p,
            Err(_) => continue,
        };

        let Some(current) = payload.current else {
            continue;
        };
        let Ok(naive) = NaiveDateTime::parse_from_str(&current.time, "%Y-%m-%dT%H:%M") else {
            continue;
        };
        let timestamp = DateTime::from_naive_utc_and_offset(naive, Utc);
        let wind = current.wind_speed_10m.unwrap_or(0.0);
        let precipitation = current.precipitation.unwrap_or(0.0);
        let severity_score = (ratio_severity(wind, WIND_SATURATION_KMH)
            + ratio_severity(precipitation, PRECIP_SATURATION_MM))
        .clamp(0.0, 1.0);
        let external_key = format!("{}-{}", region.tag, current.time);
        let Ok(location) = location_from_coords(
            payload.latitude,
            payload.longitude,
            vec![region.tag.to_owned(), "open-meteo".to_owned()],
        ) else {
            continue;
        };
        let draft = ObservationDraft::new(external_key, timestamp, Domain::Climate, severity_score)
            .field("temperature_2m", current.temperature_2m)
            .field("wind_speed_10m", current.wind_speed_10m)
            .field("precipitation", current.precipitation)
            .field("region", region.tag);
        if let Ok(d) = draft.with_location(location) {
            drafts.push(d);
        }
    }
    Ok(drafts_to_events("open-meteo", SOURCE_URL, drafts))
}
