//! Plug-in surface for dashboard panels.
//!
//! # Goal
//!
//! Adding a new visualization must require touching exactly **two**
//! places:
//!
//! 1. Create `render/<your_panel>.rs` with
//!    `pub(super) fn render(document: &Document, state: &UiState) -> Result<(), JsValue>`.
//! 2. Declare `mod <your_panel>;` in `render/mod.rs` and append a
//!    [`PanelDescriptor`] to [`crate::render::REGISTRY`].
//!
//! The dashboard layout (section title, mount container, 12-column grid
//! span, header visibility) is derived from the descriptor so `layout.rs`
//! never needs a manual edit when adding a panel.

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::state::UiState;

/// How to shape the panel's mount container in the generated HTML.
/// Most panels render into a `<div>`; list-style panels (event stream,
/// anomaly list) mount into a `<ul>` so their renderers can append
/// `<li>` children without extra nesting.
#[derive(Clone, Copy)]
pub(crate) enum Container {
    Div,
    Ul,
}

impl Container {
    pub(crate) const fn tag(self) -> &'static str {
        match self {
            Container::Div => "div",
            Container::Ul => "ul",
        }
    }
}

/// Optional body modifier classes. `Flush` drops the default padding
/// for panels (e.g. lists) whose children own their own spacing.
#[derive(Clone, Copy)]
pub(crate) enum BodyStyle {
    Default,
    Flush,
    Scrollable,
    FlushScrollable,
}

impl BodyStyle {
    pub(crate) const fn css(self) -> &'static str {
        match self {
            BodyStyle::Default => "panel-body",
            BodyStyle::Flush => "panel-body is-flush",
            BodyStyle::Scrollable => "panel-body is-scrollable",
            BodyStyle::FlushScrollable => "panel-body is-flush is-scrollable",
        }
    }
}

/// Plain fn pointer — keeps the descriptor `const`-constructible and
/// avoids runtime trait-object overhead. Panels never allocate state;
/// they read the [`UiState`] snapshot and imperatively update the DOM.
pub(crate) type RenderFn = fn(&Document, &UiState) -> Result<(), JsValue>;

/// Everything the dashboard needs to know about a panel. No behaviour
/// lives here — only metadata and a render entry point.
#[derive(Clone, Copy)]
pub(crate) struct PanelDescriptor {
    /// DOM id for the mount container. Must be unique across
    /// [`crate::render::REGISTRY`]; the registry's unit test enforces
    /// this at build time.
    pub id: &'static str,
    /// Human-facing section title rendered as an `<h2>`. Ignored when
    /// `show_header` is `false`, but kept for debugging and tests.
    pub title: &'static str,
    /// Shape of the mount container.
    pub container: Container,
    /// 12-column grid span (1..=12). CSS handles responsive collapse.
    pub span: u8,
    /// When `false`, the section chrome (title + divider) is omitted —
    /// useful for hero/KPI rows where panels own their own header.
    pub show_header: bool,
    /// Body padding/scroll modifier.
    pub body: BodyStyle,
    /// Per-frame render function.
    pub render: RenderFn,
}

#[cfg(test)]
mod tests {
    use super::{BodyStyle, Container};

    #[test]
    fn container_div_tag() {
        assert_eq!(Container::Div.tag(), "div");
    }

    #[test]
    fn container_ul_tag() {
        assert_eq!(Container::Ul.tag(), "ul");
    }

    #[test]
    fn body_style_default_css() {
        assert_eq!(BodyStyle::Default.css(), "panel-body");
    }

    #[test]
    fn body_style_flush_css() {
        assert_eq!(BodyStyle::Flush.css(), "panel-body is-flush");
    }

    #[test]
    fn body_style_scrollable_css() {
        assert_eq!(BodyStyle::Scrollable.css(), "panel-body is-scrollable");
    }

    #[test]
    fn body_style_flush_scrollable_css() {
        assert_eq!(
            BodyStyle::FlushScrollable.css(),
            "panel-body is-flush is-scrollable"
        );
    }

    #[test]
    fn container_tag_is_always_lowercase() {
        for tag in &[Container::Div.tag(), Container::Ul.tag()] {
            assert_eq!(tag.to_lowercase(), *tag);
        }
    }

    #[test]
    fn body_style_all_contain_panel_body() {
        for style in &[
            BodyStyle::Default,
            BodyStyle::Flush,
            BodyStyle::Scrollable,
            BodyStyle::FlushScrollable,
        ] {
            assert!(style.css().contains("panel-body"));
        }
    }
}
