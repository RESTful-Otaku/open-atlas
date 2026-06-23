//! Panel descriptor types and the [`PanelDescriptor`] plug-in surface.

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::state::UiState;

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

pub(crate) type RenderFn = fn(&Document, &UiState) -> Result<(), JsValue>;

#[derive(Clone, Copy)]
pub(crate) struct PanelDescriptor {
    pub id: &'static str,
    pub title: &'static str,
    pub container: Container,
    pub span: u8,
    pub show_header: bool,
    pub body: BodyStyle,
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
