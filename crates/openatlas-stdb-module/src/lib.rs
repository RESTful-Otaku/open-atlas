#![allow(clippy::too_many_arguments)]

mod narrative;

use spacetimedb::{reducer, ReducerContext, SpacetimeType, Table, Timestamp};

use narrative::{
    build_domain_insight_narrative, build_narrative, NarrativeContext, NARRATIVE_SEVERITY_THRESHOLD,
};

/// Maximum number of signals retained across all domains. The newest
/// `SIGNAL_RING_SIZE` rows are preserved; older rows are pruned at ingest
/// time. This is a hard upper bound — regardless of feed volume the table
/// never grows past this.
const SIGNAL_RING_SIZE: u64 = 50_000;

/// Aligned with dashboard subscription caps + headroom.
const CAUSAL_EDGE_RING_SIZE: u64 = 100_000;

/// Increased from 800 to hold ~24h of data at typical event rates.
/// Time-based pruning (24h retention) is the primary eviction mechanism;
/// this count limit is a safety net.
const EVENT_RING_SIZE: u64 = 200_000;

/// Rolling retention window; older rows are pruned on every ingest.
const EVENT_RETENTION_HOURS: u64 = 24;

const EVENT_RETENTION_MICROS: i64 = (EVENT_RETENTION_HOURS as i64) * 3600 * 1_000_000;

/// Hour-bucket aggregate retention (48h to ensure full 24h window always present).
const BUCKET_RETENTION_HOURS: i64 = 48;
const BUCKET_RETENTION_SECS: i64 = BUCKET_RETENTION_HOURS * 3600;

/// Maximum events per `ingest_events_batch` reducer call (transaction size bound).
const MAX_INGEST_BATCH_SIZE: usize = 128;

/// Append-only ingest audit ring (operator / HTTP only — table is private).
const INGEST_AUDIT_RING_SIZE: u64 = 200_000;

const AUDIT_ACCEPTED: u8 = 0;
const AUDIT_DUPLICATE: u8 = 1;
const AUDIT_REJECTED: u8 = 2;

/// Severity threshold above which an event raises an anomaly signal.
const ANOMALY_THRESHOLD: f64 = 0.85;

/// Upper bound on recent events per domain for the insight builder.
const INSIGHT_EVENT_WINDOW: usize = 24;

const INSIGHT_SIGNAL_WINDOW: usize = 240;

const TREND_DELTA: f64 = 0.06;

/// Geospatial location. Mirrors `openatlas_core::Location` using `SpacetimeType`.
#[derive(SpacetimeType, Clone, Debug, PartialEq)]
pub struct Location {
    pub lat: f64,
    pub lon: f64,
    pub region_tags: Vec<String>,
}

/// Batch ingest wire format. One per event.
#[derive(SpacetimeType, Clone, Debug)]
pub struct IngestEventArgs {
    pub id: u64,
    pub timestamp: Timestamp,
    pub domain: u8,
    pub severity_score: f64,
    pub location: Option<Location>,
    pub payload_json: String,
}

/// Canonical observation row. One per WorldEvent. Primary key is caller-supplied ID for idempotency.
#[spacetimedb::table(name = "event", accessor = event, public)]
pub struct Event {
    #[primary_key]
    pub id: u64,
    pub timestamp: Timestamp,
    /// Stable numeric tag; integer avoids ABI coupling.
    pub domain: u8,
    pub severity_score: f64,
    pub location: Option<Location>,
    /// JSON string keeps schema closed regardless of provider payload shapes.
    pub payload_json: String,
    /// Auto-increment ordinal, monotonically increasing.
    pub ordinal: u64,
}

/// Hour-bucketed event count aggregate for time-based charts.
/// One row per (domain, UTC hour). Upserted on every ingest and pruned at
/// 48h. Allows the frontend to render 24-hour time-distribution charts
/// (hour-of-day bars, activity heatmap, UTC-hour line) without scanning
/// the full event ring.
#[spacetimedb::table(name = "event_hour_bucket", accessor = event_hour_bucket, public)]
pub struct EventHourBucket {
    #[primary_key]
    pub bucket_key: String,
    pub domain: u8,
    /// Unix seconds rounded down to the hour boundary.
    pub utc_hour_bin: i64,
    pub event_count: u64,
    pub total_severity: f64,
    pub updated_at: Timestamp,
}

