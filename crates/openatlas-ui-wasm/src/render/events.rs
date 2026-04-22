//! Live event stream list. Each row shows a domain dot, a monospaced
//! timestamp, a domain tag, an identifier, and a severity bar. The
//! rendered markup intentionally stays close to the DOM-level `<li>`
//! template so no React-style reconciliation is required.

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::{
    layout::{domain_color, severity_percent},
    model::UiEvent,
    state::UiState,
};

use super::require_element;

/// Upper bound on rows rendered per frame. `UiState::events` is already
/// bounded at `MAX_EVENTS`; this is a second cap so the stream panel
/// never paints more than fits comfortably on screen.
const MAX_ROWS: usize = 60;

pub(super) fn render(document: &Document, state: &UiState) -> Result<(), JsValue> {
    let list = require_element(document, "event-list")?;

    let mut html = String::with_capacity(MAX_ROWS * 256);

    let rows: Vec<&UiEvent> = state
        .events
        .iter()
        .filter(|event| state.matches_domain(&event.domain))
        .rev()
        .take(MAX_ROWS)
        .collect();

    if rows.is_empty() {
        list.set_inner_html(&empty_state());
        return Ok(());
    }

    for event in rows {
        let color = domain_color(&event.domain);
        let pct = severity_percent(event.severity_score);
        let short_id = short_id(&event.id);
        let short_time = short_time(&event.timestamp);
        let _ = std::fmt::Write::write_fmt(
            &mut html,
            format_args!(
                r#"<li class="row" style="--card-accent: {color}">
                  <span class="row-dot" aria-hidden="true"></span>
                  <span class="row-time" title="{full_time}">{short_time}</span>
                  <span class="domain-tag">{domain}</span>
                  <span class="row-body"><code>{short_id}</code></span>
                  <span>
                    <div class="sev-bar" style="--sev-pct: {pct:.0}%"></div>
                    <div class="sev-bar-label">{score:.2}</div>
                  </span>
                </li>"#,
                color = color,
                full_time = event.timestamp,
                short_time = short_time,
                domain = event.domain,
                short_id = short_id,
                pct = pct,
                score = event.severity_score,
            ),
        );
    }

    list.set_inner_html(&html);
    Ok(())
}

/// Displays the trailing 8 chars of the id as a humane handle. Full id
/// remains queryable via the row's `title` attribute.
fn short_id(id: &str) -> String {
    let head = id.split('-').next().unwrap_or(id);
    head.chars().take(8).collect()
}

/// Extracts `HH:MM:SS` from an ISO-8601 timestamp. Falls back to the
/// original string on parse mismatch — we never show a stale / wrong
/// time silently.
fn short_time(ts: &str) -> &str {
    ts.split('T')
        .nth(1)
        .and_then(|rest| rest.split('.').next().or(Some(rest)))
        .unwrap_or(ts)
}

fn empty_state() -> String {
    r#"<li class="empty-state">
      <strong>No events yet</strong>
      Stream activity will appear here as ingest begins.
    </li>"#
        .to_owned()
}
