//! Per-domain aggregate cards. Each card shows the risk index as the
//! hero metric, a trend chip, supporting numbers, and a sparkline of
//! the recent severity history.

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::{
    layout::{domain_color, sparkline_svg},
    state::{compute_trend, UiState},
};

use super::require_element;

pub(super) fn render(document: &Document, state: &UiState) -> Result<(), JsValue> {
    let panel = require_element(document, "domain-panels")?;

    let mut domains = state
        .domain_state
        .values()
        .filter(|entry| state.matches_domain(&entry.domain))
        .cloned()
        .collect::<Vec<_>>();
    domains.sort_by(|a, b| a.domain.cmp(&b.domain));

    if domains.is_empty() {
        panel.set_inner_html(&empty_state());
        return Ok(());
    }

    let mut cards = String::with_capacity(domains.len() * 512);
    cards.push_str("<div class=\"domain-grid\">");
    for entry in domains {
        let color = domain_color(&entry.domain);
        let history = state
            .domain_severity_history
            .get(&entry.domain)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        let trend = compute_trend(history);
        let trend_label = trend_label(trend);
        let spark = sparkline_svg(history, color);

        let _ = std::fmt::Write::write_fmt(
            &mut cards,
            format_args!(
                r#"<article class="domain-card" style="--card-accent: {color}">
                  <div class="domain-card-head">
                    <span class="domain-card-name">
                      <span class="domain-dot" aria-hidden="true"></span>
                      {domain}
                    </span>
                    <span class="trend-chip" data-trend="{trend}">
                      {trend_glyph} {trend_label}
                    </span>
                  </div>
                  <div class="domain-card-metric">
                    <span class="big">{risk:.2}</span>
                    <span class="unit">Risk Index</span>
                  </div>
                  <dl class="domain-card-subgrid">
                    <dt>Events</dt><dd>{events}</dd>
                    <dt>Avg severity</dt><dd>{severity:.2}</dd>
                  </dl>
                  {spark}
                </article>"#,
                color = color,
                domain = entry.domain,
                trend = trend,
                trend_glyph = trend_glyph(trend),
                trend_label = trend_label,
                risk = entry.risk_index,
                events = entry.event_count,
                severity = entry.avg_severity,
                spark = spark,
            ),
        );
    }
    cards.push_str("</div>");
    panel.set_inner_html(&cards);
    Ok(())
}

fn trend_glyph(trend: &str) -> &'static str {
    match trend {
        "up" => "▲",
        "down" => "▼",
        "flat" => "●",
        _ => "◌",
    }
}

fn trend_label(trend: &str) -> &'static str {
    match trend {
        "up" => "Rising",
        "down" => "Easing",
        "flat" => "Stable",
        _ => "No data",
    }
}

fn empty_state() -> String {
    r#"<div class="empty-state">
      <strong>Awaiting first domain update</strong>
      Aggregates populate after the first few events per domain.
    </div>"#
        .to_owned()
}
