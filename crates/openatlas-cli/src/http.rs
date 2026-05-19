//! Thin SpacetimeDB SQL client.
//!
//! The CLI talks to SpacetimeDB through its HTTP SQL endpoint
//! (`POST /v1/database/<name>/sql`). This is deliberately simpler than
//! using the full Rust SDK: the CLI is a polling tool, not a live
//! client, so we want the cheapest dependency footprint we can get.
//!
//! # Wire shape
//!
//! Requests send a raw SQL query string in the body. The server
//! responds with a JSON array of statement results — one per `;`
//! delimited statement. Each result is:
//!
//! ```json
//! { "schema": <ProductType>, "rows": [[...], [...], ...] }
//! ```
//!
//! Rows are tuples indexed positionally; we decode them into the
//! strongly-typed structs below so the command handlers stay
//! presentation-only.

use std::collections::HashMap;

use anyhow::{anyhow, Context, Result};
use reqwest::{Client, Url};
use serde::Deserialize;
use serde_json::Value;

/// Canonical mapping from SpacetimeDB u8 tags to the domain ids used
/// elsewhere. Kept in lockstep with
/// `openatlas-ingest/src/stdb.rs::domain_to_u8` and
/// `web/src/lib/domain.ts`.
const DOMAIN_BY_TAG: &[&str] = &[
    "energy",
    "finance",
    "climate",
    "seismic",
    "transport",
    "health",
    "geospatial",
    "economy",
    "geopolitics",
    "cyber",
    "space",
    "demographics",
    "infrastructure",
];

pub(crate) fn domain_label(tag: u8) -> String {
    DOMAIN_BY_TAG
        .get(tag as usize)
        .copied()
        .unwrap_or("unknown")
        .to_owned()
}

pub(crate) fn tag_for_domain(id: &str) -> Option<u8> {
    DOMAIN_BY_TAG
        .iter()
        .position(|candidate| *candidate == id)
        .map(|idx| idx as u8)
}

/// A single observation row projected from SpacetimeDB's `event` table.
#[derive(Debug, Clone)]
pub(crate) struct EventRow {
    pub(crate) id: u64,
    pub(crate) timestamp_micros: i64,
    pub(crate) domain_tag: u8,
    pub(crate) severity_score: f64,
    pub(crate) ordinal: u64,
}

/// Per-domain aggregate row projected from SpacetimeDB's `world_state`
/// table.
#[derive(Debug, Clone)]
pub(crate) struct WorldStateRow {
    pub(crate) domain_tag: u8,
    pub(crate) event_count: u64,
    pub(crate) avg_severity: f64,
    pub(crate) risk_index: f64,
    pub(crate) last_updated_micros: i64,
}

/// Anomaly signal row projected from SpacetimeDB's `signal` table.
#[derive(Debug, Clone)]
pub(crate) struct SignalRow {
    pub(crate) event_id: u64,
    pub(crate) domain_tag: u8,
    pub(crate) score: f64,
    pub(crate) reason: String,
}

/// Causal edge row projected from SpacetimeDB's `causal_edge` table.
#[derive(Debug, Clone)]
pub(crate) struct CausalEdgeRow {
    pub(crate) source_event_id: u64,
    pub(crate) target_event_id: u64,
    pub(crate) influence_score: f64,
    pub(crate) decay_rate: f64,
}

pub(crate) async fn fetch_events(
    client: &Client,
    base_url: &Url,
    database: &str,
    domain: Option<&str>,
    limit: usize,
) -> Result<Vec<EventRow>> {
    // SpacetimeDB 2.1 SQL does not yet support ORDER BY or aggregates,
    // so we fetch the (bounded) table and sort newest-first client-side.
    // The module prunes the `event` table to `EVENT_RING_SIZE`, so this
    // is still an O(ring size) pull on the wire.
    let mut sql = String::from("SELECT id, timestamp, domain, severity_score, ordinal FROM event");
    if let Some(domain) = domain {
        let tag = tag_for_domain(domain).ok_or_else(|| anyhow!("unknown domain id: {domain}"))?;
        sql.push_str(&format!(" WHERE domain = {tag}"));
    }
    let results = run_sql(client, base_url, database, &sql).await?;
    let rows = single_statement(results)?;
    let mut decoded: Vec<EventRow> = rows
        .into_iter()
        .map(decode_event_row)
        .collect::<Result<Vec<_>>>()?;
    decoded.sort_by_key(|b| std::cmp::Reverse(b.ordinal));
    decoded.truncate(limit);
    Ok(decoded)
}

