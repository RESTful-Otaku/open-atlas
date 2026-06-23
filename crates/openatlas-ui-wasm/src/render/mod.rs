//! Render orchestrator. Walks [`REGISTRY`] per frame.

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::state::UiState;

mod anomaly;
mod causal;
mod domain;
mod events;
mod insight;
mod kpi;
mod map;
pub(crate) mod panel;

pub(crate) use panel::{BodyStyle, Container, PanelDescriptor};

pub(crate) const REGISTRY: &[PanelDescriptor] = &[
    PanelDescriptor {
        id: "kpi-strip",
        title: "Overview",
        container: Container::Div,
        span: 12,
        show_header: false,
        body: BodyStyle::Flush,
        render: kpi::render,
    },
    PanelDescriptor {
        id: "map-summary",
        title: "Global Event Map",
        container: Container::Div,
        span: 12,
        show_header: true,
        body: BodyStyle::Default,
        render: map::render,
    },
    PanelDescriptor {
        id: "domain-panels",
        title: "Domain Signals",
        container: Container::Div,
        span: 8,
        show_header: true,
        body: BodyStyle::Default,
        render: domain::render,
    },
    PanelDescriptor {
        id: "insight-panels",
        title: "Generated Insights",
        container: Container::Div,
        span: 4,
        show_header: true,
        body: BodyStyle::Scrollable,
        render: insight::render,
    },
    PanelDescriptor {
        id: "event-list",
        title: "Live Event Stream",
        container: Container::Ul,
        span: 6,
        show_header: true,
        body: BodyStyle::FlushScrollable,
        render: events::render,
    },
    PanelDescriptor {
        id: "anomaly-list",
        title: "Anomaly Indicators",
        container: Container::Ul,
        span: 6,
        show_header: true,
        body: BodyStyle::FlushScrollable,
        render: anomaly::render,
    },
    PanelDescriptor {
        id: "causal-graph",
        title: "Causal Graph",
        container: Container::Div,
        span: 12,
        show_header: true,
        body: BodyStyle::Default,
        render: causal::render,
    },
];

/// Dispatches to every registered panel.
pub(crate) fn render(document: &Document, state: &UiState) -> Result<(), JsValue> {
    for descriptor in REGISTRY {
        (descriptor.render)(document, state)?;
    }
    Ok(())
}

/// HTML-escape untrusted strings (XSS defence).
pub(crate) fn escape_html(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => result.push_str("&amp;"),
            '<' => result.push_str("&lt;"),
            '>' => result.push_str("&gt;"),
            '"' => result.push_str("&quot;"),
            '\'' => result.push_str("&#39;"),
            _ => result.push(c),
        }
    }
    result
}

pub(crate) fn require_element(document: &Document, id: &str) -> Result<web_sys::Element, JsValue> {
    document
        .get_element_by_id(id)
        .ok_or_else(|| JsValue::from_str(&format!("missing #{id}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_unique_ids_and_valid_spans() {
        let mut seen = std::collections::HashSet::new();
        for descriptor in REGISTRY {
            assert!(
                seen.insert(descriptor.id),
                "duplicate panel id in REGISTRY: {}",
                descriptor.id
            );
            assert!(!descriptor.title.is_empty());
            assert!(
                (1..=12).contains(&descriptor.span),
                "{} span must be in 1..=12, got {}",
                descriptor.id,
                descriptor.span
            );
        }
    }
}
