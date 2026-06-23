//! Static layout scaffolding, map projection, sparklines, and the domain catalogue.
//! Sections are derived from [`crate::render::REGISTRY`].

use std::fmt::Write as _;

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::render;

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

/// Idempotent — installs skeleton and filter buttons on first mount.
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

/// Accent colour for a domain, or a neutral fallback for unknown ids.
pub(crate) fn domain_color(domain: &str) -> &'static str {
    for (id, color) in DOMAIN_CATALOG {
        if *id == domain {
            return color;
        }
    }
    "#cbd5e1"
}

/// Severity as a 0–100 percentage, clamped.
pub(crate) fn severity_percent(score: f64) -> f64 {
    (score.clamp(0.0, 1.0)) * 100.0
}

/// Small inline SVG sparkline. Empty series returns a flat guide line.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_equirectangular_origin() {
        let (x, y) = project_equirectangular(0.0, 0.0, 800.0, 400.0);
        assert!((x - 400.0).abs() < 1e-9, "x={x}");
        assert!((y - 200.0).abs() < 1e-9, "y={y}");
    }

    #[test]
    fn project_equirectangular_north_pole() {
        let (x, y) = project_equirectangular(90.0, 0.0, 800.0, 400.0);
        assert!((x - 400.0).abs() < 1e-9, "x={x}");
        assert!((y - 0.0).abs() < 1e-9, "y={y}");
    }

    #[test]
    fn project_equirectangular_south_pole() {
        let (x, y) = project_equirectangular(-90.0, 0.0, 800.0, 400.0);
        assert!((x - 400.0).abs() < 1e-9, "x={x}");
        assert!((y - 400.0).abs() < 1e-9, "y={y}");
    }

    #[test]
    fn project_equirectangular_dateline() {
        let (x1, y1) = project_equirectangular(0.0, 180.0, 800.0, 400.0);
        assert!((x1 - 800.0).abs() < 1e-9, "x={x1}");
        let (x2, y2) = project_equirectangular(0.0, -180.0, 800.0, 400.0);
        assert!((x2 - 0.0).abs() < 1e-9, "x={x2}");
        assert!((y1 - y2).abs() < 1e-9, "y mismatch");
    }

    #[test]
    fn project_equirectangular_aspect_independent() {
        let (x, y) = project_equirectangular(45.0, -75.0, 1600.0, 760.0);
        assert!((x - 466.6666666666667).abs() < 1e-9, "x={x}");
        assert!((y - 190.0).abs() < 1e-9, "y={y}");
    }

    #[test]
    fn project_equirectangular_zero_size() {
        let (x, y) = project_equirectangular(0.0, 0.0, 0.0, 0.0);
        assert!((x - 0.0).abs() < 1e-9, "x={x}");
        assert!((y - 0.0).abs() < 1e-9, "y={y}");
    }

    #[test]
    fn domain_color_known_entries_return_accent() {
        for (id, color) in DOMAIN_CATALOG {
            assert_eq!(domain_color(id), *color, "mismatch for {id}");
        }
    }

    #[test]
    fn domain_color_unknown_returns_fallback() {
        assert_eq!(domain_color("nonexistent"), "#cbd5e1");
        assert_eq!(domain_color(""), "#cbd5e1");
    }

    #[test]
    fn domain_color_is_case_sensitive() {
        assert_eq!(domain_color("Energy"), "#cbd5e1");
        assert_eq!(domain_color("energy"), "#f59e0b");
    }

    #[test]
    fn severity_percent_clamps_low() {
        assert!((severity_percent(-0.5) - 0.0).abs() < 1e-9);
    }

    #[test]
    fn severity_percent_clamps_high() {
        assert!((severity_percent(1.5) - 100.0).abs() < 1e-9);
    }

    #[test]
    fn severity_percent_mid_range() {
        assert!((severity_percent(0.5) - 50.0).abs() < 1e-9);
    }

    #[test]
    fn severity_percent_boundaries() {
        assert!((severity_percent(0.0) - 0.0).abs() < 1e-9);
        assert!((severity_percent(1.0) - 100.0).abs() < 1e-9);
    }

    #[test]
    fn sparkline_svg_empty_returns_flat_guide() {
        let svg = sparkline_svg(&[], "#f00");
        assert!(svg.contains("<svg"));
        assert!(svg.contains("stroke-dasharray"));
        assert!(svg.contains("#f00"));
    }

    #[test]
    fn sparkline_svg_single_value_returns_flat_guide() {
        let svg = sparkline_svg(&[0.5], "#00f");
        assert!(svg.contains("<svg"));
        assert!(svg.contains("stroke-dasharray"));
    }

    #[test]
    fn sparkline_svg_two_values_draws_polyline() {
        let svg = sparkline_svg(&[0.2, 0.8], "#0f0");
        assert!(svg.contains("<polyline"));
        assert!(!svg.contains("stroke-dasharray"));
    }

    #[test]
    fn sparkline_svg_many_values() {
        let svg = sparkline_svg(&[0.1, 0.3, 0.5, 0.7, 0.9], "#abc");
        assert!(svg.contains("<polyline"));
        assert!(svg.contains("#abc"));
        assert!(svg.contains("points="));
    }

    #[test]
    fn sparkline_svg_all_same_value() {
        let svg = sparkline_svg(&[0.5, 0.5, 0.5], "#333");
        assert!(svg.contains("<polyline"));
    }

    #[test]
    fn sparkline_svg_constant_dimensions() {
        let svg = sparkline_svg(&[0.0, 1.0], "#000");
        assert!(svg.contains("viewBox=\"0 0 240 36\""));
    }

    #[test]
    fn capitalize_empty_string() {
        assert_eq!(capitalize(""), "");
    }

    #[test]
    fn capitalize_single_char() {
        assert_eq!(capitalize("a"), "A");
    }

    #[test]
    fn capitalize_lowercase_word() {
        assert_eq!(capitalize("energy"), "Energy");
    }

    #[test]
    fn capitalize_already_capitalized() {
        assert_eq!(capitalize("Energy"), "Energy");
    }

    #[test]
    fn capitalize_multi_word() {
        assert_eq!(capitalize("hello world"), "Hello world");
    }

    #[test]
    fn capitalize_leading_whitespace() {
        assert_eq!(capitalize("  hello"), "  hello");
    }

    #[test]
    fn domain_catalog_entries_are_unique() {
        let mut seen_ids = std::collections::HashSet::new();
        for (id, _) in DOMAIN_CATALOG {
            assert!(
                seen_ids.insert(id),
                "duplicate domain id in DOMAIN_CATALOG: {id}"
            );
        }
    }

    #[test]
    fn domain_catalog_has_no_empty_ids_or_colors() {
        for (id, color) in DOMAIN_CATALOG {
            assert!(!id.is_empty(), "empty domain id");
            assert!(!color.is_empty(), "empty color for {id}");
            assert!(
                color.starts_with('#'),
                "color {color} for {id} must start with #"
            );
        }
    }

    #[test]
    fn domain_color_roundtrip() {
        for (id, color) in DOMAIN_CATALOG {
            assert_eq!(domain_color(id), *color);
        }
    }
}
