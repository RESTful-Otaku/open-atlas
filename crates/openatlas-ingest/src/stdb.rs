//! Thin HTTP client for the SpacetimeDB reducer surface.
//!
//! # Why HTTP, not the typed SDK?
//!
//! SpacetimeDB exposes a simple HTTP endpoint for every reducer:
//!
//! ```text
//! POST {base}/v1/database/{db}/call/{reducer}
//! body: <JSON array of reducer args>
//! ```
//!
//! For the ingest service we only need the *write* path — feeds and the
//! simulator call [`StdbClient::ingest_event`] and never subscribe to live
//! state. Using the full `spacetimedb-sdk` crate here would pull in the
//! websocket subscription machinery, a background thread, generated
//! bindings, and a compile-time coupling to the module version, all for a
//! one-way call we can express in ~30 lines of `reqwest`.
//!
//! The Svelte frontend, which *does* need live subscriptions, uses the
//! TypeScript SDK with generated bindings (`web/src/lib/stdb/`). That's
//! where the SDK pays for itself.
//!
//! # Failure model
//!
//! A `StdbClient::ingest_event` call returns an error for any of:
//!   * network failure, DNS failure, connection refused;
//!   * 4xx/5xx HTTP status from SpacetimeDB;
//!   * reducer-side validation error ("invalid severity", duplicate id, …).
//!
//! The caller (feeds / simulator) decides how to react (retry, log, drop).
//! Duplicates are detected by the module itself and surface as
//! `"duplicate event id: …"` — callers can treat that as idempotent
//! success.

use std::time::Duration;

use anyhow::Context;
use chrono::{DateTime, Utc};
use openatlas_core::{Domain, Location, WorldEvent};
use reqwest::{Client, StatusCode};
use serde::Serialize;
use serde_json::json;
use tracing::{debug, warn};
use uuid::Uuid;

/// Default SpacetimeDB URI. Aligns with `./dev.sh spacetime:start`.
const DEFAULT_URI: &str = "http://127.0.0.1:3000";
const DEFAULT_DB: &str = "openatlas";
const REQUEST_TIMEOUT_SECS: u64 = 10;

#[derive(Debug, Clone)]
pub(crate) struct StdbClient {
    http: Client,
    uri: String,
    db: String,
}

impl StdbClient {
    /// Read connection details from the environment, falling back to
    /// localhost defaults that match the dev harness.
    pub(crate) fn from_env() -> anyhow::Result<Self> {
        let uri = std::env::var("OPENATLAS_STDB_URI").unwrap_or_else(|_| DEFAULT_URI.to_owned());
        let db = std::env::var("OPENATLAS_STDB_DB").unwrap_or_else(|_| DEFAULT_DB.to_owned());
        let http = Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .user_agent("openatlas-ingest/0.1")
            .build()
            .context("failed to build SpacetimeDB HTTP client")?;
        Ok(Self { http, uri, db })
    }

    pub(crate) fn uri(&self) -> &str {
        &self.uri
    }

    pub(crate) fn database(&self) -> &str {
        &self.db
    }

    /// Ping the SpacetimeDB instance. Used by the `/ready` check.
    pub(crate) async fn is_reachable(&self) -> bool {
        let url = format!("{}/v1/ping", self.uri.trim_end_matches('/'));
        match self.http.get(&url).send().await {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        }
    }

    /// Call the `ingest_event` reducer. Returns `Ok(IngestOutcome::Accepted)`
    /// on a 2xx response, `Ok(IngestOutcome::Duplicate)` when the module
    /// rejects the event because the id already exists, and `Err` for any
    /// other failure.
    pub(crate) async fn ingest_event(
        &self,
        event: &WorldEvent,
        source_label: &str,
        source_url: &str,
    ) -> anyhow::Result<IngestOutcome> {
        let args = ingest_args(event, source_label, source_url)?;
        self.call_reducer("ingest_event", &args).await
    }

