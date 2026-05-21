//! # OpenAtlas SpacetimeDB module
//!
//! This crate is the **authoritative state** for OpenAtlas. It compiles to a
//! WASM module that is published into a SpacetimeDB instance:
//!
//! ```text
//!   spacetime publish --project-path crates/openatlas-stdb-module openatlas
//! ```
//!
//! ## What lives here
//!
//! * `#[spacetimedb::table]` types — the tables that store every canonical
//!   entity (events, signals, world-state snapshots, causal edges, domain
//!   insights). All are marked `public` so clients can subscribe directly.
//! * `#[spacetimedb::reducer]` functions — the *only* write path. Every
//!   feed, simulator, CLI, or browser client ingests data by invoking
//!   `ingest_event`; causal edges and insights are maintained inside the
//!   same transaction.
//! * Pure helpers for anomaly detection and trend labelling. These mirror
//!   the oracle implementation in `openatlas-core::WorldGraph` so replay
//!   determinism is trivially verifiable.
//!
//! ## Design notes
//!
//! * **Determinism.** No wall-clock reads, no `Uuid::new_v4()`, no
//!   floating-point order sensitivity. Timestamps come from the reducer
//!   argument (which the caller or `ReducerContext::timestamp` supplies),
//!   and all IDs are supplied by callers.
//! * **Bounded memory.** `prune_signals` and `prune_causal_edges` keep the
//!   append-only tables from growing unboundedly; the bound is a constant
//!   and enforced every ingest.
//! * **Payload encoding.** Arbitrary feed payloads are stored as JSON
//!   strings. Clients are responsible for parsing (`JSON.parse` on the TS
//!   side, `serde_json::from_str` on the Rust side). This keeps the module
//!   schema closed while preserving provider-specific richness.

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
/// Aligned with dashboard subscription caps + headroom (~2× client `MAX_SIGNALS`).
const SIGNAL_RING_SIZE: u64 = 400;

/// Aligned with dashboard subscription caps + headroom.
const CAUSAL_EDGE_RING_SIZE: u64 = 600;

/// Aligned with dashboard subscription caps + headroom (~2× client `MAX_EVENTS`).
const EVENT_RING_SIZE: u64 = 800;

/// Rolling window for canonical events (and linked narratives). Older rows
/// are removed on each ingest so the store stays bounded and auditable.
const EVENT_RETENTION_HOURS: u64 = 24;

const EVENT_RETENTION_MICROS: i64 = (EVENT_RETENTION_HOURS as i64) * 3600 * 1_000_000;

/// Maximum events per `ingest_events_batch` reducer call (transaction size bound).
const MAX_INGEST_BATCH_SIZE: usize = 128;

/// Append-only ingest audit ring (operator / HTTP only — table is private).
const INGEST_AUDIT_RING_SIZE: u64 = 2_000;

/// `ingest_audit.outcome` — accepted new row.
const AUDIT_ACCEPTED: u8 = 0;
/// `ingest_audit.outcome` — idempotent duplicate id.
const AUDIT_DUPLICATE: u8 = 1;
/// `ingest_audit.outcome` — validation or business-rule rejection.
const AUDIT_REJECTED: u8 = 2;

/// Severity threshold that raises an anomaly signal. Matches the default
/// in `openatlas-core::inference::ThresholdInferenceEngine` so the two
/// implementations stay in agreement.
const ANOMALY_THRESHOLD: f64 = 0.85;

/// Upper bound on how many recent events per domain the insight builder
/// considers. Strict cap to keep the cost bounded regardless of event
/// volume.
const INSIGHT_EVENT_WINDOW: usize = 24;

/// Upper bound on signals scanned for anomaly counts.
const INSIGHT_SIGNAL_WINDOW: usize = 240;

/// Trend detection threshold on newest-vs-oldest severity delta.
const TREND_DELTA: f64 = 0.06;

// ---------------------------------------------------------------------------
// Value types (SpacetimeType)
// ---------------------------------------------------------------------------

/// Geospatial location attached to an event. Mirrors
/// `openatlas_core::Location` but encoded with `SpacetimeType` so it can be
/// stored in tables and passed to reducers.
#[derive(SpacetimeType, Clone, Debug, PartialEq)]
pub struct Location {
    pub lat: f64,
    pub lon: f64,
    pub region_tags: Vec<String>,
}

