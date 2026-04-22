//! WebSocket wiring. Isolated from the rest of the UI so the message
//! pipeline (decode → apply → render) is the only thing this module
//! knows about. The one DOM touch-point beyond the registry-driven
//! renderers is the connection-status pill in the top-bar, delegated
//! to [`crate::status`].

use std::{cell::RefCell, rc::Rc};

use wasm_bindgen::{closure::Closure, prelude::*, JsCast};
use web_sys::{Document, MessageEvent, WebSocket, Window};

use crate::{
    model::StreamEnvelope,
    render,
    state::{apply_envelope, UiState},
    status::{self, ConnectionState},
};

pub(crate) fn start_stream(
    window: &Window,
    document: &Document,
    state: Rc<RefCell<UiState>>,
) -> Result<(), JsValue> {
    let _ = status::set(document, ConnectionState::Connecting);

    let websocket_url = stream_url(window)?;
    let ws = WebSocket::new(&websocket_url)?;

    install_onopen(&ws, document);
    install_onmessage(&ws, document, state);
    install_onclose(&ws, document);
    install_onerror(&ws, document);
    Ok(())
}

fn install_onopen(ws: &WebSocket, document: &Document) {
    let doc_clone = document.clone();
    let callback = Closure::<dyn FnMut(_)>::new(move |_event: web_sys::Event| {
        let _ = status::set(&doc_clone, ConnectionState::Live);
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

fn install_onclose(ws: &WebSocket, document: &Document) {
    let doc_clone = document.clone();
    let callback = Closure::<dyn FnMut(_)>::new(move |_event: web_sys::Event| {
        let _ = status::set(&doc_clone, ConnectionState::Offline);
    });
    ws.set_onclose(Some(callback.as_ref().unchecked_ref()));
    callback.forget();
}

fn install_onerror(ws: &WebSocket, document: &Document) {
    let doc_clone = document.clone();
    let callback = Closure::<dyn FnMut(_)>::new(move |_event: web_sys::Event| {
        let _ = status::set(&doc_clone, ConnectionState::Offline);
    });
    ws.set_onerror(Some(callback.as_ref().unchecked_ref()));
    callback.forget();
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
