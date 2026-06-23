use std::time::Duration;

use chrono::{DateTime, Utc};
use openatlas_core::Domain;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};

use super::{
    adapter::FeedDescriptor,
    http::fetch_json,
    normalize::{drafts_to_events, location_from_coords, ObservationDraft},
};

const POLL_INTERVAL: Duration = Duration::from_secs(180);
const SOURCE_URL: &str = "https://eonet.gsfc.nasa.gov/";

pub(super) const DESCRIPTOR: FeedDescriptor = FeedDescriptor {
    name: "nasa-eonet",
    source_url: SOURCE_URL,
    poll_interval: POLL_INTERVAL,
    requires_env: None,
    fetch: |client| Box::pin(fetch(client)),
};

const MAX_EVENTS: usize = 80;

#[derive(Debug, Deserialize)]
struct Response {
    events: Vec<EonetEvent>,
}

#[derive(Debug, Deserialize)]
struct EonetEvent {
    id: String,
    title: String,
    #[serde(default)]
    categories: Vec<Category>,
    #[serde(default)]
    geometry: Vec<Geometry>,
    #[serde(default)]
    sources: Vec<Source>,
}

#[derive(Debug, Deserialize)]
struct Category {
    id: String,
    title: String,
}

#[derive(Debug, Deserialize)]
struct Geometry {
    date: String,
    #[serde(rename = "type")]
    kind: String,
    coordinates: Value,
    #[serde(rename = "magnitudeValue", default)]
    magnitude_value: Option<f64>,
    #[serde(rename = "magnitudeUnit", default)]
    magnitude_unit: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Source {
    id: String,
    url: String,
}

async fn fetch(client: Client) -> anyhow::Result<Vec<openatlas_core::WorldEvent>> {
    let url = format!("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit={MAX_EVENTS}");
    let payload: Response = fetch_json(&client, "nasa-eonet", &url).await?;

    let drafts = payload
        .events
        .into_iter()
        .take(MAX_EVENTS)
        .filter_map(parse_eonet_event);
    Ok(drafts_to_events("nasa-eonet", SOURCE_URL, drafts))
}

fn parse_eonet_event(eonet_event: EonetEvent) -> Option<ObservationDraft> {
    let latest = eonet_event.geometry.last()?;
    if latest.kind != "Point" {
        return None;
    }
    let (lon, lat) = extract_point(&latest.coordinates)?;
    let timestamp = DateTime::parse_from_rfc3339(&latest.date)
        .ok()?
        .with_timezone(&Utc);

    let category_id = eonet_event
        .categories
        .first()
        .map(|cat| cat.id.as_str())
        .unwrap_or("unknown");
    let category_title = eonet_event
        .categories
        .first()
        .map(|cat| cat.title.clone())
        .unwrap_or_else(|| "Unknown".to_owned());
    let domain = category_domain(category_id);
    let severity_score = severity(category_id, latest.magnitude_value);

    let location = location_from_coords(
        lat,
        lon,
        vec!["nasa-eonet".to_owned(), category_id.to_owned()],
    )
    .ok()?;

    let upstream_sources: Value = eonet_event
        .sources
        .iter()
        .map(|s| json!({"id": s.id, "url": s.url}))
        .collect::<Vec<_>>()
        .into();

    Some(
        ObservationDraft::new(eonet_event.id.clone(), timestamp, domain, severity_score)
            .with_location(location)
            .ok()?
            .field("title", eonet_event.title)
            .field("category_id", category_id)
            .field("category", category_title)
            .field("magnitude_value", latest.magnitude_value)
            .field("magnitude_unit", latest.magnitude_unit.clone())
            .field("external_id", eonet_event.id)
            .field("upstream_sources", upstream_sources),
    )
}

fn extract_point(value: &Value) -> Option<(f64, f64)> {
    let coords = value.as_array()?;
    let lon = coords.first()?.as_f64()?;
    let lat = coords.get(1)?.as_f64()?;
    Some((lon, lat))
}

fn category_domain(category_id: &str) -> Domain {
    match category_id {
        "volcanoes" | "earthquakes" => Domain::Seismic,
        "wildfires" | "severeStorms" | "floods" | "drought" | "snow" | "tempExtremes"
        | "seaLakeIce" | "dustHaze" => Domain::Climate,
        "landslides" | "waterColor" => Domain::Geospatial,
        "manmade" => Domain::Geopolitics,
        _ => Domain::Geospatial,
    }
}

fn severity(category_id: &str, magnitude: Option<f64>) -> f64 {
    if let Some(magnitude) = magnitude {
        return (magnitude / 10.0).clamp(0.0, 1.0);
    }
    match category_id {
        "wildfires" | "volcanoes" | "severeStorms" => 0.7,
        "floods" | "earthquakes" | "drought" => 0.6,
        "landslides" | "seaLakeIce" | "tempExtremes" => 0.5,
        "snow" | "dustHaze" | "waterColor" => 0.35,
        "manmade" => 0.55,
        _ => 0.4,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn category_maps_to_expected_domain() {
        assert_eq!(category_domain("volcanoes"), Domain::Seismic);
        assert_eq!(category_domain("wildfires"), Domain::Climate);
        assert_eq!(category_domain("landslides"), Domain::Geospatial);
        assert_eq!(category_domain("manmade"), Domain::Geopolitics);
        assert_eq!(category_domain("unknown-xyz"), Domain::Geospatial);
    }

    #[test]
    fn severity_stays_in_unit_interval() {
        assert!((0.0..=1.0).contains(&severity("wildfires", None)));
        assert!((0.0..=1.0).contains(&severity("wildfires", Some(25.0))));
        assert!((0.0..=1.0).contains(&severity("unknown", None)));
    }

    #[test]
    fn extract_point_parses_valid_and_rejects_invalid() {
        let ok = json!([10.0, -20.0]);
        assert_eq!(extract_point(&ok), Some((10.0, -20.0)));
        let bad = json!("oops");
        assert!(extract_point(&bad).is_none());
    }
}
