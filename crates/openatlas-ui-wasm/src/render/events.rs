//! Live event stream list with domain-coloured rows and severity bars.

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::{
    layout::{domain_color, severity_percent},
    model::UiEvent,
    state::UiState,
};

use super::{escape_html, require_element};

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
        let short_id = escape_html(&short_id(&event.id));
        let short_time = escape_html(short_time(&event.timestamp));
        let full_time = escape_html(&event.timestamp);
        let domain = escape_html(&event.domain);
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
                pct = pct,
                score = event.severity_score,
            ),
        );
    }

    list.set_inner_html(&html);
    Ok(())
}

fn short_id(id: &str) -> String {
    let head = id.split('-').next().unwrap_or(id);
    head.chars().take(8).collect()
}

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

#[cfg(test)]
mod tests {
    use super::{short_id, short_time, empty_state};

    #[test]
    fn short_id_returns_first_segment() {
        assert_eq!(short_id("abc123-def456"), "abc123");
    }

    #[test]
    fn short_id_truncates_to_8_chars() {
        assert_eq!(short_id("abcdefghij-other"), "abcdefgh");
    }

    #[test]
    fn short_id_no_dash() {
        assert_eq!(short_id("hello"), "hello");
    }

    #[test]
    fn short_id_empty_string() {
        assert_eq!(short_id(""), "");
    }

    #[test]
    fn short_id_exactly_8() {
        assert_eq!(short_id("12345678"), "12345678");
    }

    #[test]
    fn short_id_multi_dash() {
        assert_eq!(short_id("a-b-c"), "a");
    }

    #[test]
    fn short_time_extracts_hh_mm_ss() {
        assert_eq!(
            short_time("2024-06-01T14:30:00Z"),
            "14:30:00Z"
        );
    }

    #[test]
    fn short_time_with_fractional() {
        assert_eq!(
            short_time("2024-06-01T08:15:30.123456Z"),
            "08:15:30"
        );
    }

    #[test]
    fn short_time_with_timezone_offset() {
        assert_eq!(
            short_time("2024-06-01T10:00:00+02:00"),
            "10:00:00+02:00"
        );
    }

    #[test]
    fn short_time_no_timezone() {
        assert_eq!(
            short_time("2024-06-01T12:00:00"),
            "12:00:00"
        );
    }

    #[test]
    fn short_time_invalid_format_returns_original() {
        assert_eq!(short_time("not-a-timestamp"), "not-a-timestamp");
    }

    #[test]
    fn short_time_empty_string() {
        assert_eq!(short_time(""), "");
    }

    #[test]
    fn short_time_just_date() {
        assert_eq!(short_time("2024-06-01"), "2024-06-01");
    }

    #[test]
    fn empty_state_contains_message() {
        let html = empty_state();
        assert!(html.contains("No events yet"));
        assert!(html.contains("empty-state"));
        assert!(html.contains("<li"));
    }
}
