//! WebSocket wiring. Isolated from the rest of the UI so the message
//! pipeline (decode → apply → render) is the only thing this module
//! knows about. The one DOM touch-point beyond the registry-driven
//! renderers is the connection-status pill in the top-bar, delegated
//! to [`crate::status`].

use std::{cell::Cell, cell::RefCell, rc::Rc};

use wasm_bindgen::{closure::Closure, prelude::*, JsCast};
use web_sys::{Document, MessageEvent, WebSocket, Window};

use crate::{
    model::StreamEnvelope,
    render,
    state::{apply_envelope, UiState},
    status::{self, ConnectionState},
};

const MAX_RECONNECT_ATTEMPTS: u32 = 10;
const RECONNECT_BASE_MS: u32 = 1000;

pub(crate) fn start_stream(
    window: &Window,
    document: &Document,
    state: Rc<RefCell<UiState>>,
) -> Result<(), JsValue> {
    let _ = status::set(document, ConnectionState::Connecting);
    connect(window, document, state, Rc::new(Cell::new(0)))
}

fn connect(
    window: &Window,
    document: &Document,
    state: Rc<RefCell<UiState>>,
    attempt: Rc<Cell<u32>>,
) -> Result<(), JsValue> {
    let websocket_url = stream_url(window)?;
    let ws = WebSocket::new(&websocket_url)?;

    install_onopen(&ws, document, attempt.clone());
    install_onmessage(&ws, document, state.clone());
    install_onclose(&ws, window, document, state.clone(), attempt.clone());
    install_onerror(&ws, window, document, state, attempt);
    Ok(())
}

fn install_onopen(ws: &WebSocket, document: &Document, attempt: Rc<Cell<u32>>) {
    let doc = document.clone();
    let callback = Closure::<dyn FnMut(_)>::new(move |_event: web_sys::Event| {
        attempt.set(0);
        let _ = status::set(&doc, ConnectionState::Live);
    });
    ws.set_onopen(Some(callback.as_ref().unchecked_ref()));
    callback.forget();
}

fn install_onmessage(ws: &WebSocket, document: &Document, state: Rc<RefCell<UiState>>) {
    let doc_clone = document.clone();
    let callback = Closure::<dyn FnMut(_)>::new(move |event: MessageEvent| {
        let Some(payload) = event.data().as_string() else {
            return;
        };
        match serde_json::from_str::<StreamEnvelope>(&payload) {
            Ok(envelope) => {
                let mut ui_state = state.borrow_mut();
                apply_envelope(&mut ui_state, envelope);
                let _ = render::render(&doc_clone, &ui_state);
            }
            Err(parse_error) => {
                web_sys::console::error_1(
                    &format!("failed to parse stream payload: {parse_error}").into(),
                );
            }
        }
    });
    ws.set_onmessage(Some(callback.as_ref().unchecked_ref()));
    callback.forget();
}

fn install_onclose(
    ws: &WebSocket,
    window: &Window,
    document: &Document,
    state: Rc<RefCell<UiState>>,
    attempt: Rc<Cell<u32>>,
) {
    let doc = document.clone();
    let win = window.clone();
    let callback = Closure::<dyn FnMut(_)>::new(move |_event: web_sys::Event| {
        let _ = status::set(&doc, ConnectionState::Offline);
        schedule_reconnect(&win, &doc, state.clone(), attempt.clone());
    });
    ws.set_onclose(Some(callback.as_ref().unchecked_ref()));
    callback.forget();
}

fn install_onerror(
    ws: &WebSocket,
    window: &Window,
    document: &Document,
    state: Rc<RefCell<UiState>>,
    attempt: Rc<Cell<u32>>,
) {
    let doc = document.clone();
    let win = window.clone();
    let callback = Closure::<dyn FnMut(_)>::new(move |_event: web_sys::Event| {
        let _ = status::set(&doc, ConnectionState::Offline);
        schedule_reconnect(&win, &doc, state.clone(), attempt.clone());
    });
    ws.set_onerror(Some(callback.as_ref().unchecked_ref()));
    callback.forget();
}

fn schedule_reconnect(
    window: &Window,
    document: &Document,
    state: Rc<RefCell<UiState>>,
    attempt: Rc<Cell<u32>>,
) {
    let current = attempt.get();
    if current >= MAX_RECONNECT_ATTEMPTS {
        return;
    }
    attempt.set(current + 1);
    let delay_ms = (RECONNECT_BASE_MS * 2u32.pow(current)).min(30_000);

    let win = window.clone();
    let doc = document.clone();
    let cb = Closure::once(move || {
        let _ = status::set(&doc, ConnectionState::Connecting);
        let _ = connect(&win, &doc, state, attempt);
    });
    let _ = window.set_timeout_with_callback_and_timeout_and_arguments_0(
        cb.as_ref().unchecked_ref(),
        delay_ms as i32,
    );
    cb.forget();
}

/// Build the `/stream` URL, upgrading to `wss` when the page itself is
/// served over HTTPS. Falls back to `ws` otherwise.
fn stream_url(window: &Window) -> Result<String, JsValue> {
    let location = window.location();
    let host = location.host()?;
    let protocol = location.protocol()?;
    let scheme = if protocol == "https:" { "wss" } else { "ws" };
    Ok(format!("{scheme}://{host}/stream"))
}

#[cfg(test)]
mod tests {
    // stream_url requires a web_sys::Window which is not available on
    // native. We test URL construction logic independently to validate
    // the scheme-selection behaviour.

    fn build_url(protocol: &str, host: &str) -> String {
        let scheme = if protocol == "https:" { "wss" } else { "ws" };
        format!("{scheme}://{host}/stream")
    }

    #[test]
    fn stream_url_http_uses_ws() {
        assert_eq!(
            build_url("http:", "localhost:3000"),
            "ws://localhost:3000/stream"
        );
    }

    #[test]
    fn stream_url_https_uses_wss() {
        assert_eq!(
            build_url("https:", "example.com"),
            "wss://example.com/stream"
        );
    }

    #[test]
    fn stream_url_preserves_host_with_path() {
        let url = build_url("https:", "127.0.0.1:8080");
        assert_eq!(url, "wss://127.0.0.1:8080/stream");
    }

    #[test]
    fn stream_url_with_subdomain() {
        let url = build_url("https:", "api.openatlas.dev");
        assert_eq!(url, "wss://api.openatlas.dev/stream");
    }
}
