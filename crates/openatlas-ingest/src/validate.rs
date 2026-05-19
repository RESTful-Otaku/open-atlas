//! Ingest-boundary validation — mirrors `openatlas-stdb-module::ingest_event`
//! rules so invalid events fail before the HTTP reducer call.

use anyhow::{bail, Context, Result};
use openatlas_core::{Location, WorldEvent};

/// Must match `openatlas-ingest::stdb::domain_to_u8` and module `domain > 12`.
pub const MAX_DOMAIN_TAG: u8 = 12;

/// Reject pathological provider JSON blobs (aligned with STDB module cap).
pub const MAX_PAYLOAD_BYTES: usize = 8_192;

/// Validates a [`WorldEvent`] against STDB + core invariants.
pub fn validate_event(event: &WorldEvent) -> Result<()> {
    if !event.severity_score.is_finite() || !(0.0..=1.0).contains(&event.severity_score) {
        bail!(
            "severity_score must be finite and in [0, 1], got {}",
            event.severity_score
        );
    }
    if let Some(loc) = &event.location {
        validate_location(loc)?;
    }
    let payload_len = serde_json::to_string(&event.payload)
        .context("payload must serialize to JSON")?
        .len();
    if payload_len > MAX_PAYLOAD_BYTES {
        bail!(
            "payload_json exceeds {MAX_PAYLOAD_BYTES} bytes ({payload_len}) for event {}",
            event.id
        );
    }
    Ok(())
}

/// Drop invalid events and log counts (used by the feed supervisor).
pub fn filter_valid_events(events: Vec<WorldEvent>) -> (Vec<WorldEvent>, usize) {
    let mut out = Vec::with_capacity(events.len());
    let mut rejected = 0usize;
    for event in events {
        match validate_event(&event) {
            Ok(()) => out.push(event),
            Err(error) => {
                rejected += 1;
                tracing::warn!(
                    event_id = %event.id,
                    domain = ?event.domain,
                    "dropping invalid event before STDB: {error:#}"
                );
            }
        }
    }
    (out, rejected)
}

pub fn validate_location(loc: &Location) -> Result<()> {
    if !loc.lat.is_finite() || !loc.lon.is_finite() {
        bail!("location coordinates must be finite");
    }
    if !(-90.0..=90.0).contains(&loc.lat) {
        bail!("latitude out of range: {}", loc.lat);
    }
    if !(-180.0..=180.0).contains(&loc.lon) {
        bail!("longitude out of range: {}", loc.lon);
    }
    Ok(())
}

pub fn clamp_severity(raw: f64) -> f64 {
    if !raw.is_finite() {
        return 0.0;
    }
    raw.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use openatlas_core::Domain;
    use serde_json::json;
    use uuid::Uuid;

    fn sample() -> WorldEvent {
        WorldEvent {
            id: Uuid::new_v4(),
            timestamp: Utc::now(),
            domain: Domain::Seismic,
            location: Some(Location {
                lat: 10.0,
                lon: 20.0,
                region_tags: vec![],
            }),
            severity_score: 0.5,
            payload: json!({"source": "test"}),
        }
    }

    #[test]
    fn rejects_bad_severity() {
        let mut e = sample();
        e.severity_score = 1.5;
        assert!(validate_event(&e).is_err());
    }

    #[test]
    fn rejects_bad_location() {
        let mut e = sample();
        e.location = Some(Location {
            lat: 99.0,
            lon: 0.0,
            region_tags: vec![],
        });
        assert!(validate_event(&e).is_err());
    }
}