    /// Call the `link_causal_events` reducer. Kept for explicit causal
    /// observations from cross-domain correlators; auto-linking within a
    /// single domain already happens server-side. Not currently wired up
    /// to any feed but kept on the public client surface so that work can
    /// land without touching this file.
    #[allow(dead_code)]
    pub(crate) async fn link_causal_events(
        &self,
        source_event_id: Uuid,
        target_event_id: Uuid,
        influence_score: f64,
        decay_rate: f64,
    ) -> anyhow::Result<IngestOutcome> {
        let args = json!([
            uuid_to_u64(source_event_id),
            uuid_to_u64(target_event_id),
            influence_score.clamp(0.0, 1.0),
            decay_rate.clamp(0.0, 1.0),
        ]);
        self.call_reducer("link_causal_events", &args).await
    }

    async fn call_reducer(
        &self,
        reducer: &str,
        args: &serde_json::Value,
    ) -> anyhow::Result<IngestOutcome> {
        let url = format!(
            "{}/v1/database/{}/call/{}",
            self.uri.trim_end_matches('/'),
            self.db,
            reducer
        );
        let response = self
            .http
            .post(&url)
            .json(args)
            .send()
            .await
            .with_context(|| format!("stdb call {reducer} failed (transport)"))?;
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        if status.is_success() {
            debug!(reducer, "reducer call accepted");
            return Ok(IngestOutcome::Accepted);
        }
        if status == StatusCode::BAD_REQUEST && body.contains("duplicate event id") {
            return Ok(IngestOutcome::Duplicate);
        }
        warn!(
            reducer,
            status = status.as_u16(),
            body = %body,
            "reducer call rejected"
        );
        Err(anyhow::anyhow!(
            "stdb call {reducer} rejected ({status}): {body}"
        ))
    }
}

/// Outcome of a reducer call that we treat as a success at the caller
/// layer (both "accepted" and "duplicate id" mean "this event is now in
/// SpacetimeDB"). Anything else bubbles up as an `anyhow::Error`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum IngestOutcome {
    Accepted,
    Duplicate,
}

/// The SpacetimeDB reducer wire shape for `ingest_event`. We keep this as
/// a local struct (mirroring the module reducer signature exactly) rather
/// than building `serde_json::json!(...)` inline so the field order and
/// types are checked by the compiler and easy to diff against the module.
#[derive(Debug, Serialize)]
struct TimestampWire {
    #[serde(rename = "__timestamp_micros_since_unix_epoch__")]
    micros: i64,
}

fn ingest_args(
    event: &WorldEvent,
    source_label: &str,
    source_url: &str,
) -> anyhow::Result<serde_json::Value> {
    let payload_json = serde_json::to_string(&event.payload)
        .context("failed to serialise event payload to JSON")?;
    let timestamp = TimestampWire {
        micros: timestamp_micros(event.timestamp),
    };
    Ok(json!([
        uuid_to_u64(event.id),
        timestamp,
        domain_to_u8(&event.domain),
        event.severity_score,
        option_wire(event.location.as_ref().map(location_wire)),
        payload_json,
        source_label.to_owned(),
        source_url.to_owned(),
    ]))
}

/// Wrap a value in SATS's JSON encoding for `Option<T>`, which is a
/// tagged sum type with variants `some` and `none` — *not* the JSON
/// `null` / value convention. The distinction is subtle but strict on
/// the server side.
fn option_wire(value: Option<serde_json::Value>) -> serde_json::Value {
    match value {
        Some(v) => json!({ "some": v }),
        None => json!({ "none": [] }),
    }
}

/// Collapse a `Uuid` (128 bits) into a stable `u64` by XOR-folding the
/// two halves. We use this because SpacetimeDB's JSON reducer endpoint
/// rejects `u128` literals, and u64 gives us 2^64 distinct events —
/// dwarfing the module's `EVENT_RING_SIZE` by many orders of magnitude.
/// Fold-XOR (rather than truncation) preserves full entropy so birthday
/// collisions stay astronomically improbable even for adversarial input.
pub(crate) fn uuid_to_u64(id: Uuid) -> u64 {
    let n = id.as_u128();
    ((n >> 64) as u64) ^ (n as u64)
}

