//! Normalise provider rows into canonical WorldEvent values.

use anyhow::{bail, Result};
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use openatlas_core::{Domain, Location, WorldEvent};
use serde_json::{json, Map, Value};

use super::deterministic_event_id;
use crate::{
    payload_compact::compact_canonical_payload,
    validate::{clamp_severity, validate_event, validate_location},
};

#[derive(Debug, Clone)]
pub struct ObservationDraft {
    pub external_key: String,
    pub observed_at: DateTime<Utc>,
    pub domain: Domain,
    pub severity: f64,
    pub location: Option<Location>,
    pub fields: Map<String, Value>,
}

impl ObservationDraft {
    pub fn new(
        external_key: impl Into<String>,
        observed_at: DateTime<Utc>,
        domain: Domain,
        severity: f64,
    ) -> Self {
        Self {
            external_key: external_key.into(),
            observed_at,
            domain,
            severity,
            location: None,
            fields: Map::new(),
        }
    }

    pub fn with_location(mut self, location: Location) -> Result<Self> {
        validate_location(&location)?;
        self.location = Some(location);
        Ok(self)
    }

    pub fn field(mut self, key: impl Into<String>, value: impl Into<Value>) -> Self {
        self.fields.insert(key.into(), value.into());
        self
    }

    pub fn into_event(self, source: &str, source_url: &str) -> Result<WorldEvent> {
        if self.external_key.is_empty() {
            bail!("external_key must not be empty");
        }
        let severity_score = clamp_severity(self.severity);
        let _ = source_url;
        let payload = compact_canonical_payload(source, &self.external_key, self.fields);
        let event = WorldEvent {
            id: deterministic_event_id(source, &self.external_key),
            timestamp: self.observed_at,
            domain: self.domain,
            location: self.location,
            severity_score,
            payload,
        };
        validate_event(&event)?;
        Ok(event)
    }
}

pub fn drafts_to_events(
    source: &str,
    source_url: &str,
    drafts: impl IntoIterator<Item = ObservationDraft>,
) -> Vec<WorldEvent> {
    let mut events = Vec::new();
    for draft in drafts {
        match draft.into_event(source, source_url) {
            Ok(event) => events.push(event),
            Err(error) => {
                tracing::debug!("{source}: skip observation: {error:#}");
            }
        }
    }
    events
}

pub fn canonical_payload(
    source: &str,
    source_url: &str,
    external_key: &str,
    mut fields: Map<String, Value>,
) -> Value {
    fields.insert("source".to_owned(), json!(source));
    fields.insert("source_url".to_owned(), json!(source_url));
    fields.insert("external_id".to_owned(), json!(external_key));
    fields.insert("schema_version".to_owned(), json!(1));
    Value::Object(fields)
}

pub fn ratio_severity(value: f64, saturation: f64) -> f64 {
    if saturation <= 0.0 || !value.is_finite() {
        return 0.0;
    }
    clamp_severity((value.abs() / saturation).clamp(0.0, 1.0))
}

pub fn location_from_coords(lat: f64, lon: f64, region_tags: Vec<String>) -> Result<Location> {
    let loc = Location {
        lat,
        lon,
        region_tags,
    };
    validate_location(&loc)?;
    Ok(loc)
}

pub fn parse_epoch_secs(secs: i64) -> Option<DateTime<Utc>> {
    Utc.timestamp_opt(secs, 0).single()
}

pub fn parse_epoch_millis(ms: i64) -> Option<DateTime<Utc>> {
    Utc.timestamp_millis_opt(ms).single()
}

pub fn parse_rfc3339(s: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

/// `YYYY-MM-DD` (FRED / World Bank observation dates).
pub fn parse_date_ymd(s: &str) -> Option<DateTime<Utc>> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .ok()
        .and_then(|d| d.and_hms_opt(12, 0, 0))
        .and_then(|ndt| ndt.and_local_timezone(Utc).single())
}

/// EIA periods like `2024-01-15T13` or `2024-01-15`.
pub fn parse_eia_period(s: &str) -> Option<DateTime<Utc>> {
    if let Some(dt) = parse_rfc3339(s) {
        return Some(dt);
    }
    if let Some(dt) = parse_date_ymd(s) {
        return Some(dt);
    }
    if s.len() >= 13 && s.as_bytes().get(10) == Some(&b'T') {
        let date = &s[..10];
        let hour = s[11..].parse::<u32>().ok()?;
        return NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .ok()
            .and_then(|d| d.and_hms_opt(hour, 0, 0))
            .and_then(|ndt| ndt.and_local_timezone(Utc).single());
    }
    None
}

pub fn daily_external_key(prefix: &str, day: DateTime<Utc>) -> String {
    format!("{prefix}-{}", day.format("%Y-%m-%d"))
}

pub fn assert_graph_accepts(event: WorldEvent) -> Result<()> {
    use openatlas_core::WorldGraph;
    validate_event(&event)?;
    let mut g = WorldGraph::default();
    g.ingest_event(event.clone())
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use openatlas_core::Domain;

    #[test]
    fn draft_builds_valid_event() {
        let e = ObservationDraft::new("k1", Utc::now(), Domain::Finance, 0.4)
            .into_event("fred", "https://fred.stlouisfed.org/")
            .unwrap();
        assert!(validate_event(&e).is_ok());
        assert_eq!(e.payload["v"], 1);
        assert_eq!(e.payload["src"], "fred");
    }

    #[test]
    fn ratio_severity_saturates() {
        assert_eq!(ratio_severity(10.0, 10.0), 1.0);
        assert_eq!(ratio_severity(f64::NAN, 10.0), 0.0);
    }

    #[test]
    fn parse_eia_period_hourly() {
        let dt = parse_eia_period("2024-06-01T13").expect("ratio_severity: observation_draft severity");
        assert_eq!(dt.format("%Y-%m-%d %H").to_string(), "2024-06-01 13");
    }
}
