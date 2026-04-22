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