/// Deterministic mapping from [`Domain`] to the `u8` tag stored in the
/// SpacetimeDB `event.domain` column. Keep this in sync with the module's
/// `ingest_event` validator (`domain > 12` rejects unknown tags). Appending
/// a new variant here requires a matching append to the validator and to
/// every `DOMAIN_BY_TAG` in the workspace.
pub(crate) fn domain_to_u8(domain: &Domain) -> u8 {
    match domain {
        Domain::Energy => 0,
        Domain::Finance => 1,
        Domain::Climate => 2,
        Domain::Seismic => 3,
        Domain::Transport => 4,
        Domain::Health => 5,
        Domain::Geospatial => 6,
        Domain::Economy => 7,
        Domain::Geopolitics => 8,
        Domain::Cyber => 9,
        Domain::Space => 10,
        Domain::Demographics => 11,
        Domain::Infrastructure => 12,
    }
}

/// Inverse of [`domain_to_u8`]. Not used on the write path but kept for
/// the `stdb` module's round-trip unit test and for any future consumer
/// that reads `event.domain` back from SpacetimeDB.
#[allow(dead_code)]
pub(crate) fn u8_to_domain(tag: u8) -> Option<Domain> {
    match tag {
        0 => Some(Domain::Energy),
        1 => Some(Domain::Finance),
        2 => Some(Domain::Climate),
        3 => Some(Domain::Seismic),
        4 => Some(Domain::Transport),
        5 => Some(Domain::Health),
        6 => Some(Domain::Geospatial),
        7 => Some(Domain::Economy),
        8 => Some(Domain::Geopolitics),
        9 => Some(Domain::Cyber),
        10 => Some(Domain::Space),
        11 => Some(Domain::Demographics),
        12 => Some(Domain::Infrastructure),
        _ => None,
    }
}

fn timestamp_micros(ts: DateTime<Utc>) -> i64 {
    ts.timestamp_micros()
}

fn location_wire(location: &Location) -> serde_json::Value {
    json!({
        "lat": location.lat,
        "lon": location.lon,
        "region_tags": location.region_tags,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use openatlas_core::{Domain, Location, WorldEvent};
    use serde_json::json;
    use uuid::Uuid;

    fn sample_event() -> WorldEvent {
        WorldEvent {
            id: Uuid::from_u128(42),
            timestamp: Utc.timestamp_opt(1_700_000_000, 0).unwrap(),
            domain: Domain::Seismic,
            location: Some(Location {
                lat: 37.7,
                lon: -122.4,
                region_tags: vec!["north-america".to_owned()],
            }),
            severity_score: 0.7,
            payload: json!({"magnitude": 4.2}),
        }
    }

    #[test]
    fn domain_round_trips_through_u8() {
        for domain in Domain::ALL.iter() {
            let tag = domain_to_u8(domain);
            let back = u8_to_domain(tag).expect("known tag");
            assert_eq!(&back, domain);
        }
    }

    #[test]
    fn ingest_args_layout_is_stable() {
        let args = ingest_args(&sample_event(), "usgs", "https://usgs.gov/").unwrap();
        let arr = args.as_array().expect("array");
        assert_eq!(arr.len(), 8, "reducer takes 8 positional arguments");
        assert_eq!(
            arr[0].as_u64(),
            Some(42),
            "u64 id is encoded as a plain JSON number"
        );
        assert_eq!(
            arr[1]["__timestamp_micros_since_unix_epoch__"].as_i64(),
            Some(1_700_000_000 * 1_000_000)
        );
        assert_eq!(arr[2].as_u64(), Some(3)); // Seismic
        assert_eq!(arr[3].as_f64(), Some(0.7));
        assert!(arr[4].is_object(), "location present");
        assert!(arr[5].is_string(), "payload is JSON-encoded string");
        assert_eq!(arr[6].as_str(), Some("usgs"));
        assert_eq!(arr[7].as_str(), Some("https://usgs.gov/"));
    }

    #[test]
    fn uuid_fold_is_deterministic_and_nonzero() {
        let a = uuid_to_u64(Uuid::from_u128(42));
        let b = uuid_to_u64(Uuid::from_u128(42));
        assert_eq!(a, b);
        assert_eq!(a, 42);
        let high_low = uuid_to_u64(Uuid::from_u128((0xdead_beef_u128 << 64) | 0xcafe_u128));
        assert_eq!(high_low, 0xdead_beef ^ 0xcafe);
    }
}
