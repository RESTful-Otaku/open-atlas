//! OpenSky Network — live aircraft state vectors.
//!
//! State vector column order is fixed by the OpenSky REST API; see
//! <https://openskynetwork.github.io/opensky-api/rest.html#all-state-vectors>.

use std::time::Duration;

use chrono::Utc;
use openatlas_core::Domain;
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;

use super::{
    adapter::FeedDescriptor,
    http::fetch_json,
    normalize::{
        drafts_to_events, location_from_coords, parse_epoch_secs, ratio_severity, ObservationDraft,
    },
};

const POLL_INTERVAL: Duration = Duration::from_secs(900);
const SOURCE_URL: &str = "https://opensky-network.org/";

pub(super) const DESCRIPTOR: FeedDescriptor = FeedDescriptor {
    name: "opensky",
    source_url: SOURCE_URL,
    poll_interval: POLL_INTERVAL,
    requires_env: None,
    fetch: |client| Box::pin(fetch(client)),
};

const SAMPLE_SIZE: usize = 40;
const CRUISE_ALTITUDE_M: f64 = 12_000.0;
const CRUISE_VELOCITY_MPS: f64 = 300.0;

/// OpenSky state vector indices (API v1).
mod idx {
    pub const ICAO24: usize = 0;
    pub const CALLSIGN: usize = 1;
    pub const ORIGIN_COUNTRY: usize = 2;
    pub const TIME_POSITION: usize = 3;
    pub const LONGITUDE: usize = 5;
    pub const LATITUDE: usize = 6;
    pub const BARO_ALTITUDE: usize = 7;
    pub const ON_GROUND: usize = 8;
    pub const VELOCITY: usize = 9;
    pub const TRUE_TRACK: usize = 10;
}

#[derive(Debug, Deserialize)]
struct Response {
    time: i64,
    states: Option<Vec<Vec<Value>>>,
}

struct ParsedState {
    icao24: String,
    callsign: String,
    origin_country: String,
    lon: f64,
    lat: f64,
    baro_altitude: f64,
    velocity: f64,
    true_track: Option<f64>,
    on_ground: bool,
    time_position: Option<i64>,
}

fn parse_state(row: &[Value]) -> Option<ParsedState> {
    if row.len() <= idx::TRUE_TRACK {
        return None;
    }
    let icao24 = row[idx::ICAO24].as_str()?.to_owned();
    let callsign = row[idx::CALLSIGN]
        .as_str()
        .map(str::trim)
        .unwrap_or("")
        .to_owned();
    let origin_country = row[idx::ORIGIN_COUNTRY]
        .as_str()
        .unwrap_or("unknown")
        .to_owned();
    let lon = row[idx::LONGITUDE].as_f64()?;
    let lat = row[idx::LATITUDE].as_f64()?;
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) {
        return None;
    }
    Some(ParsedState {
        icao24,
        callsign,
        origin_country,
        lon,
        lat,
        baro_altitude: row[idx::BARO_ALTITUDE].as_f64().unwrap_or(0.0),
        velocity: row[idx::VELOCITY].as_f64().unwrap_or(0.0),
        true_track: row[idx::TRUE_TRACK].as_f64(),
        on_ground: row[idx::ON_GROUND].as_bool().unwrap_or(false),
        time_position: row[idx::TIME_POSITION].as_i64(),
    })
}

async fn fetch(client: Client) -> anyhow::Result<Vec<openatlas_core::WorldEvent>> {
    let payload: Response = fetch_json(
        &client,
        "opensky",
        "https://opensky-network.org/api/states/all",
    )
    .await?;

    let batch_time = parse_epoch_secs(payload.time).unwrap_or_else(Utc::now);
    let Some(states) = payload.states else {
        return Ok(Vec::new());
    };

    let sample_size = SAMPLE_SIZE.min(states.len());
    let stride = if sample_size == 0 {
        1
    } else {
        (states.len() / sample_size).max(1)
    };

    let mut drafts = Vec::with_capacity(sample_size);
    for (idx, row) in states.iter().enumerate().step_by(stride).take(sample_size) {
        let Some(s) = parse_state(row) else {
            continue;
        };
        let observed_at = s
            .time_position
            .and_then(parse_epoch_secs)
            .unwrap_or(batch_time);
        let altitude_norm = ratio_severity(s.baro_altitude, CRUISE_ALTITUDE_M);
        let velocity_norm = ratio_severity(s.velocity, CRUISE_VELOCITY_MPS);
        let mut severity = (altitude_norm * 0.4 + velocity_norm * 0.6).clamp(0.0, 1.0);
        if s.on_ground {
            severity *= 0.2;
        }
        let external_key = format!("{}-{}", s.icao24, observed_at.timestamp());
        let Ok(location) = location_from_coords(
            s.lat,
            s.lon,
            vec!["opensky".to_owned(), s.origin_country.clone()],
        ) else {
            continue;
        };
        let draft = ObservationDraft::new(external_key, observed_at, Domain::Transport, severity)
            .field("icao24", s.icao24.clone())
            .field("callsign", s.callsign.clone())
            .field("origin_country", s.origin_country.clone())
            .field("baro_altitude_m", s.baro_altitude)
            .field("velocity_mps", s.velocity)
            .field("on_ground", s.on_ground)
            .field("true_track_deg", s.true_track);
        if let Ok(d) = draft.with_location(location) {
            drafts.push(d);
        }
        let _ = idx;
    }
    Ok(drafts_to_events("opensky", SOURCE_URL, drafts))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_state_vector_row() {
        let row = serde_json::json!([
            "abc123",
            "UAL123  ",
            "United States",
            1_700_000_000_i64,
            1_700_000_000_i64,
            -122.4,
            37.7,
            10_000.0,
            false,
            250.0,
            90.0,
            null,
            null,
            null,
            0_i64,
            0.0,
            0_i64
        ]);
        let vals = row.as_array().unwrap().clone();
        let parsed = parse_state(&vals).expect("parse");
        assert_eq!(parsed.icao24, "abc123");
        assert!((parsed.lat - 37.7).abs() < f64::EPSILON);
    }
}
