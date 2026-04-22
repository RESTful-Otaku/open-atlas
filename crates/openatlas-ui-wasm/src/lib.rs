//! WASM entry point for the OpenAtlas live dashboard.
//!
//! Module layout:
//! * [`model`] — DTOs matching the ingest `StreamEnvelope`.
//! * [`state`] — bounded, deterministic UI state + mutations.
//! * [`layout`] — static HTML shell, colours, map projection, sparklines.
//! * [`render`] — per-panel DOM renderers + `PanelDescriptor` plug-in
//!   surface.
//! * [`stream`] — WebSocket lifecycle + connection-status plumbing.
//! * [`status`] — tiny helper that owns the top-bar status pill.
//!
//! This file wires those modules together and owns the only
//! user-interaction hook on the dashboard (the domain filter).

use std::{cell::RefCell, rc::Rc};

use wasm_bindgen::{closure::Closure, prelude::*, JsCast};
use web_sys::{Document, Element, HtmlElement, Window};

mod layout;
mod model;
mod render;
mod state;
mod status;
mod stream;

use crate::state::UiState;

#[wasm_bindgen(start)]
pub fn start() -> Result<(), JsValue> {
    let window = get_window()?;
    let document = get_document(&window)?;
    layout::ensure_layout(&document)?;

    let state = Rc::new(RefCell::new(UiState::default()));
    hook_filter(&document, state.clone())?;
    stream::start_stream(&window, &document, state)?;
    Ok(())
}

/// Binds click handlers to every `.segmented-btn` in the filter group.
/// A single delegated listener on the group would be more compact, but
/// binding per-button keeps the closure capture shape identical to the
/// previous `<select>` implementation and avoids DOM-attribute sniffing
/// on every click.
fn hook_filter(document: &Document, state: Rc<RefCell<UiState>>) -> Result<(), JsValue> {
    let group = document
        .get_element_by_id("domain-filter-group")
        .ok_or_else(|| JsValue::from_str("missing #domain-filter-group"))?;

    let buttons = document.query_selector_all("#domain-filter-group .segmented-btn")?;
    for index in 0..buttons.length() {
        let Some(node) = buttons.item(index) else {
            continue;
        };
        let button = node.dyn_into::<HtmlElement>()?;
        bind_filter_button(document, &group, button, state.clone())?;
    }
    Ok(())
}

fn bind_filter_button(
    document: &Document,
    group: &Element,
    button: HtmlElement,
    state: Rc<RefCell<UiState>>,
) -> Result<(), JsValue> {
    let doc_clone = document.clone();
    let group_clone = group.clone();
    let button_clone = button.clone();
    let state_clone = state.clone();

    let closure = Closure::<dyn FnMut(_)>::new(move |_event: web_sys::Event| {
        let value = button_clone
            .get_attribute("data-value")
            .unwrap_or_else(|| "all".to_owned());

        mark_active(&group_clone, &button_clone);

        let mut ui_state = state_clone.borrow_mut();
        ui_state.selected_domain = if value == "all" { None } else { Some(value) };
        let _ = render::render(&doc_clone, &ui_state);
    });

    button.set_onclick(Some(closure.as_ref().unchecked_ref()));
    closure.forget();
    Ok(())
}

/// Flips the `.is-active` / `aria-checked` state across the segmented
/// group so exactly one option is selected at all times.
fn mark_active(group: &Element, active: &HtmlElement) {
    let Some(document) = active.owner_document() else {
        return;
    };
    let Ok(buttons) = document.query_selector_all("#domain-filter-group .segmented-btn") else {
        return;
    };
    let group_id = group.id();
    if group_id != "domain-filter-group" {
        return;
    }
    for index in 0..buttons.length() {
        let Some(node) = buttons.item(index) else {
            continue;
        };
        let Ok(element) = node.dyn_into::<Element>() else {
            continue;
        };
        let _ = element.class_list().remove_1("is-active");
        let _ = element.set_attribute("aria-checked", "false");
    }
    let _ = active.class_list().add_1("is-active");
    let _ = active.set_attribute("aria-checked", "true");
}

fn get_window() -> Result<Window, JsValue> {
    web_sys::window().ok_or_else(|| JsValue::from_str("window not available"))
}

fn get_document(window: &Window) -> Result<Document, JsValue> {
    window
        .document()
        .ok_or_else(|| JsValue::from_str("document not available"))
}