pub(crate) async fn fetch_event(
    client: &Client,
    base_url: &Url,
    database: &str,
    event_id: u64,
) -> Result<EventRow> {
    let sql = format!(
        "SELECT id, timestamp, domain, severity_score, ordinal FROM event WHERE id = {event_id}"
    );
    let rows = single_statement(run_sql(client, base_url, database, &sql).await?)?;
    rows.into_iter()
        .next()
        .ok_or_else(|| anyhow!("no event with id {event_id}"))
        .and_then(decode_event_row)
}

pub(crate) async fn fetch_world_states(
    client: &Client,
    base_url: &Url,
    database: &str,
    domain: Option<&str>,
) -> Result<Vec<WorldStateRow>> {
    let mut sql = String::from(
        "SELECT domain, event_count, avg_severity, risk_index, last_updated FROM world_state",
    );
    if let Some(domain) = domain {
        let tag = tag_for_domain(domain).ok_or_else(|| anyhow!("unknown domain id: {domain}"))?;
        sql.push_str(&format!(" WHERE domain = {tag}"));
    }
    let rows = single_statement(run_sql(client, base_url, database, &sql).await?)?;
    rows.into_iter().map(decode_world_state_row).collect()
}

pub(crate) async fn fetch_signals(
    client: &Client,
    base_url: &Url,
    database: &str,
    domain: Option<&str>,
    limit: usize,
) -> Result<Vec<SignalRow>> {
    // See note in `fetch_events`: SpacetimeDB SQL lacks ORDER BY, so
    // sort newest-first (by event id) after pulling the full ring.
    let mut sql = String::from("SELECT event_id, domain, score, reason FROM signal");
    if let Some(domain) = domain {
        let tag = tag_for_domain(domain).ok_or_else(|| anyhow!("unknown domain id: {domain}"))?;
        sql.push_str(&format!(" WHERE domain = {tag}"));
    }
    let rows = single_statement(run_sql(client, base_url, database, &sql).await?)?;
    let mut decoded: Vec<SignalRow> = rows
        .into_iter()
        .map(decode_signal_row)
        .collect::<Result<Vec<_>>>()?;
    decoded.sort_by_key(|b| std::cmp::Reverse(b.event_id));
    decoded.truncate(limit);
    Ok(decoded)
}

pub(crate) async fn fetch_causal_edges(
    client: &Client,
    base_url: &Url,
    database: &str,
    event_id: u64,
    limit: usize,
) -> Result<Vec<CausalEdgeRow>> {
    // Edges use a dedicated monotonic `id` column; we'd sort by that,
    // but since SpacetimeDB SQL lacks ORDER BY we pull the (bounded)
    // matching rows and limit client-side. Matches for a single event
    // are already small in practice.
    let sql = format!(
        "SELECT source_event_id, target_event_id, influence_score, decay_rate FROM causal_edge \
         WHERE source_event_id = {event_id} OR target_event_id = {event_id}"
    );
    let rows = single_statement(run_sql(client, base_url, database, &sql).await?)?;
    let mut decoded: Vec<CausalEdgeRow> = rows
        .into_iter()
        .map(decode_causal_edge_row)
        .collect::<Result<Vec<_>>>()?;
    decoded.truncate(limit);
    Ok(decoded)
}