/// Per-domain aggregate. One row per domain.
#[spacetimedb::table(name = "world_state", accessor = world_state, public)]
pub struct WorldStateRow {
    #[primary_key]
    pub domain: u8,
    pub event_count: u64,
    pub avg_severity: f64,
    pub risk_index: f64,
    pub last_updated: Timestamp,
    /// Running sum stored so aggregates are recomputable without scanning the event table.
    pub total_severity: f64,
}

/// Anomaly signal row. Append-only ring bounded by `SIGNAL_RING_SIZE`.
#[spacetimedb::table(name = "signal", accessor = signal, public)]
pub struct Signal {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub event_id: u64,
    pub domain: u8,
    pub score: f64,
    pub reason: String,
    pub created_at: Timestamp,
}

/// Directed causal edge. Append-only ring bounded by `CAUSAL_EDGE_RING_SIZE`.
#[spacetimedb::table(name = "causal_edge", accessor = causal_edge, public)]
pub struct CausalEdge {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub source_event_id: u64,
    pub target_event_id: u64,
    pub influence_score: f64,
    pub decay_rate: f64,
    pub created_at: Timestamp,
}

/// Per-domain narrative insight. Rebuilt on every ingest of that domain.
#[spacetimedb::table(name = "domain_insight", accessor = domain_insight, public)]
pub struct DomainInsight {
    #[primary_key]
    pub domain: u8,
    pub trend: String,
    pub anomaly_count_recent: u32,
    pub dominant_source: String,
    pub source_link: String,
    pub narrative: String,
    pub updated_at: Timestamp,
}

/// High-severity event narrative. PK matches `event.id` so it prunes alongside parent.
#[spacetimedb::table(name = "event_narrative", accessor = event_narrative, public)]
pub struct EventNarrative {
    #[primary_key]
    pub event_id: u64,
    pub headline: String,
    pub summary: String,
    pub inference: String,
    /// JSON array of `{entity, severity, note}` objects. Keeps schema closed.
    pub predicted_disruption_json: String,
    pub updated_at: Timestamp,
}

/// Tracks the previous event per domain for auto-linking causal edges. Private.
#[spacetimedb::table(name = "last_event_in_domain", accessor = last_event_in_domain)]
pub struct LastEventInDomain {
    #[primary_key]
    pub domain: u8,
    pub event_id: u64,
    pub ordinal: u64,
}

/// Global monotonic ordinal counter. Single row.
#[spacetimedb::table(name = "ordinal_counter", accessor = ordinal_counter)]
pub struct OrdinalCounter {
    #[primary_key]
    pub id: u8,
    pub value: u64,
}

/// Append-only ingest log. Private.
#[spacetimedb::table(name = "ingest_audit", accessor = ingest_audit)]
pub struct IngestAudit {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub event_id: u64,
    pub outcome: u8,
    pub source_label: String,
    pub recorded_at: Timestamp,
    /// Empty on success; rejection reason otherwise.
    pub detail: String,
}

/// Most recent batch ingest outcome counts. Single row (id=0). Overwritten on every batch call.
#[spacetimedb::table(name = "batch_outcome", accessor = batch_outcome)]
pub struct BatchOutcome {
    #[primary_key]
    pub id: u8,
    pub accepted: u32,
    pub duplicates: u32,
    pub rejected: u32,
}

/// Initialises the ordinal counter.
#[reducer(init)]
pub fn init(ctx: &ReducerContext) {
    ctx.db
        .ordinal_counter()
        .insert(OrdinalCounter { id: 0, value: 0 });
    spacetimedb::log::info!("openatlas module initialised");
}

/// Single write entry point. Caller supplies the event id for idempotency.
#[reducer]
pub fn ingest_event(
    ctx: &ReducerContext,
    id: u64,
    timestamp: Timestamp,
    domain: u8,
    severity_score: f64,
    location: Option<Location>,
    payload_json: String,
    source_label: String,
    source_url: String,
) -> Result<(), String> {
    let input = IngestEventArgs {
        id,
        timestamp,
        domain,
        severity_score,
        location,
        payload_json,
    };
    match try_ingest_one(ctx, &input, &source_label, &source_url, false)? {
        IngestOneOutcome::Accepted => {
            prune_rings(ctx);
            Ok(())
        }
        IngestOneOutcome::Duplicate => Err(format!("duplicate event id: {id}")),
    }
}

