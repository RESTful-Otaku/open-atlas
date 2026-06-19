//! Causal graph summary — a compact list of directed influence edges
//! plus a three-tile summary above it.

use std::collections::HashMap;

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::{model::UiCausalEdge, state::UiState};

use super::{escape_html, require_element};

const MAX_ROWS: usize = 30;

pub(super) fn render(document: &Document, state: &UiState) -> Result<(), JsValue> {
    let panel = require_element(document, "causal-graph")?;

    let event_domain_by_id = state
        .events
        .iter()
        .map(|event| (event.id.clone(), event.domain.clone()))
        .collect::<HashMap<String, String>>();

    let visible_edges: Vec<UiCausalEdge> = state
        .recent_causal_edges
        .iter()
        .filter(|edge| {
            state
                .selected_domain
                .as_ref()
                .map(|selected| {
                    event_domain_by_id.get(&edge.source_event_id) == Some(selected)
                        || event_domain_by_id.get(&edge.target_event_id) == Some(selected)
                })
                .unwrap_or(true)
        })
        .cloned()
        .collect();

    let mut out_degree: HashMap<String, usize> = HashMap::new();
    let mut in_degree: HashMap<String, usize> = HashMap::new();
    for edge in &visible_edges {
        *out_degree.entry(edge.source_event_id.clone()).or_insert(0) += 1;
        *in_degree.entry(edge.target_event_id.clone()).or_insert(0) += 1;
    }

    let summary = format!(
        r#"<div class="causal-summary">
          {edges}
          {sources}
          {targets}
        </div>"#,
        edges = summary_tile("Recent edges", visible_edges.len()),
        sources = summary_tile("Distinct sources", out_degree.len()),
        targets = summary_tile("Distinct targets", in_degree.len()),
    );

    let rows = if visible_edges.is_empty() {
        r#"<div class="empty-state">
          <strong>No causal links yet</strong>
          Edges emerge after the inference layer correlates events.
        </div>"#
            .to_owned()
    } else {
        render_rows(&visible_edges)
    };

    panel.set_inner_html(&format!(
        r#"{summary}<ul class="causal-list panel-body is-flush">{rows}</ul>"#,
    ));
    Ok(())
}

fn render_rows(edges: &[UiCausalEdge]) -> String {
    let mut html = String::with_capacity(edges.len() * 320);
    for edge in edges.iter().rev().take(MAX_ROWS) {
        let full_source = escape_html(&edge.source_event_id);
        let source = escape_html(&short(&edge.source_event_id));
        let full_target = escape_html(&edge.target_event_id);
        let target = escape_html(&short(&edge.target_event_id));
        let _ = std::fmt::Write::write_fmt(
            &mut html,
            format_args!(
                r#"<li class="row">
                  <span class="row-body"><code title="{full_source}">{source}</code></span>
                  <span class="causal-arrow" aria-hidden="true">→</span>
                  <span class="row-body"><code title="{full_target}">{target}</code></span>
                  <span class="row-body mono">influence {influence:.2} · decay {decay:.2}</span>
                  <span>
                    <div class="sev-bar" style="--sev-pct: {pct:.0}%"></div>
                  </span>
                </li>"#,
                influence = edge.influence_score,
                decay = edge.decay_rate,
                pct = (edge.influence_score.clamp(0.0, 1.0)) * 100.0,
            ),
        );
    }
    html
}

fn summary_tile(label: &str, count: usize) -> String {
    format!(
        r#"<article class="kpi" style="--kpi-glow: rgba(34, 211, 238, 0.14)">
          <div class="kpi-label">{label}</div>
          <div class="kpi-value">
            <span>{count}</span>
          </div>
        </article>"#,
    )
}

fn short(id: &str) -> String {
    id.split('-').next().unwrap_or(id).chars().take(8).collect()
}

#[cfg(test)]
mod tests {
    use super::{short, summary_tile};

    // -----------------------------------------------------------------------
    // short
    // -----------------------------------------------------------------------

    #[test]
    fn short_returns_first_segment() {
        assert_eq!(short("abc123-def456"), "abc123");
    }

    #[test]
    fn short_truncates_to_8_chars() {
        assert_eq!(short("abcdefghij-other"), "abcdefgh");
    }

    #[test]
    fn short_no_dash() {
        assert_eq!(short("hello"), "hello");
    }

    #[test]
    fn short_empty_string() {
        assert_eq!(short(""), "");
    }

    #[test]
    fn short_exactly_8_chars_no_dash() {
        assert_eq!(short("12345678"), "12345678");
    }

    #[test]
    fn short_multi_dash() {
        assert_eq!(short("a-b-c-d"), "a");
    }

    #[test]
    fn short_unicode_truncation() {
        let result = short("évent-id-123");
        let first = result.chars().next().unwrap();
        assert_eq!(first, 'é');
        assert!(result.len() <= 8);
    }

    // -----------------------------------------------------------------------
    // summary_tile
    // -----------------------------------------------------------------------

    #[test]
    fn summary_tile_zero_count() {
        let html = summary_tile("Test", 0);
        assert!(html.contains("Test"));
        assert!(html.contains("0"));
        assert!(html.contains("kpi"));
        assert!(html.contains("kpi-value"));
    }

    #[test]
    fn summary_tile_positive_count() {
        let html = summary_tile("Edges", 42);
        assert!(html.contains("42"));
        assert!(html.contains("Edges"));
    }

    #[test]
    fn summary_tile_contains_kpi_class() {
        let html = summary_tile("Sources", 7);
        assert!(html.contains("class=\"kpi\""));
    }
}
