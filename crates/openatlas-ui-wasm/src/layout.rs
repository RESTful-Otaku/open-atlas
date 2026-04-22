//! Static layout scaffolding, map projection, sparklines, and the
//! shared domain catalogue.
//!
//! The dashboard section list is **derived from** [`crate::render::REGISTRY`]
//! so adding a panel never requires editing HTML here. The top-bar
//! (brand, status, filter container) lives in `web/index.html` for
//! first-paint speed; this module only populates:
//!
//! - `#domain-filter-group` with segmented buttons driven by
//!   [`DOMAIN_CATALOG`];
//! - `#app` with one `<section class="panel">` per entry in the
//!   registry.

use std::fmt::Write as _;

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::render;

/// Canonical set of domain ids the UI knows about, paired with their
/// accent colour. This is the single source of truth consumed by the
/// filter dropdown, [`domain_color`], and the per-row / per-card
/// accent-colour plumbing.
///
/// Domain ids mirror `openatlas_core::Domain` so filter values match
/// server-side event domains without runtime translation.
pub(crate) const DOMAIN_CATALOG: &[(&str, &str)] = &[
    ("energy", "#f59e0b"),
    ("finance", "#22c55e"),
    ("climate", "#3b82f6"),
    ("seismic", "#ef4444"),
    ("transport", "#14b8a6"),
    ("health", "#e11d48"),
    ("geospatial", "#a855f7"),
    ("economy", "#84cc16"),
    ("geopolitics", "#f97316"),
    ("cyber", "#ec4899"),
    ("space", "#6366f1"),
    ("demographics", "#fb7185"),
    ("infrastructure", "#0ea5e9"),
];

/// Installs the dashboard skeleton into `#app` on first mount and the
/// segmented filter buttons into `#domain-filter-group`. Subsequent
/// calls are idempotent — the panel renderers own their contents and
/// update in place.
pub(crate) fn ensure_layout(document: &Document) -> Result<(), JsValue> {
    ensure_filter(document)?;
    ensure_panels(document)?;
    Ok(())
}

fn ensure_panels(document: &Document) -> Result<(), JsValue> {
    let app = document
        .get_element_by_id("app")
        .ok_or_else(|| JsValue::from_str("missing #app container"))?;
    if app.child_element_count() != 0 {
        return Ok(());
    }
    app.set_inner_html(&build_dashboard_html());
    Ok(())
}

fn ensure_filter(document: &Document) -> Result<(), JsValue> {
    let group = document
        .get_element_by_id("domain-filter-group")
        .ok_or_else(|| JsValue::from_str("missing #domain-filter-group"))?;
    if group.child_element_count() != 0 {
        return Ok(());
    }
    group.set_inner_html(&build_filter_html());
    Ok(())
}

/// Generates the dashboard HTML by concatenating one `<section
/// class="panel">` per entry in [`render::REGISTRY`]. The grid span and
/// header visibility are driven by the descriptor fields — this module
/// is layout plumbing only and has no panel-specific knowledge.
fn build_dashboard_html() -> String {
    let mut html = String::with_capacity(2048);
    for descriptor in render::REGISTRY {
        let tag = descriptor.container.tag();
        let body_class = descriptor.body.css();
        let span = descriptor.span;

        let _ = write!(
            html,
            "<section class=\"panel\" data-span=\"{span}\" \
             style=\"--span:{span}\">"
        );

        if descriptor.show_header {
            let _ = write!(
                html,
                "<header class=\"panel-header\">\
                   <h2 class=\"panel-title\">{title}</h2>\
                 </header>",
                title = descriptor.title,
            );
        }

        let _ = write!(
            html,
            "<{tag} id=\"{id}\" class=\"{body_class}\"></{tag}>",
            tag = tag,
            id = descriptor.id,
            body_class = body_class,
        );

        html.push_str("</section>");
    }
    html
}