/// Batch ingest. One transaction, per-event failures recorded without aborting the batch.
#[reducer]
pub fn ingest_events_batch(
    ctx: &ReducerContext,
    events: Vec<IngestEventArgs>,
    source_label: String,
    source_url: String,
) -> Result<(), String> {
    if events.len() > MAX_INGEST_BATCH_SIZE {
        return Err(format!(
            "batch size {} exceeds max {}",
            events.len(),
            MAX_INGEST_BATCH_SIZE
        ));
    }

    let mut touched_domains: std::collections::HashSet<u8> = std::collections::HashSet::new();
    let mut accepted = 0u32;
    let mut duplicates = 0u32;
    let mut rejected = 0u32;
    for input in &events {
        match try_ingest_one(ctx, input, &source_label, &source_url, true) {
            Ok(IngestOneOutcome::Accepted) => {
                accepted += 1;
                touched_domains.insert(input.domain);
                record_ingest_audit(
                    ctx,
                    input.id,
                    AUDIT_ACCEPTED,
                    &source_label,
                    input.timestamp,
                    "",
                );
            }
            Ok(IngestOneOutcome::Duplicate) => {
                duplicates += 1;
                record_ingest_audit(
                    ctx,
                    input.id,
                    AUDIT_DUPLICATE,
                    &source_label,
                    input.timestamp,
                    "duplicate event id",
                );
            }
            Err(reason) => {
                rejected += 1;
                record_ingest_audit(
                    ctx,
                    input.id,
                    AUDIT_REJECTED,
                    &source_label,
                    input.timestamp,
                    &reason,
                );
            }
        }
    }

    // Write outcome counts so subscribers (ingest metrics, UI) can retrieve
    // accurate per-batch counts without having to query the append-only audit log.
    if ctx.db.batch_outcome().id().find(0u8).is_some() {
        ctx.db.batch_outcome().id().update(BatchOutcome {
            id: 0,
            accepted,
            duplicates,
            rejected,
        });
    } else {
        ctx.db.batch_outcome().insert(BatchOutcome {
            id: 0,
            accepted,
            duplicates,
            rejected,
        });
    }

    let insight_ts = ctx.timestamp;
    for domain in touched_domains {
        rebuild_domain_insight(
            ctx,
            domain,
            source_label.clone(),
            source_url.clone(),
            insight_ts,
        );
    }

    prune_rings(ctx);
    Ok(())
}

/// Wrapper around `build_narrative`; handles insert-or-update and timestamping.
fn write_event_narrative(
    ctx: &ReducerContext,
    event_id: u64,
    ordinal: u64,
    domain: u8,
    severity_score: f64,
    location: Option<&Location>,
    source_label: &str,
    timestamp: Timestamp,
) {
    let insight = ctx.db.domain_insight().domain().find(domain);
    let anomaly_count_recent = insight
        .as_ref()
        .map(|i| i.anomaly_count_recent)
        .unwrap_or(0);
    let trend = insight.as_ref().map(|i| i.trend.as_str()).unwrap_or("flat");
    let loc_pair = location.map(|l| (l.lat, l.lon));

    let fields = build_narrative(&NarrativeContext {
        event_id,
        ordinal,
        domain,
        severity_score,
        location: loc_pair,
        dominant_source: source_label,
        anomaly_count_recent,
        trend,
    });

    let row = EventNarrative {
        event_id,
        headline: fields.headline,
        summary: fields.summary,
        inference: fields.inference,
        predicted_disruption_json: fields.predicted_disruption_json,
        updated_at: timestamp,
    };

    if ctx.db.event_narrative().event_id().find(event_id).is_some() {
        ctx.db.event_narrative().event_id().update(row);
    } else {
        ctx.db.event_narrative().insert(row);
    }
}

/// Explicit causal link for cases the domain heuristic wouldn't catch.
#[reducer]
pub fn link_causal_events(
    ctx: &ReducerContext,
    source_event_id: u64,
    target_event_id: u64,
    influence_score: f64,
    decay_rate: f64,
) -> Result<(), String> {
    if ctx.db.event().id().find(source_event_id).is_none() {
        return Err(format!("source event not found: {source_event_id}"));
    }
    if ctx.db.event().id().find(target_event_id).is_none() {
        return Err(format!("target event not found: {target_event_id}"));
    }
    ctx.db.causal_edge().insert(CausalEdge {
        id: 0,
        source_event_id,
        target_event_id,
        influence_score: influence_score.clamp(0.0, 1.0),
        decay_rate: decay_rate.clamp(0.0, 1.0),
        created_at: ctx.timestamp,
    });
    Ok(())
}

