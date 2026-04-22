//! Causal graph summary — a compact list of directed influence edges
//! plus a three-tile summary above it.

use std::collections::HashMap;

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::{model::UiCausalEdge, state::UiState};

use super::require_element;

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
        let source = short(&edge.source_event_id);
        let target = short(&edge.target_event_id);
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
                full_source = edge.source_event_id,
                source = source,
                full_target = edge.target_event_id,
                target = target,
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
