//! Global map summary, rendered as a self-contained SVG with a soft
//! graticule, radial backdrop, and domain-coloured event markers.

use std::collections::HashMap;

use wasm_bindgen::JsValue;
use web_sys::Document;

use crate::{
    layout::{domain_color, project_equirectangular},
    state::UiState,
};

use super::require_element;

const MAP_WIDTH: f64 = 1600.0;
const MAP_HEIGHT: f64 = 760.0;

pub(super) fn render(document: &Document, state: &UiState) -> Result<(), JsValue> {
    let map = require_element(document, "map-summary")?;

    let mut counts: HashMap<String, usize> = HashMap::new();
    let mut markers = String::new();

    for event in &state.events {
        *counts.entry(event.domain.clone()).or_insert(0) += 1;
        if !state.matches_domain(&event.domain) {
            continue;
        }
        let Some(location) = &event.location else {
            continue;
        };
        if !(-90.0..=90.0).contains(&location.lat) || !(-180.0..=180.0).contains(&location.lon) {
            continue;
        }

        let (x, y) = project_equirectangular(location.lat, location.lon, MAP_WIDTH, MAP_HEIGHT);
        let radius = (3.0 + event.severity_score * 16.0).clamp(3.0, 18.0);
        let glow_radius = radius + 6.0;
        let color = domain_color(&event.domain);

        let _ = std::fmt::Write::write_fmt(
            &mut markers,
            format_args!(
                r#"<g>
                  <circle cx="{x:.2}" cy="{y:.2}" r="{glow_radius:.2}"
                          fill="{color}" fill-opacity="0.14"/>
                  <circle cx="{x:.2}" cy="{y:.2}" r="{radius:.2}"
                          fill="{color}" fill-opacity="0.88">
                    <title>{domain} · severity {severity:.2}</title>
                  </circle>
                </g>"#,
                x = x,
                y = y,
                glow_radius = glow_radius,
                radius = radius,
                color = color,
                domain = event.domain,
                severity = event.severity_score,
            ),
        );
    }

    let svg = render_svg(&markers);
    let legend = render_legend(&counts);

    map.set_inner_html(&format!(
        r#"<div class="world-map-wrap">{svg}</div>{legend}"#,
    ));
    Ok(())
}

fn render_svg(markers: &str) -> String {
    // Soft equirectangular graticule. Lines are deliberately subtle —
    // the markers (and eventually the basemap) carry the signal; the
    // grid only gives spatial reference.
    let mut graticule = String::new();
    for i in 1..6 {
        let y = MAP_HEIGHT * (i as f64) / 6.0;
        let _ = std::fmt::Write::write_fmt(
            &mut graticule,
            format_args!(
                r#"<line x1="0" y1="{y:.0}" x2="{w}" y2="{y:.0}"/>"#,
                y = y,
                w = MAP_WIDTH,
            ),
        );
    }
    for i in 1..12 {
        let x = MAP_WIDTH * (i as f64) / 12.0;
        let _ = std::fmt::Write::write_fmt(
            &mut graticule,
            format_args!(
                r#"<line x1="{x:.0}" y1="0" x2="{x:.0}" y2="{h}"/>"#,
                x = x,
                h = MAP_HEIGHT,
            ),
        );
    }

    // Equator / prime-meridian drawn slightly stronger as orientation cues.
    let equator_y = MAP_HEIGHT / 2.0;
    let meridian_x = MAP_WIDTH / 2.0;

    format!(
        r#"<svg class="world-map"
             viewBox="0 0 {MAP_WIDTH} {MAP_HEIGHT}"
             preserveAspectRatio="xMidYMid meet"
             role="img"
             aria-label="OpenAtlas live world map">
           <defs>
             <radialGradient id="oa-map-glow" cx="50%" cy="50%" r="65%">
               <stop offset="0%" stop-color="rgba(34,211,238,0.10)"/>
               <stop offset="100%" stop-color="rgba(7,10,16,0)"/>
             </radialGradient>
           </defs>
           <rect x="0" y="0" width="{MAP_WIDTH}" height="{MAP_HEIGHT}" fill="url(#oa-map-glow)"/>
           <g stroke="rgba(148,163,184,0.08)" stroke-width="1">{graticule}</g>
           <g stroke="rgba(148,163,184,0.22)" stroke-width="1">
             <line x1="0" y1="{equator_y}" x2="{MAP_WIDTH}" y2="{equator_y}"/>
             <line x1="{meridian_x}" y1="0" x2="{meridian_x}" y2="{MAP_HEIGHT}"/>
           </g>
           <g>{markers}</g>
         </svg>"#,
    )
}

fn render_legend(counts: &HashMap<String, usize>) -> String {
    if counts.is_empty() {
        return String::new();
    }
    let mut items: Vec<(&String, &usize)> = counts.iter().collect();
    items.sort_by(|a, b| b.1.cmp(a.1).then(a.0.cmp(b.0)));

    let mut html = String::from(r#"<div class="map-legend">"#);
    for (domain, count) in items {
        let color = domain_color(domain);
        let _ = std::fmt::Write::write_fmt(
            &mut html,
            format_args!(
                r#"<span class="legend-item" style="--card-accent: {color}">
                  <span class="swatch" style="background: {color}"></span>
                  {domain}
                  <span class="legend-count">{count}</span>
                </span>"#,
            ),
        );
    }
    html.push_str("</div>");
    html
}
