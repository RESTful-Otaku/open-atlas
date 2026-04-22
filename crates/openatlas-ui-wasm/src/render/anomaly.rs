//! Anomaly indicator rows. Mirrors the event-list structure so the
//! dashboard has a consistent visual rhythm between the two firehose
//! panels.

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::{
    layout::{domain_color, severity_percent},
    state::UiState,
};

use super::require_element;

const MAX_ROWS: usize = 40;

pub(super) fn render(document: &Document, state: &UiState) -> Result<(), JsValue> {
    let panel = require_element(document, "anomaly-list")?;

    let mut html = String::with_capacity(MAX_ROWS * 320);

    let rows: Vec<_> = state
        .recent_signals
        .iter()
        .filter(|signal| state.matches_domain(&signal.domain))
        .rev()
        .take(MAX_ROWS)
        .collect();

    if rows.is_empty() {
        panel.set_inner_html(&empty_state());
        return Ok(());
    }

    for signal in rows {
        let color = domain_color(&signal.domain);
        let pct = severity_percent(signal.score);
        let short_event = signal
            .event_id
            .split('-')
            .next()
            .unwrap_or(&signal.event_id);

        let _ = std::fmt::Write::write_fmt(
            &mut html,
            format_args!(
                r#"<li class="row row-anomaly" style="--card-accent: {color}">
                  <span class="row-dot" aria-hidden="true"></span>
                  <span class="anomaly-score">{score:.2}</span>
                  <span class="domain-tag">{domain}</span>
                  <span class="row-body" title="{reason}">{reason}</span>
                  <span>
                    <div class="sev-bar" style="--sev-pct: {pct:.0}%"></div>
                    <div class="sev-bar-label">event <code>{short_event}</code></div>
                  </span>
                </li>"#,
                color = color,
                score = signal.score,
                domain = signal.domain,
                reason = escape_html(&signal.reason),
                pct = pct,
                short_event = short_event,
            ),
        );
    }

    panel.set_inner_html(&html);
    Ok(())
}

/// Minimal HTML escape. Reasons come from server-generated strings but
/// we still defend in depth — the UI never trusts incoming text.
fn escape_html(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

fn empty_state() -> String {
    r#"<li class="empty-state">
      <strong>All clear</strong>
      No anomalies have crossed threshold in the current window.
    </li>"#
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::escape_html;

    #[test]
    fn escape_html_handles_control_chars() {
        assert_eq!(
            escape_html("<script>alert('x')</script>"),
            "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;"
        );
        assert_eq!(escape_html("a & b"), "a &amp; b");
    }
}
