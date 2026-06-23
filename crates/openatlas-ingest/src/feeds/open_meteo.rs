

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
    #[serde(default)]
    utc_offset_seconds: Option<i64>,
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
        let utc_offset_seconds = payload.utc_offset_seconds.unwrap_or(0);
        let Ok(naive) = NaiveDateTime::parse_from_str(&current.time, "%Y-%m-%dT%H:%M") else {
            continue;
        };
        let timestamp =
            DateTime::from_naive_utc_and_offset(naive, Utc)
                - chrono::Duration::seconds(utc_offset_seconds);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::feeds::normalize::{drafts_to_events, location_from_coords, ObservationDraft};

    #[allow(clippy::too_many_arguments)]
    fn make_region_draft(
        tag: &str,
        lat: f64,
        lon: f64,
        wind: f64,
        precip: f64,
        temp: f64,
        time: &str,
        timestamp: DateTime<Utc>,
    ) -> ObservationDraft {
        let severity = (ratio_severity(wind, WIND_SATURATION_KMH)
            + ratio_severity(precip, PRECIP_SATURATION_MM))
        .clamp(0.0, 1.0);
        let external_key = format!("{}-{}", tag, time);
        let location = location_from_coords(lat, lon, vec![tag.to_owned(), "open-meteo".to_owned()])
            .expect("valid location");
        ObservationDraft::new(external_key, timestamp, Domain::Climate, severity)
            .field("temperature_2m", temp)
            .field("wind_speed_10m", wind)
            .field("precipitation", precip)
            .field("region", tag)
            .with_location(location)
            .expect("location should be valid")
    }

    #[test]
    fn golden_data_event_has_climate_domain() {
        let ts = DateTime::from_naive_utc_and_offset(
            NaiveDateTime::parse_from_str("2024-06-15T14:00", "%Y-%m-%dT%H:%M").unwrap(),
            Utc,
        );
        let draft = make_region_draft("tokyo", 35.6762, 139.6503, 12.0, 0.0, 28.5, "2024-06-15T14:00", ts);
        let events = drafts_to_events("open-meteo", SOURCE_URL, vec![draft]);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].domain, Domain::Climate);
    }

    #[test]
    fn golden_data_event_has_location() {
        let ts = DateTime::from_naive_utc_and_offset(
            NaiveDateTime::parse_from_str("2024-06-15T14:00", "%Y-%m-%dT%H:%M").unwrap(),
            Utc,
        );
        let draft = make_region_draft("new-york", 40.7128, -74.0060, 8.0, 0.5, 22.0, "2024-06-15T14:00", ts);
        let events = drafts_to_events("open-meteo", SOURCE_URL, vec![draft]);
        let event = &events[0];
        assert!(event.location.is_some());
        let loc = event.location.as_ref().unwrap();
        assert!((loc.lat - 40.7128).abs() < 0.001);
        assert!((loc.lon - (-74.0060)).abs() < 0.001);
    }

    #[test]
    fn golden_data_severity_bounds() {
        let ts = DateTime::from_naive_utc_and_offset(
            NaiveDateTime::parse_from_str("2024-06-15T14:00", "%Y-%m-%dT%H:%M").unwrap(),
            Utc,
        );
        let drafts = vec![
            make_region_draft("tokyo", 35.6762, 139.6503, 120.0, 30.0, 28.0, "2024-06-15T14:00", ts),
            make_region_draft("london", 51.5072, -0.1276, 5.0, 0.0, 15.0, "2024-06-15T14:00", ts),
            make_region_draft("sao-paulo", -23.5505, -46.6333, 60.0, 10.0, 32.0, "2024-06-15T14:00", ts),
        ];
        let events = drafts_to_events("open-meteo", SOURCE_URL, drafts);
        for event in &events {
            assert!(
                (0.0..=1.0).contains(&event.severity_score),
                "severity {} out of [0, 1]",
                event.severity_score
            );
        }
    }
}