/// Wire shape for batched ingest (`ingest_events_batch`). One row per event;
/// `source_label` / `source_url` are shared across the batch (one feed cycle).
#[derive(SpacetimeType, Clone, Debug)]
pub struct IngestEventArgs {
    pub id: u64,
    pub timestamp: Timestamp,
    pub domain: u8,
    pub severity_score: f64,
    pub location: Option<Location>,
    pub payload_json: String,
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/// Canonical observation row. One per `WorldEvent`. Primary key is the
/// caller-supplied ID so idempotent retries never split an event across
/// rows.
#[spacetimedb::table(name = "event", accessor = event, public)]
pub struct Event {
    #[primary_key]
    pub id: u64,
    pub timestamp: Timestamp,
    /// Stable numeric tag; see `domain.rs` in the ingest crate for the
    /// mapping. An integer is used instead of a Rust enum because the
    /// module ABI surface is narrower and easier to evolve.
    pub domain: u8,
    pub severity_score: f64,
    pub location: Option<Location>,
    /// JSON-encoded payload. Kept as a string so we don't couple the
    /// module schema to provider-specific payload shapes.
    pub payload_json: String,
    /// Auto-increment ordinal used for "most recent N" queries. Smaller
    /// means older. The value is assigned by `ingest_event`.
    pub ordinal: u64,
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
    /// Running sum of severity, stored so aggregates are recomputable
    /// without scanning the event table on every ingest.
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

/// Directed causal edge row. Append-only ring bounded by
/// `CAUSAL_EDGE_RING_SIZE`.
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

/// Per-domain narrative insight. Overwritten on every ingest of that
/// domain.
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

/// Per-event operator narrative. Only high-severity events (above
/// [`narrative::NARRATIVE_SEVERITY_THRESHOLD`]) get a row here; lower-
/// severity events render from the raw signal/event data. Primary key
/// matches `event.id` so a narrative is always pruned alongside its
/// parent event by [`prune_events`].
#[spacetimedb::table(name = "event_narrative", accessor = event_narrative, public)]
pub struct EventNarrative {
    #[primary_key]
    pub event_id: u64,
    pub headline: String,
    pub summary: String,
    pub inference: String,
    /// JSON array of `{entity, severity, note}` objects. Stored as a
    /// string for the same reason as `event.payload_json` — keeps the
    /// module schema closed while preserving structured content for
    /// the UI to parse.
    pub predicted_disruption_json: String,
    pub updated_at: Timestamp,
}

/// Bookkeeping: "what was the previous event in this domain?" Used to
/// auto-link causal edges. Private because clients don't need it — the
/// causal edges themselves are exposed via the `causal_edge` table.
#[spacetimedb::table(name = "last_event_in_domain", accessor = last_event_in_domain)]
pub struct LastEventInDomain {
    #[primary_key]
    pub domain: u8,
    pub event_id: u64,
    pub ordinal: u64,
}

/// Global monotonic ordinal counter. Single row with id=0. Used to assign
/// `Event.ordinal` deterministically from within reducers.
#[spacetimedb::table(name = "ordinal_counter", accessor = ordinal_counter)]
pub struct OrdinalCounter {
    #[primary_key]
    pub id: u8,
    pub value: u64,
}

/// Append-only log of ingest attempts (accepted / duplicate / rejected).
/// Private — keeps browser subscriptions lean; operators use `/status` + SQL.
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

// ---------------------------------------------------------------------------
// Reducers
// ---------------------------------------------------------------------------

/// First-boot initialisation. Sets up the global ordinal counter so
/// subsequent ingest reducers can bump it.
#[reducer(init)]
pub fn init(ctx: &ReducerContext) {
    ctx.db
        .ordinal_counter()
        .insert(OrdinalCounter { id: 0, value: 0 });
    spacetimedb::log::info!("openatlas module initialised");
}

/// The single write entry point. Accepts a fully-formed event (id supplied
/// by the caller), validates severity, writes the row, updates the domain
/// aggregate, emits anomaly signals, auto-links a causal edge to the
/// previous event in that domain, and rewrites the domain insight.
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

/// Batch ingest for one feed cycle — one transaction, one prune pass, domain
/// insights rebuilt once per touched domain. Per-event failures are recorded
/// in [`IngestAudit`] without aborting the whole batch (at-least-once edge).
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

    let mut touched_domains: Vec<u8> = Vec::new();
    for input in &events {
        match try_ingest_one(ctx, input, &source_label, &source_url, true) {
            Ok(IngestOneOutcome::Accepted) => {
                if !touched_domains.contains(&input.domain) {
                    touched_domains.push(input.domain);
                }
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

/// Compose the narrative for a high-severity event and insert/update
/// its row. Pure composition lives in [`narrative::build_narrative`];
/// this wrapper exists only to gather the reducer-side context and
/// stamp `updated_at` from the caller-supplied timestamp.
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

/// Explicit causal link. Kept as a public reducer because feed adapters and
/// downstream correlation engines want to record observed causality that
/// the naive "previous event in domain" heuristic wouldn't catch.
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

enum IngestOneOutcome {
    Accepted,
    Duplicate,
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

/// Atomically bump the global ordinal counter and return the new value.
/// All ordinal assignments flow through this function so ordering is
/// deterministic across reducer invocations.
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

/// Insert-or-update the per-domain aggregate after an event lands.
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

/// Recompute and store the domain insight. Worst-case scans
/// `INSIGHT_EVENT_WINDOW` recent events per domain and
/// `INSIGHT_SIGNAL_WINDOW` signals — both constants.
fn rebuild_domain_insight(
    ctx: &ReducerContext,
    domain: u8,
    source_label: String,
    source_url: String,
    now: Timestamp,
) {
    // Collect recent events for this domain, ordered newest → oldest.
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

/// Enforce bounded memory by pruning the oldest rows from append-only
/// tables whenever they exceed their ring size. Called from every
/// `ingest_event` so the overhead is O(overflow), typically zero.
fn prune_rings(ctx: &ReducerContext) {
    prune_events(ctx);
    prune_signals(ctx);
    prune_causal_edges(ctx);
    prune_ingest_audit(ctx);
}

fn prune_events(ctx: &ReducerContext) {
    prune_events_older_than_retention(ctx);
    prune_events_over_ring_size(ctx);
}

/// Drop events (and narratives) older than [`EVENT_RETENTION_HOURS`].
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
    let excess = total - EVENT_RING_SIZE;
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
    ctx.db.event().id().delete(id);
}

fn prune_signals(ctx: &ReducerContext) {
    prune_signals_older_than_retention(ctx);
    let total = ctx.db.signal().count();
    if total <= SIGNAL_RING_SIZE {
        return;
    }
    let excess = total - SIGNAL_RING_SIZE;
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
    let excess = total - CAUSAL_EDGE_RING_SIZE;
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
        assert!(EVENT_RING_SIZE >= SIGNAL_RING_SIZE);
        assert!(SIGNAL_RING_SIZE > 0);
        assert!(CAUSAL_EDGE_RING_SIZE > 0);
        assert!(INGEST_AUDIT_RING_SIZE >= EVENT_RING_SIZE);
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
