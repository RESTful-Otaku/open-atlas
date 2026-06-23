//! Generated insight cards per domain with source attribution.

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::{layout::domain_color, state::UiState};

use super::{escape_html, require_element};

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
                    r#"<a href="{link}" target="_blank" rel="noopener noreferrer">{label}</a>"#,
                    link = escape_html(link),
                    label = escape_html(&source_label),
                )
            })
            .unwrap_or_else(|| escape_html(&source_label));

        let domain = escape_html(&insight.domain);
        let trend = escape_html(&insight.trend);
        let narrative = escape_html(&insight.narrative);
        let updated_at = escape_html(&insight.updated_at);

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
                anomalies = insight.anomaly_count_recent,
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

#[cfg(test)]
mod tests {
    use super::empty_state;

    #[test]
    fn empty_state_contains_message() {
        let html = empty_state();
        assert!(html.contains("No insights yet"));
        assert!(html.contains("empty-state"));
        assert!(html.contains("Narratives"));
    }

    #[test]
    fn empty_state_is_div() {
        let html = empty_state();
        assert!(html.starts_with(r#"<div class="empty-state""#));
        assert!(html.ends_with("</div>"));
    }
}