// ---------------------------------------------------------------------------
// Wire plumbing
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct SqlStatementResult {
    #[serde(default)]
    rows: Vec<Value>,
    #[allow(dead_code)]
    schema: Option<Value>,
}

async fn run_sql(
    client: &Client,
    base_url: &Url,
    database: &str,
    sql: &str,
) -> Result<Vec<SqlStatementResult>> {
    let url = base_url
        .join(&format!("v1/database/{database}/sql"))
        .context("failed to build SpacetimeDB SQL URL")?;
    let response = client
        .post(url)
        .header("content-type", "text/plain; charset=utf-8")
        .body(sql.to_owned())
        .send()
        .await
        .context("SpacetimeDB SQL request failed (transport)")?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        anyhow::bail!("SpacetimeDB SQL rejected ({status}): {body}");
    }
    Ok(response.json::<Vec<SqlStatementResult>>().await?)
}

fn single_statement(results: Vec<SqlStatementResult>) -> Result<Vec<Value>> {
    let first = results
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("SpacetimeDB returned no statement results"))?;
    Ok(first.rows)
}

// ---------------------------------------------------------------------------
// Row decoders
// ---------------------------------------------------------------------------

fn decode_event_row(row: Value) -> Result<EventRow> {
    let arr = row
        .as_array()
        .ok_or_else(|| anyhow!("event row is not a JSON array"))?;
    Ok(EventRow {
        id: as_u64(arr.first())?,
        timestamp_micros: as_timestamp_micros(arr.get(1))?,
        domain_tag: as_u8(arr.get(2))?,
        severity_score: as_f64(arr.get(3))?,
        ordinal: as_u64(arr.get(4))?,
    })
}

fn decode_world_state_row(row: Value) -> Result<WorldStateRow> {
    let arr = row
        .as_array()
        .ok_or_else(|| anyhow!("world_state row is not a JSON array"))?;
    Ok(WorldStateRow {
        domain_tag: as_u8(arr.first())?,
        event_count: as_u64(arr.get(1))?,
        avg_severity: as_f64(arr.get(2))?,
        risk_index: as_f64(arr.get(3))?,
        last_updated_micros: as_timestamp_micros(arr.get(4))?,
    })
}

fn decode_signal_row(row: Value) -> Result<SignalRow> {
    let arr = row
        .as_array()
        .ok_or_else(|| anyhow!("signal row is not a JSON array"))?;
    Ok(SignalRow {
        event_id: as_u64(arr.first())?,
        domain_tag: as_u8(arr.get(1))?,
        score: as_f64(arr.get(2))?,
        reason: as_string(arr.get(3))?,
    })
}

fn decode_causal_edge_row(row: Value) -> Result<CausalEdgeRow> {
    let arr = row
        .as_array()
        .ok_or_else(|| anyhow!("causal_edge row is not a JSON array"))?;
    Ok(CausalEdgeRow {
        source_event_id: as_u64(arr.first())?,
        target_event_id: as_u64(arr.get(1))?,
        influence_score: as_f64(arr.get(2))?,
        decay_rate: as_f64(arr.get(3))?,
    })
}

fn as_u64(value: Option<&Value>) -> Result<u64> {
    match value {
        Some(Value::Number(n)) => n
            .as_u64()
            .ok_or_else(|| anyhow!("number does not fit in u64: {n}")),
        Some(Value::String(s)) => s
            .parse()
            .with_context(|| format!("failed to parse u64 from string: {s}")),
        Some(other) => Err(anyhow!("unexpected value for u64: {other}")),
        None => Err(anyhow!("missing u64 field")),
    }
}

fn as_u8(value: Option<&Value>) -> Result<u8> {
    let wide = as_u64(value)?;
    u8::try_from(wide).map_err(|_| anyhow!("number out of u8 range: {wide}"))
}

fn as_f64(value: Option<&Value>) -> Result<f64> {
    match value {
        Some(Value::Number(n)) => n.as_f64().ok_or_else(|| anyhow!("non-float number: {n}")),
        Some(other) => Err(anyhow!("unexpected value for f64: {other}")),
        None => Err(anyhow!("missing f64 field")),
    }
}