enum IngestOneOutcome {
    Accepted,
    Duplicate,
}

/// Upsert the hour-bucket aggregate for an incoming event.
fn upsert_event_hour_bucket(
    ctx: &ReducerContext,
    domain: u8,
    severity_score: f64,
    timestamp: Timestamp,
) {
    let micros = timestamp.to_micros_since_unix_epoch();
    let utc_hour_bin = (micros / 3_600_000_000) * 3_600;
    let bucket_key = format!("{}:{}", domain, utc_hour_bin);

    let existing = ctx
        .db
        .event_hour_bucket()
        .bucket_key()
        .find(bucket_key.clone());
    if let Some(mut row) = existing {
        row.event_count = row.event_count.saturating_add(1);
        row.total_severity += severity_score;
        row.updated_at = timestamp;
        ctx.db.event_hour_bucket().bucket_key().update(row);
    } else {
        ctx.db.event_hour_bucket().insert(EventHourBucket {
            bucket_key,
            domain,
            utc_hour_bin,
            event_count: 1,
            total_severity: severity_score,
            updated_at: timestamp,
        });
    }
}

/// Core ingest logic shared by single- and batch-reducers.
fn try_ingest_one(
    ctx: &ReducerContext,
    input: &IngestEventArgs,
    source_label: &str,
    source_url: &str,
    defer_domain_insight: bool,
) -> Result<IngestOneOutcome, String> {
    validate_ingest_input(input)?;

    if ctx.db.event().id().find(input.id).is_some() {
        return Ok(IngestOneOutcome::Duplicate);
    }

    let id = input.id;
    let timestamp = input.timestamp;
    let domain = input.domain;
    let severity_score = input.severity_score;
    let location = input.location.clone();
    let payload_json = input.payload_json.clone();

    let ordinal = next_ordinal(ctx);
    let previous = ctx
        .db
        .last_event_in_domain()
        .domain()
        .find(domain)
        .map(|row| (row.event_id, row.ordinal));

    ctx.db.event().insert(Event {
        id,
        timestamp,
        domain,
        severity_score,
        location: location.clone(),
        payload_json: payload_json.clone(),
        ordinal,
    });

    upsert_world_state(ctx, domain, severity_score, timestamp);
    upsert_event_hour_bucket(ctx, domain, severity_score, timestamp);

    if severity_score >= ANOMALY_THRESHOLD {
        ctx.db.signal().insert(Signal {
            id: 0,
            event_id: id,
            domain,
            score: severity_score,
            reason: "threshold_based_anomaly".to_owned(),
            created_at: timestamp,
        });
    }

    if let Some((source_event_id, _prev_ordinal)) = previous {
        if source_event_id != id {
            let snapshot = ctx.db.world_state().domain().find(domain);
            let risk_index = snapshot.as_ref().map(|s| s.risk_index).unwrap_or(0.0);
            let influence_score = ((severity_score + risk_index) / 2.0).clamp(0.0, 1.0);
            let decay_rate = (0.05 + (1.0 - influence_score) * 0.2).clamp(0.01, 0.95);
            ctx.db.causal_edge().insert(CausalEdge {
                id: 0,
                source_event_id,
                target_event_id: id,
                influence_score,
                decay_rate,
                created_at: timestamp,
            });
        }
    }

    if ctx
        .db
        .last_event_in_domain()
        .domain()
        .find(domain)
        .is_some()
    {
        ctx.db
            .last_event_in_domain()
            .domain()
            .update(LastEventInDomain {
                domain,
                event_id: id,
                ordinal,
            });
    } else {
        ctx.db.last_event_in_domain().insert(LastEventInDomain {
            domain,
            event_id: id,
            ordinal,
        });
    }

    if !defer_domain_insight {
        rebuild_domain_insight(
            ctx,
            domain,
            source_label.to_owned(),
            source_url.to_owned(),
            timestamp,
        );
    }

    if severity_score >= NARRATIVE_SEVERITY_THRESHOLD {
        write_event_narrative(
            ctx,
            id,
            ordinal,
            domain,
            severity_score,
            location.as_ref(),
            source_label,
            timestamp,
        );
    }

    Ok(IngestOneOutcome::Accepted)
}