/// Generates the segmented filter buttons. One "All" option is always
/// present; the rest mirror [`DOMAIN_CATALOG`] so adding a domain is
/// still a single-entry edit.
fn build_filter_html() -> String {
    let mut html = String::with_capacity(512);
    html.push_str(
        "<button type=\"button\" class=\"segmented-btn is-active\" \
         role=\"radio\" aria-checked=\"true\" data-value=\"all\">All</button>",
    );
    for (id, color) in DOMAIN_CATALOG {
        let _ = write!(
            html,
            "<button type=\"button\" class=\"segmented-btn\" \
             role=\"radio\" aria-checked=\"false\" \
             data-value=\"{id}\" style=\"--btn-accent:{color}\">\
             {label}</button>",
            id = id,
            color = color,
            label = capitalize(id),
        );
    }
    html
}

fn capitalize(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_uppercase().chain(chars).collect(),
    }
}

pub(crate) fn project_equirectangular(lat: f64, lon: f64, width: f64, height: f64) -> (f64, f64) {
    let x = ((lon + 180.0) / 360.0) * width;
    let y = ((90.0 - lat) / 180.0) * height;
    (x, y)
}

/// Returns the accent colour for a known domain, or a neutral fallback
/// for unknown ids. Consumers should prefer this over hardcoding hex
/// values so [`DOMAIN_CATALOG`] stays the single source of truth.
pub(crate) fn domain_color(domain: &str) -> &'static str {
    for (id, color) in DOMAIN_CATALOG {
        if *id == domain {
            return color;
        }
    }
    "#cbd5e1"
}

/// Severity-bar percentage, already clamped. Centralised here so every
/// panel produces identical visuals for the same severity.
pub(crate) fn severity_percent(score: f64) -> f64 {
    (score.clamp(0.0, 1.0)) * 100.0
}

/// Renders a small inline SVG sparkline. Deterministic: given the same
/// series and colour it always produces byte-identical markup. Empty
/// series return a flat guide line so the panel does not shift.
pub(crate) fn sparkline_svg(values: &[f64], color: &str) -> String {
    const WIDTH: f64 = 240.0;
    const HEIGHT: f64 = 36.0;
    const PAD: f64 = 2.0;

    if values.len() < 2 {
        return format!(
            "<svg class=\"sparkline\" viewBox=\"0 0 {WIDTH} {HEIGHT}\" \
             preserveAspectRatio=\"none\" role=\"img\" aria-label=\"sparkline\">\
             <line x1=\"0\" y1=\"{mid}\" x2=\"{WIDTH}\" y2=\"{mid}\" \
                   stroke=\"{color}\" stroke-opacity=\"0.25\" \
                   stroke-width=\"1.2\" stroke-dasharray=\"2 3\"/></svg>",
            mid = HEIGHT / 2.0,
        );
    }

    let min = values.iter().cloned().fold(f64::INFINITY, f64::min);
    let max = values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let range = (max - min).max(0.0001);
    let step = (WIDTH - PAD * 2.0) / (values.len() as f64 - 1.0).max(1.0);

    let mut points = String::with_capacity(values.len() * 12);
    for (i, value) in values.iter().enumerate() {
        let x = PAD + step * i as f64;
        let normalised = (value - min) / range;
        let y = PAD + (1.0 - normalised) * (HEIGHT - PAD * 2.0);
        if i > 0 {
            points.push(' ');
        }
        let _ = write!(points, "{x:.2},{y:.2}");
    }

    format!(
        "<svg class=\"sparkline\" viewBox=\"0 0 {WIDTH} {HEIGHT}\" \
         preserveAspectRatio=\"none\" role=\"img\" aria-label=\"sparkline\">\
         <polyline fill=\"none\" stroke=\"{color}\" stroke-width=\"1.6\" \
                   stroke-linejoin=\"round\" stroke-linecap=\"round\" \
                   points=\"{points}\"/></svg>"
    )
}