fn as_string(value: Option<&Value>) -> Result<String> {
    match value {
        Some(Value::String(s)) => Ok(s.clone()),
        Some(other) => Err(anyhow!("unexpected value for string: {other}")),
        None => Err(anyhow!("missing string field")),
    }
}

/// SATS encodes Timestamp values in one of three shapes depending on
/// the server version and SQL output mode:
///
/// * `{"__timestamp_micros_since_unix_epoch__": N}` — tagged object
///   (older clients/docs).
/// * `[N]` — single-element array wrapper (SpacetimeDB 2.1 SQL shape
///   for the newtype `Timestamp(i64)`).
/// * `N` — raw integer in the most compact projections.
///
/// Handle all three so the CLI keeps working across minor releases.
fn as_timestamp_micros(value: Option<&Value>) -> Result<i64> {
    match value {
        Some(Value::Object(map)) => timestamp_from_map(map),
        Some(Value::Array(items)) if items.len() == 1 => as_timestamp_micros(items.first()),
        Some(Value::Number(n)) => n
            .as_i64()
            .ok_or_else(|| anyhow!("timestamp does not fit in i64: {n}")),
        Some(Value::String(s)) => s
            .parse::<i64>()
            .with_context(|| format!("failed to parse timestamp from string: {s}")),
        Some(other) => Err(anyhow!("unexpected value for timestamp: {other}")),
        None => Err(anyhow!("missing timestamp field")),
    }
}

fn timestamp_from_map(map: &serde_json::Map<String, Value>) -> Result<i64> {
    let as_native: HashMap<&str, &Value> = map.iter().map(|(k, v)| (k.as_str(), v)).collect();
    let inner = as_native
        .get("__timestamp_micros_since_unix_epoch__")
        .ok_or_else(|| anyhow!("timestamp object missing __timestamp_micros_since_unix_epoch__"))?;
    inner
        .as_i64()
        .ok_or_else(|| anyhow!("timestamp inner value is not an i64: {inner}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn domain_roundtrip_is_total() {
        for (idx, name) in DOMAIN_BY_TAG.iter().enumerate() {
            assert_eq!(domain_label(idx as u8), *name);
            assert_eq!(tag_for_domain(name), Some(idx as u8));
        }
        assert_eq!(domain_label(250), "unknown");
        assert_eq!(tag_for_domain("nonsense"), None);
    }

    #[test]
    fn event_row_decodes_from_sdk_shape() {
        let row = json!([
            42,
            { "__timestamp_micros_since_unix_epoch__": 1_700_000_000_000_000i64 },
            3,
            0.95,
            7
        ]);
        let decoded = decode_event_row(row).unwrap();
        assert_eq!(decoded.id, 42);
        assert_eq!(decoded.domain_tag, 3);
        assert_eq!(decoded.severity_score, 0.95);
        assert_eq!(decoded.ordinal, 7);
        assert_eq!(decoded.timestamp_micros, 1_700_000_000_000_000);
    }

    #[test]
    fn event_row_decodes_timestamp_array_shape() {
        let row = json!([42, [1_776_802_537_953_218i64], 3, 0.95, 7]);
        let decoded = decode_event_row(row).unwrap();
        assert_eq!(decoded.timestamp_micros, 1_776_802_537_953_218);
    }

    #[test]
    fn world_state_row_decodes_from_sdk_shape() {
        let row = json!([
            1,
            38,
            0.72,
            0.72,
            { "__timestamp_micros_since_unix_epoch__": 1_700_000_000_000_000i64 }
        ]);
        let decoded = decode_world_state_row(row).unwrap();
        assert_eq!(decoded.domain_tag, 1);
        assert_eq!(decoded.event_count, 38);
        assert!((decoded.avg_severity - 0.72).abs() < 1e-9);
    }
}