fn validate_ingest_input(input: &IngestEventArgs) -> Result<(), String> {
    if !input.severity_score.is_finite() || !(0.0..=1.0).contains(&input.severity_score) {
        return Err(format!("invalid severity: {}", input.severity_score));
    }
    if input.domain > 12 {
        return Err(format!("unknown domain tag: {}", input.domain));
    }
    if let Some(ref loc) = input.location {
        if !loc.lat.is_finite() || !loc.lon.is_finite() {
            return Err("location coordinates must be finite".to_owned());
        }
        if !(-90.0..=90.0).contains(&loc.lat) || !(-180.0..=180.0).contains(&loc.lon) {
            return Err(format!(
                "location out of range: lat={}, lon={}",
                loc.lat, loc.lon
            ));
        }
    }
    if input.payload_json.len() > 8_192 {
        return Err(format!(
            "payload_json too large: {} bytes (max 8192)",
            input.payload_json.len()
        ));
    }
    Ok(())
}

fn record_ingest_audit(
    ctx: &ReducerContext,
    event_id: u64,
    outcome: u8,
    source_label: &str,
    recorded_at: Timestamp,
    detail: &str,
) {
    ctx.db.ingest_audit().insert(IngestAudit {
        id: 0,
        event_id,
        outcome,
        source_label: source_label.to_owned(),
        recorded_at,
        detail: detail.to_owned(),
    });
}

/// Bump and return next ordinal. All assignments go through here for deterministic ordering.
fn next_ordinal(ctx: &ReducerContext) -> u64 {
    let current = ctx
        .db
        .ordinal_counter()
        .id()
        .find(0u8)
        .map(|row| row.value)
        .unwrap_or(0);
    let next = current.saturating_add(1);
    ctx.db
        .ordinal_counter()
        .id()
        .update(OrdinalCounter { id: 0, value: next });
    next
}

fn upsert_world_state(ctx: &ReducerContext, domain: u8, severity: f64, event_ts: Timestamp) {
    let existing = ctx.db.world_state().domain().find(domain);
    let (event_count, total_severity, last_updated) = match &existing {
        Some(row) => (
            row.event_count.saturating_add(1),
            row.total_severity + severity,
            if event_ts > row.last_updated {
                event_ts
            } else {
                row.last_updated
            },
        ),
        None => (1, severity, event_ts),
    };
    let avg_severity = total_severity / event_count as f64;
    let risk_index = avg_severity.clamp(0.0, 1.0);
    let next_row = WorldStateRow {
        domain,
        event_count,
        avg_severity,
        risk_index,
        last_updated,
        total_severity,
    };
    if existing.is_some() {
        ctx.db.world_state().domain().update(next_row);
    } else {
        ctx.db.world_state().insert(next_row);
    }
}

/// Recompute and store the domain insight.
fn rebuild_domain_insight(
    ctx: &ReducerContext,
    domain: u8,
    source_label: String,
    source_url: String,
    now: Timestamp,
) {
    let mut domain_events: Vec<Event> = ctx
        .db
        .event()
        .iter()
        .filter(|e| e.domain == domain)
        .collect();
    domain_events.sort_by_key(|e| std::cmp::Reverse(e.ordinal));
    domain_events.truncate(INSIGHT_EVENT_WINDOW);

    let trend = compute_trend_label(&domain_events);

    let anomaly_count_recent = ctx
        .db
        .signal()
        .iter()
        .filter(|s| s.domain == domain)
        .count()
        .min(INSIGHT_SIGNAL_WINDOW) as u32;

    let risk_index = ctx
        .db
        .world_state()
        .domain()
        .find(domain)
        .map(|s| s.risk_index)
        .unwrap_or(0.0);
    let narrative = build_domain_insight_narrative(
        domain,
        trend,
        anomaly_count_recent,
        &source_label,
        risk_index,
    );

    let row = DomainInsight {
        domain,
        trend: trend.to_owned(),
        anomaly_count_recent,
        dominant_source: source_label,
        source_link: source_url,
        narrative,
        updated_at: now,
    };

    if ctx.db.domain_insight().domain().find(domain).is_some() {
        ctx.db.domain_insight().domain().update(row);
    } else {
        ctx.db.domain_insight().insert(row);
    }
}

