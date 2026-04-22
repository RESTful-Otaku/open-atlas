//! Generated insight cards. One card per domain insight emitted by
//! the ingest service, with an attributable source link and a compact
//! metadata row.

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::{layout::domain_color, state::UiState};

use super::require_element;

pub(super) fn render(document: &Document, state: &UiState) -> Result<(), JsValue> {
    let panel = require_element(document, "insight-panels")?;

    let mut insights = state
        .domain_insights
        .values()
        .filter(|insight| state.matches_domain(&insight.domain))
        .cloned()
        .collect::<Vec<_>>();
    insights.sort_by(|a, b| a.domain.cmp(&b.domain));

    if insights.is_empty() {
        panel.set_inner_html(&empty_state());
        return Ok(());
    }

    let mut html = String::with_capacity(insights.len() * 512);
    html.push_str("<div class=\"insight-list\">");
    for insight in insights {
        let color = domain_color(&insight.domain);
        let source_label = insight
            .dominant_source
            .clone()
            .unwrap_or_else(|| "unknown".to_owned());
        let source_html = insight
            .source_link
            .as_ref()
            .map(|link| {
                format!(
                    r#"<a href="{link}" target="_blank" rel="noopener noreferrer">{source_label}</a>"#,
                )
            })
            .unwrap_or(source_label);

        let _ = std::fmt::Write::write_fmt(
            &mut html,
            format_args!(
                r#"<article class="insight" style="--card-accent: {color}">
                  <div class="insight-head">
                    <span class="insight-domain">
                      <span class="domain-dot" aria-hidden="true" style="background: {color}"></span>
                      {domain}
                    </span>
                    <span class="trend-chip" data-trend="{trend}">{trend}</span>
                  </div>
                  <p class="insight-narrative">{narrative}</p>
                  <div class="insight-meta">
                    <span>{anomalies} anomaly events</span>
                    <span class="dot" aria-hidden="true"></span>
                    <span>Source {source_html}</span>
                    <span class="spacer"></span>
                    <span class="mono">{updated_at}</span>
                  </div>
                </article>"#,
                color = color,
                domain = insight.domain,
                trend = insight.trend,
                narrative = insight.narrative,
                anomalies = insight.anomaly_count_recent,
                source_html = source_html,
                updated_at = insight.updated_at,
            ),
        );
    }
    html.push_str("</div>");
    panel.set_inner_html(&html);
    Ok(())
}

fn empty_state() -> String {
    r#"<div class="empty-state">
      <strong>No insights yet</strong>
      Narratives appear as the inference layer finds patterns.
    </div>"#
        .to_owned()
}
