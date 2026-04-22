//! Non-interactive subcommands: `view events`, `state`, `anomalies`,
//! `trace`. All of them query SpacetimeDB via
//! `openatlas_cli::http::*` and render presentation-only output to
//! stdout.

use std::time::Duration;

use anyhow::Result;
use chrono::{DateTime, Utc};
use reqwest::{Client, Url};

use crate::http::{self, domain_label, CausalEdgeRow, EventRow, SignalRow, WorldStateRow};

/// Streams (polls) the latest events from SpacetimeDB. `watch` keeps
/// the loop running forever with a short sleep between fetches — a
/// deliberately simple "poll instead of subscribe" design so the CLI
/// stays a single sync tool rather than a long-lived SDK client.
pub(crate) async fn view_events(
    client: &Client,
    base_url: &Url,
    database: &str,
    domain: Option<&str>,
    limit: usize,
    watch: bool,
    interval_ms: u64,
) -> Result<()> {
    loop {
        let events = http::fetch_events(client, base_url, database, domain, limit).await?;
        print_events(&events);
        if !watch {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(interval_ms)).await;
        println!();
    }
}

pub(crate) async fn show_state(
    client: &Client,
    base_url: &Url,
    database: &str,
    domain: Option<&str>,
) -> Result<()> {
    let mut states = http::fetch_world_states(client, base_url, database, domain).await?;
    states.sort_by_key(|row| row.domain_tag);
    if states.is_empty() {
        println!("(no world_state rows yet)");
        return Ok(());
    }
    for state in &states {
        print_world_state(state);
    }
    Ok(())
}

pub(crate) async fn show_anomalies(
    client: &Client,
    base_url: &Url,
    database: &str,
    domain: Option<&str>,
    limit: usize,
) -> Result<()> {
    let signals = http::fetch_signals(client, base_url, database, domain, limit).await?;
    print_signals(&signals);
    Ok(())
}

pub(crate) async fn trace_event(
    client: &Client,
    base_url: &Url,
    database: &str,
    event_id: u64,
) -> Result<()> {
    let event = http::fetch_event(client, base_url, database, event_id).await?;
    println!("EVENT");
    println!(
        "{} domain={} severity={:.3} id={} ordinal={}",
        format_micros(event.timestamp_micros),
        domain_label(event.domain_tag),
        event.severity_score,
        event.id,
        event.ordinal,
    );

    let edges = http::fetch_causal_edges(client, base_url, database, event.id, 200).await?;
    println!("CAUSAL LINKS");
    if edges.is_empty() {
        println!("(none)");
        return Ok(());
    }
    for edge in &edges {
        print_causal_edge(event.id, edge);
    }
    Ok(())
}

fn print_events(events: &[EventRow]) {
    println!("EVENTS");
    if events.is_empty() {
        println!("(none)");
        return;
    }
    for event in events {
        println!(
            "{} domain={} severity={:.3} id={} ordinal={}",
            format_micros(event.timestamp_micros),
            domain_label(event.domain_tag),
            event.severity_score,
            event.id,
            event.ordinal,
        );
    }
}

fn print_world_state(state: &WorldStateRow) {
    println!(
        "domain={} events={} avg_severity={:.3} risk_index={:.3} last_updated={}",
        domain_label(state.domain_tag),
        state.event_count,
        state.avg_severity,
        state.risk_index,
        format_micros(state.last_updated_micros),
    );
}

fn print_signals(signals: &[SignalRow]) {
    println!("ANOMALIES");
    if signals.is_empty() {
        println!("(none)");
        return;
    }
    for signal in signals {
        println!(
            "domain={} score={:.3} reason={} event_id={}",
            domain_label(signal.domain_tag),
            signal.score,
            signal.reason,
            signal.event_id,
        );
    }
}

fn print_causal_edge(anchor: u64, edge: &CausalEdgeRow) {
    let direction = if edge.source_event_id == anchor {
        "outgoing"
    } else {
        "incoming"
    };
    println!(
        "{} {} -> {} influence={:.2} decay={:.2}",
        direction,
        edge.source_event_id,
        edge.target_event_id,
        edge.influence_score,
        edge.decay_rate,
    );
}

/// Render a SpacetimeDB microsecond timestamp as RFC 3339. Any value
/// outside the DateTime range falls back to the raw integer so we
/// never panic in the output pipeline.
fn format_micros(micros: i64) -> String {
    match DateTime::<Utc>::from_timestamp_micros(micros) {
        Some(ts) => ts.to_rfc3339(),
        None => format!("<invalid ts {micros}>"),
    }
}