fn compute_trend_label(events: &[Event]) -> &'static str {
    if events.len() < 4 {
        return "insufficient-data";
    }
    let newest = events[0].severity_score;
    let oldest = events[events.len() - 1].severity_score;
    let delta = newest - oldest;
    if delta > TREND_DELTA {
        "up"
    } else if delta < -TREND_DELTA {
        "down"
    } else {
        "flat"
    }
}

/// Prune all append-only tables. Overhead is O(overflow) — typically zero.
fn prune_rings(ctx: &ReducerContext) {
    prune_events(ctx);
    prune_signals(ctx);
    prune_causal_edges(ctx);
    prune_ingest_audit(ctx);
    prune_event_hour_buckets(ctx);
}

fn prune_events(ctx: &ReducerContext) {
    prune_events_older_than_retention(ctx);
    prune_events_over_ring_size(ctx);
}

/// Drop events (and narratives) older than EVENT_RETENTION_HOURS.
fn prune_events_older_than_retention(ctx: &ReducerContext) {
    let cutoff = ctx
        .timestamp
        .to_micros_since_unix_epoch()
        .saturating_sub(EVENT_RETENTION_MICROS);
    let stale: Vec<u64> = ctx
        .db
        .event()
        .iter()
        .filter(|e| e.timestamp.to_micros_since_unix_epoch() < cutoff)
        .map(|e| e.id)
        .collect();
    for id in stale {
        delete_event_row(ctx, id);
    }
}

fn prune_events_over_ring_size(ctx: &ReducerContext) {
    let total = ctx.db.event().count();
    if total <= EVENT_RING_SIZE {
        return;
    }
    let excess = total.saturating_sub(EVENT_RING_SIZE);
    let mut rows: Vec<Event> = ctx.db.event().iter().collect();
    rows.sort_by_key(|e| e.ordinal);
    for row in rows.into_iter().take(excess as usize) {
        delete_event_row(ctx, row.id);
    }
}

fn delete_event_row(ctx: &ReducerContext, id: u64) {
    if ctx.db.event_narrative().event_id().find(id).is_some() {
        ctx.db.event_narrative().event_id().delete(id);
    }
    let stale_signals: Vec<u64> = ctx
        .db
        .signal()
        .iter()
        .filter(|s| s.event_id == id)
        .map(|s| s.id)
        .collect();
    for sid in stale_signals {
        ctx.db.signal().id().delete(sid);
    }
    let stale_causal: Vec<u64> = ctx
        .db
        .causal_edge()
        .iter()
        .filter(|e| e.source_event_id == id || e.target_event_id == id)
        .map(|e| e.id)
        .collect();
    for cid in stale_causal {
        ctx.db.causal_edge().id().delete(cid);
    }
    ctx.db.event().id().delete(id);
}

fn prune_signals(ctx: &ReducerContext) {
    prune_signals_older_than_retention(ctx);
    let total = ctx.db.signal().count();
    if total <= SIGNAL_RING_SIZE {
        return;
    }
    let excess = total.saturating_sub(SIGNAL_RING_SIZE);
    let mut rows: Vec<Signal> = ctx.db.signal().iter().collect();
    rows.sort_by_key(|s| s.id);
    for row in rows.into_iter().take(excess as usize) {
        ctx.db.signal().id().delete(row.id);
    }
}

fn prune_signals_older_than_retention(ctx: &ReducerContext) {
    let cutoff = ctx
        .timestamp
        .to_micros_since_unix_epoch()
        .saturating_sub(EVENT_RETENTION_MICROS);
    let stale: Vec<u64> = ctx
        .db
        .signal()
        .iter()
        .filter(|s| s.created_at.to_micros_since_unix_epoch() < cutoff)
        .map(|s| s.id)
        .collect();
    for id in stale {
        ctx.db.signal().id().delete(id);
    }
}

fn prune_causal_edges(ctx: &ReducerContext) {
    prune_causal_edges_older_than_retention(ctx);
    let total = ctx.db.causal_edge().count();
    if total <= CAUSAL_EDGE_RING_SIZE {
        return;
    }
    let excess = total.saturating_sub(CAUSAL_EDGE_RING_SIZE);
    let mut rows: Vec<CausalEdge> = ctx.db.causal_edge().iter().collect();
    rows.sort_by_key(|e| e.id);
    for row in rows.into_iter().take(excess as usize) {
        ctx.db.causal_edge().id().delete(row.id);
    }
}

