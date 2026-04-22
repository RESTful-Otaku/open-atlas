//! OpenSky Network — live aircraft state vectors.
//!
//! # Rate-limit budget (verified 2026-04)
//!
//! Anonymous users get **400 credits/day** total for `/states/*`, and a
//! global `/states/all` query costs **4 credits/call**. That is exactly
//! `400 / 4 = 100` calls/day = 1 call per 864 seconds. We poll every
//! **900 s (15 min)** to stay safely under budget (≈96 calls/day) with
//! headroom for retries after transient failures. Authenticated OAuth2
//! clients can reduce this interval; see docs.
//!
//! Source: <https://openskynetwork.github.io/opensky-api/rest.html#limitations>.

use std::time::Duration;

use chrono::{TimeZone, Utc};
use openatlas_core::{Domain, Location, WorldEvent};
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};

use super::{adapter::FeedDescriptor, deterministic_event_id};

const POLL_INTERVAL: Duration = Duration::from_secs(900);
const SOURCE_URL: &str = "https://opensky-network.org/";

pub(super) const DESCRIPTOR: FeedDescriptor = FeedDescriptor {
    name: "opensky",
    source_url: SOURCE_URL,
    poll_interval: POLL_INTERVAL,
    requires_env: None,
    fetch: |client| Box::pin(fetch(client)),
};

/// Maximum states ingested per cycle. OpenSky returns thousands of vectors;
/// we sample a fixed set to keep event volume deterministic.
const SAMPLE_SIZE: usize = 40;

/// Typical jet cruise altitude (m) at which severity saturates.
const CRUISE_ALTITUDE_M: f64 = 12_000.0;
/// Typical cruise velocity (m/s) at which severity saturates.
const CRUISE_VELOCITY_MPS: f64 = 300.0;

#[derive(Debug, Deserialize)]
struct Response {
    time: i64,
    states: Option<Vec<Vec<Value>>>,
}

async fn fetch(client: Client) -> anyhow::Result<Vec<WorldEvent>> {
    let payload = client
        .get("https://opensky-network.org/api/states/all")
        .send()
        .await?
        .error_for_status()?
        .json::<Response>()
        .await?;

    let timestamp = Utc
        .timestamp_opt(payload.time, 0)
        .single()
        .unwrap_or_else(Utc::now);

    let Some(states) = payload.states else {
        return Ok(Vec::new());
    };

    let sample_size = SAMPLE_SIZE.min(states.len());
    let stride = if sample_size == 0 {
        1
    } else {
        (states.len() / sample_size).max(1)
    };
    let mut events = Vec::with_capacity(sample_size);

    for (idx, state) in states.iter().enumerate().step_by(stride).take(sample_size) {
        let icao24 = state.first().and_then(|v| v.as_str()).unwrap_or("unknown");
        let callsign = state
            .get(1)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .unwrap_or("");
        let origin_country = state.get(2).and_then(|v| v.as_str()).unwrap_or("unknown");
        let lon = state.get(5).and_then(|v| v.as_f64());
        let lat = state.get(6).and_then(|v| v.as_f64());
        let baro_altitude = state.get(7).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let velocity = state.get(9).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let on_ground = state.get(8).and_then(|v| v.as_bool()).unwrap_or(false);

        let (Some(lat), Some(lon)) = (lat, lon) else {
            continue;
        };
        if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) {
            continue;
        }

        let altitude_norm = (baro_altitude / CRUISE_ALTITUDE_M).clamp(0.0, 1.0);
        let velocity_norm = (velocity / CRUISE_VELOCITY_MPS).clamp(0.0, 1.0);
        let mut severity_score = (altitude_norm * 0.4 + velocity_norm * 0.6).clamp(0.0, 1.0);
        if on_ground {
            severity_score *= 0.2;
        }
        let external_key = format!("{icao24}-{}-{idx}", timestamp.timestamp() / 60);

        events.push(WorldEvent {
            id: deterministic_event_id("opensky", &external_key),
            timestamp,
            domain: Domain::Transport,
            location: Some(Location {
                lat,
                lon,
                region_tags: vec!["opensky".to_owned(), origin_country.to_owned()],
            }),
            severity_score,
            payload: json!({
                "source": "opensky",
                "source_url": SOURCE_URL,
                "icao24": icao24,
                "callsign": callsign,
                "origin_country": origin_country,
                "baro_altitude_m": baro_altitude,
                "velocity_mps": velocity,
                "on_ground": on_ground
            }),
        });
    }
    Ok(events)
}
