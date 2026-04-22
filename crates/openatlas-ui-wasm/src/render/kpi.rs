//! KPI strip — four at-a-glance stat tiles that summarise the live
//! system state. Rendered as a flat grid (no inner panel chrome); the
//! descriptor sets `show_header = false` so this panel is visually the
//! hero of the dashboard.
//!
//! All numbers are derived from the already-bounded [`UiState`] buffers
//! so computation is O(N) with N ≤ `MAX_EVENTS` / `MAX_SIGNALS`.

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::{layout::sparkline_svg, state::UiState};

use super::require_element;

pub(super) fn render(document: &Document, state: &UiState) -> Result<(), JsValue> {
    let mount = require_element(document, "kpi-strip")?;

    let total_events = state.events.len();
    let active_anomalies = state.recent_signals.len();

    let (avg_severity, severity_series) = severity_summary(state);
    let domain_count = state.domain_state.len();

    let html = format!(
        r#"<div class="kpi-strip">
          {tile_events}
          {tile_anomalies}
          {tile_severity}
          {tile_domains}
        </div>"#,
        tile_events = kpi_tile(
            "Events in window",
            &fmt_int(total_events),
            "streamed",
            "Bounded ring buffer",
            "rgba(34, 211, 238, 0.14)",
            None,
        ),
        tile_anomalies = kpi_tile(
            "Active anomalies",
            &fmt_int(active_anomalies),
            "signals",
            "Threshold inference",
            "rgba(239, 68, 68, 0.14)",
            None,
        ),
        tile_severity = kpi_tile(
            "Average severity",
            &format!("{:.2}", avg_severity),
            "0 – 1",
            "Rolling across all domains",
            "rgba(245, 158, 11, 0.14)",
            Some(sparkline_svg(&severity_series, "#f59e0b")),
        ),
        tile_domains = kpi_tile(
            "Live domains",
            &fmt_int(domain_count),
            "tracked",
            "Reporting in current window",
            "rgba(167, 139, 250, 0.14)",
            None,
        ),
    );

    mount.set_inner_html(&html);
    Ok(())
}

fn kpi_tile(
    label: &str,
    value: &str,
    suffix: &str,
    caption: &str,
    glow: &str,
    sparkline: Option<String>,
) -> String {
    let spark = sparkline.unwrap_or_default();
    format!(
        r#"<article class="kpi" style="--kpi-glow: {glow}">
          <div class="kpi-label">{label}</div>
          <div class="kpi-value">
            <span>{value}</span>
            <span class="kpi-suffix">{suffix}</span>
          </div>
          <div class="kpi-caption">{caption}</div>
          {spark}
        </article>"#,
    )
}

fn severity_summary(state: &UiState) -> (f64, Vec<f64>) {
    if state.events.is_empty() {
        return (0.0, Vec::new());
    }

    let sum: f64 = state.events.iter().map(|event| event.severity_score).sum();
    let avg = sum / state.events.len() as f64;

    // Bucket the last N events into a small series so the sparkline
    // stays legible even at high ingest rates.
    const BUCKETS: usize = 24;
    let count = state.events.len().min(120);
    let window = &state.events[state.events.len() - count..];
    let bucket_size = window.len().div_ceil(BUCKETS).max(1);
    let mut series = Vec::with_capacity(BUCKETS);
    for chunk in window.chunks(bucket_size) {
        let chunk_sum: f64 = chunk.iter().map(|event| event.severity_score).sum();
        series.push(chunk_sum / chunk.len() as f64);
    }
    (avg, series)
}

fn fmt_int(value: usize) -> String {
    let s = value.to_string();
    let mut out = String::with_capacity(s.len() + s.len() / 3);
    for (i, ch) in s.chars().rev().enumerate() {
        if i != 0 && i % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    out.chars().rev().collect()
}

#[cfg(test)]
mod tests {
    use super::fmt_int;

    #[test]
    fn fmt_int_groups_thousands() {
        assert_eq!(fmt_int(0), "0");
        assert_eq!(fmt_int(42), "42");
        assert_eq!(fmt_int(1_234), "1,234");
        assert_eq!(fmt_int(1_234_567), "1,234,567");
    }
}