fn prune_causal_edges_older_than_retention(ctx: &ReducerContext) {
    let cutoff = ctx
        .timestamp
        .to_micros_since_unix_epoch()
        .saturating_sub(EVENT_RETENTION_MICROS);
    let stale: Vec<u64> = ctx
        .db
        .causal_edge()
        .iter()
        .filter(|e| e.created_at.to_micros_since_unix_epoch() < cutoff)
        .map(|e| e.id)
        .collect();
    for id in stale {
        ctx.db.causal_edge().id().delete(id);
    }
}

/// Drop hour-bucket rows whose hour is older than `BUCKET_RETENTION_HOURS`.
fn prune_event_hour_buckets(ctx: &ReducerContext) {
    let now_secs = ctx.timestamp.to_micros_since_unix_epoch() / 1_000_000;
    let cutoff_hour = now_secs - BUCKET_RETENTION_SECS;
    let stale: Vec<String> = ctx
        .db
        .event_hour_bucket()
        .iter()
        .filter(|b| b.utc_hour_bin < cutoff_hour)
        .map(|b| b.bucket_key.clone())
        .collect();
    for key in stale {
        ctx.db.event_hour_bucket().bucket_key().delete(key);
    }
}

fn prune_ingest_audit(ctx: &ReducerContext) {
    let total = ctx.db.ingest_audit().count();
    if total <= INGEST_AUDIT_RING_SIZE {
        return;
    }
    let excess = total - INGEST_AUDIT_RING_SIZE;
    let mut rows: Vec<IngestAudit> = ctx.db.ingest_audit().iter().collect();
    rows.sort_by_key(|r| r.id);
    for row in rows.into_iter().take(excess as usize) {
        ctx.db.ingest_audit().id().delete(row.id);
    }
}

#[cfg(test)]
mod ingest_rules_tests {
    use super::*;

    fn sample_args(severity: f64) -> IngestEventArgs {
        IngestEventArgs {
            id: 1,
            timestamp: Timestamp::from_micros_since_unix_epoch(1_700_000_000_000_000),
            domain: 3,
            severity_score: severity,
            location: Some(Location {
                lat: 10.0,
                lon: 20.0,
                region_tags: vec![],
            }),
            payload_json: "{}".to_owned(),
        }
    }

    #[test]
    fn validate_rejects_non_finite_severity() {
        let err = validate_ingest_input(&sample_args(f64::NAN)).unwrap_err();
        assert!(err.contains("invalid severity"));
    }

    #[test]
    fn validate_rejects_oversized_payload() {
        let mut args = sample_args(0.5);
        args.payload_json = "x".repeat(8_193);
        let err = validate_ingest_input(&args).unwrap_err();
        assert!(err.contains("too large"));
    }

    #[test]
    fn validate_rejects_out_of_range_location() {
        let mut args = sample_args(0.5);
        args.location = Some(Location {
            lat: 95.0,
            lon: 0.0,
            region_tags: vec![],
        });
        let err = validate_ingest_input(&args).unwrap_err();
        assert!(err.contains("out of range"));
    }

    #[test]
    fn batch_size_constant_matches_ingest_client() {
        assert_eq!(MAX_INGEST_BATCH_SIZE, 128);
    }

    #[test]
    fn ring_sizes_are_positive_and_ordered() {
        const {
            assert!(EVENT_RING_SIZE >= SIGNAL_RING_SIZE);
        }
        const {
            assert!(SIGNAL_RING_SIZE > 0);
        }
        const {
            assert!(CAUSAL_EDGE_RING_SIZE > 0);
        }
        const {
            assert!(INGEST_AUDIT_RING_SIZE >= EVENT_RING_SIZE);
        }
        const {
            assert!(EVENT_RING_SIZE <= INGEST_AUDIT_RING_SIZE);
        }
        const {
            assert!(BUCKET_RETENTION_HOURS > 0);
        }
    }

    #[test]
    fn compute_trend_label_insufficient_data() {
        let events = vec![Event {
            id: 1,
            ordinal: 1,
            timestamp: Timestamp::from_micros_since_unix_epoch(0),
            domain: 1,
            severity_score: 0.5,
            location: None,
            payload_json: "{}".to_owned(),
        }];
        assert_eq!(compute_trend_label(&events), "insufficient-data");
    }
}
