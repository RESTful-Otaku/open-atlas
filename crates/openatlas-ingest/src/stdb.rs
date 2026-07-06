//! Thin HTTP client for SpacetimeDB reducers.

use std::time::Duration;

use anyhow::Context;
use chrono::{DateTime, Utc};
use openatlas_core::{Domain, Location, WorldEvent};
use reqwest::Client;
use serde::Serialize;
use serde_json::json;
use tracing::{debug, warn};
use uuid::Uuid;

const DEFAULT_URI: &str = "http://127.0.0.1:3000";
const DEFAULT_DB: &str = "openatlas";
const REQUEST_TIMEOUT_SECS: u64 = 10;

const MAX_BATCH_REDUCER_SIZE: usize = 128;

#[derive(Debug, Clone)]
pub struct StdbClient {
    http: Client,
    uri: String,
    db: String,
}

impl StdbClient {
    pub fn from_env() -> anyhow::Result<Self> {
        let uri = std::env::var("OPENATLAS_STDB_URI").unwrap_or_else(|_| DEFAULT_URI.to_owned());
        let db = std::env::var("OPENATLAS_STDB_DB").unwrap_or_else(|_| DEFAULT_DB.to_owned());
        let http = Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .user_agent("openatlas-ingest/0.1")
            .build()
            .context("failed to build SpacetimeDB HTTP client")?;
        Ok(Self { http, uri, db })
    }

    pub fn uri(&self) -> &str {
        &self.uri
    }

    pub fn database(&self) -> &str {
        &self.db
    }

