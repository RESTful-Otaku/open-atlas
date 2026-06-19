//! Tiny owner of the top-bar connection-status pill.
//!
//! The pill is addressed exclusively through `data-state` attributes
//! (`connecting`, `live`, `offline`). CSS does the visual work; this
//! module only maps discrete connection events to those three states.

use wasm_bindgen::JsValue;
use web_sys::Document;

/// Discrete states the status pill can be in. Keeping this enum tiny
/// and total makes the socket event → UI mapping obvious.
#[derive(Clone, Copy)]
pub(crate) enum ConnectionState {
    Connecting,
    Live,
    Offline,
}

impl ConnectionState {
    const fn attr(self) -> &'static str {
        match self {
            ConnectionState::Connecting => "connecting",
            ConnectionState::Live => "live",
            ConnectionState::Offline => "offline",
        }
    }

    const fn label(self) -> &'static str {
        match self {
            ConnectionState::Connecting => "Connecting…",
            ConnectionState::Live => "Live",
            ConnectionState::Offline => "Offline",
        }
    }
}

/// Updates the status pill. Missing pill element is non-fatal: the
/// dashboard still works without it.
pub(crate) fn set(document: &Document, state: ConnectionState) -> Result<(), JsValue> {
    let Some(pill) = document.get_element_by_id("connection-status") else {
        return Ok(());
    };
    pill.set_attribute("data-state", state.attr())?;
    if let Some(label) = pill.query_selector(".status-label")? {
        label.set_text_content(Some(state.label()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::ConnectionState;

    #[test]
    fn connecting_attr() {
        assert_eq!(ConnectionState::Connecting.attr(), "connecting");
    }

    #[test]
    fn live_attr() {
        assert_eq!(ConnectionState::Live.attr(), "live");
    }

    #[test]
    fn offline_attr() {
        assert_eq!(ConnectionState::Offline.attr(), "offline");
    }

    #[test]
    fn connecting_label() {
        assert_eq!(ConnectionState::Connecting.label(), "Connecting…");
    }

    #[test]
    fn live_label() {
        assert_eq!(ConnectionState::Live.label(), "Live");
    }

    #[test]
    fn offline_label() {
        assert_eq!(ConnectionState::Offline.label(), "Offline");
    }

    #[test]
    fn attr_and_label_are_consistent() {
        for &(state, expected_attr, expected_label) in &[
            (ConnectionState::Connecting, "connecting", "Connecting…"),
            (ConnectionState::Live, "live", "Live"),
            (ConnectionState::Offline, "offline", "Offline"),
        ] {
            assert_eq!(state.attr(), expected_attr);
            assert_eq!(state.label(), expected_label);
        }
    }

    #[test]
    fn all_variants_have_non_empty_attr() {
        assert!(!ConnectionState::Connecting.attr().is_empty());
        assert!(!ConnectionState::Live.attr().is_empty());
        assert!(!ConnectionState::Offline.attr().is_empty());
    }

    #[test]
    fn all_variants_have_non_empty_label() {
        assert!(!ConnectionState::Connecting.label().is_empty());
        assert!(!ConnectionState::Live.label().is_empty());
        assert!(!ConnectionState::Offline.label().is_empty());
    }
}