    pub(crate) async fn count_rows(&self, table: &str) -> Option<u64> {
        let url = format!(
            "{}/v1/database/{}/sql",
            self.uri.trim_end_matches('/'),
            self.db
        );
        let query = format!("SELECT COUNT(*) AS c FROM {table}");
        let response = self.http.post(&url).body(query).send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }
        let body: serde_json::Value = response.json().await.ok()?;
        let rows = body.as_array()?;
        let first = rows.first()?;
        let row = first.get("rows")?.as_array()?.first()?.as_array()?;
        row.first()?.as_u64()
    }

    pub async fn is_reachable(&self) -> bool {
        let url = format!("{}/v1/ping", self.uri.trim_end_matches('/'));
        match self.http.get(&url).send().await {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        }
    }

    pub(crate) async fn ingest_event(
        &self,
        event: &WorldEvent,
        source_label: &str,
        source_url: &str,
    ) -> anyhow::Result<IngestOutcome> {
        crate::validate::validate_event(event).context("event failed pre-flight validation")?;
        let args = ingest_args(event, source_label, source_url)?;
        self.call_reducer("ingest_event", &args).await
    }

    pub(crate) async fn ingest_events_batch(
        &self,
        events: &[WorldEvent],
        source_label: &str,
        source_url: &str,
    ) -> anyhow::Result<BatchIngestSummary> {
        if events.is_empty() {
            return Ok(BatchIngestSummary::default());
        }
        if events.len() > MAX_BATCH_REDUCER_SIZE {
            anyhow::bail!(
                "batch size {} exceeds reducer max {}",
                events.len(),
                MAX_BATCH_REDUCER_SIZE
            );
        }

        let mut wire_events = Vec::with_capacity(events.len());
        for event in events {
            crate::validate::validate_event(event)
                .with_context(|| format!("event {} failed pre-flight validation", event.id))?;
            wire_events.push(batch_event_wire(event)?);
        }

        let wire_json: Vec<serde_json::Value> = wire_events
            .iter()
            .map(serde_json::to_value)
            .collect::<Result<_, _>>()
            .context("serialise batch wire events")?;
        let args = json!([wire_json, source_label.to_owned(), source_url.to_owned(),]);
        self.call_reducer_batch("ingest_events_batch", &args, events.len())
            .await
    }

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

    async fn call_reducer_raw(
        &self,
        reducer: &str,
        args: &serde_json::Value,
    ) -> anyhow::Result<(reqwest::StatusCode, String)> {
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
        let body = match response.text().await {
            Ok(text) => text,
            Err(e) => {
                tracing::warn!("failed to read STDB response body: {e}");
                String::new()
            }
        };
        Ok((status, body))
    }

    async fn call_reducer_batch(
        &self,
        reducer: &str,
        args: &serde_json::Value,
        event_count: usize,
    ) -> anyhow::Result<BatchIngestSummary> {
        let (status, body) = self.call_reducer_raw(reducer, args).await?;
        if status.is_success() {
            debug!(reducer, count = event_count, "batch reducer accepted");
            return Ok(BatchIngestSummary {
                accepted: event_count as u32,
                duplicates: 0,
                rejected: 0,
            });
        }
        warn!(
            reducer,
            status = status.as_u16(),
            body = %body,
            "batch reducer rejected"
        );
        Err(anyhow::anyhow!(
            "stdb call {reducer} rejected ({status}): {body}"
        ))
    }

    async fn call_reducer(
        &self,
        reducer: &str,
        args: &serde_json::Value,
    ) -> anyhow::Result<IngestOutcome> {
        let (status, body) = self.call_reducer_raw(reducer, args).await?;
        if status.is_success() {
            debug!(reducer, "reducer call accepted");
            return Ok(IngestOutcome::Accepted);
        }
        // STDB returns business errors as non-2xx (often 530), body may be `{"error":"..."}`.
        let error_msg = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| {
                v.get("error")
                    .and_then(|e| e.as_str())
                    .map(|s| s.to_owned())
            })
            .unwrap_or_else(|| body.clone());
        if error_msg.contains("duplicate event id") {
            debug!(reducer, "duplicate event id (idempotent)");
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum IngestOutcome {
    Accepted,
    Duplicate,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct BatchIngestSummary {
    pub accepted: u32,
    pub duplicates: u32,
    pub rejected: u32,
}

#[derive(Debug, Serialize)]
struct BatchEventWire {
    id: u64,
    timestamp: TimestampWire,
    domain: u8,
    severity_score: f64,
    location: serde_json::Value,
    payload_json: String,
}

#[derive(Debug, Serialize)]
struct TimestampWire {
    #[serde(rename = "__timestamp_micros_since_unix_epoch__")]
    micros: i64,
}

fn batch_event_wire(event: &WorldEvent) -> anyhow::Result<BatchEventWire> {
    let payload_json = serde_json::to_string(&event.payload)
        .context("failed to serialise event payload to JSON")?;
    Ok(BatchEventWire {
        id: uuid_to_u64(event.id),
        timestamp: TimestampWire {
            micros: timestamp_micros(event.timestamp),
        },
        domain: domain_to_u8(&event.domain),
        severity_score: event.severity_score,
        location: option_wire(event.location.as_ref().map(location_wire)),
        payload_json,
    })
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

/// SATS JSON encoding for `Option<T>`: `{"some": v}` or `{"none": []}`.
fn option_wire(value: Option<serde_json::Value>) -> serde_json::Value {
    match value {
        Some(v) => json!({ "some": v }),
        None => json!({ "none": [] }),
    }
}

/// XOR-fold a Uuid into a u64 (STDB JSON endpoint rejects u128).
pub(crate) fn uuid_to_u64(id: Uuid) -> u64 {
    let n = id.as_u128();
    ((n >> 64) as u64) ^ (n as u64)
}

pub(crate) fn domain_to_u8(domain: &Domain) -> u8 {
    *domain as u8
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

    /// Inverse of [`domain_to_u8`]. Test-only — on the write path we
    /// never need to decode the tag back into a domain variant.
    fn u8_to_domain(tag: u8) -> Option<Domain> {
        Domain::ALL.get(tag as usize).copied()
    }

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
            let back = u8_to_domain(tag).expect("known status tag in ingest_args");
            assert_eq!(&back, domain);
        }
    }

    #[test]
    fn ingest_args_layout_is_stable() {
        let args = ingest_args(&sample_event(), "usgs", "https://usgs.gov/").unwrap();
        let arr = args
            .as_array()
            .expect("ingest_args SQL value is a JSON array");
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
    fn duplicate_event_id_in_body_is_idempotent() {
        let body = "duplicate event id: 42";
        assert!(body.contains("duplicate event id"));
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
