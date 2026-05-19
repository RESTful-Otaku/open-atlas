//! How the ingest service sources events before pushing them into SpacetimeDB.
//!
//! | Mode     | Simulators | Live open-data feeds | Static fixture burst |
//! | -------- | ---------- | -------------------- | -------------------- |
//! | `sim`    | yes        | no                   | no                   |
//! | `live`   | no         | yes (when keys set)  | no                   |
//! | `hybrid` | yes        | yes (when keys set)  | no                   |
//! | `static` | no         | no                   | once at startup      |
//!
//! `OPENATLAS_INGEST_MODE` selects the mode. `OPENATLAS_ENABLE_LIVE_FEEDS=1`
//! remains supported and implies `live` when the mode variable is unset.

use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IngestMode {
    Sim,
    Live,
    Hybrid,
    Static,
}

impl IngestMode {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            IngestMode::Sim => "sim",
            IngestMode::Live => "live",
            IngestMode::Hybrid => "hybrid",
            IngestMode::Static => "static",
        }
    }

    pub fn simulators_enabled(self) -> bool {
        matches!(self, IngestMode::Sim | IngestMode::Hybrid)
    }

    pub(crate) fn live_feeds_enabled(self) -> bool {
        matches!(self, IngestMode::Live | IngestMode::Hybrid)
    }
}

impl fmt::Display for IngestMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Resolve ingest mode from the environment (with backward-compatible flags).
pub fn ingest_mode() -> IngestMode {
    if let Ok(raw) = std::env::var("OPENATLAS_INGEST_MODE") {
        match raw.trim().to_ascii_lowercase().as_str() {
            "live" | "real" | "production" => return IngestMode::Live,
            "hybrid" | "both" | "sim+live" | "live+sim" => return IngestMode::Hybrid,
            "static" | "fixture" | "fixtures" | "mock" => return IngestMode::Static,
            "sim" | "simulated" | "simulation" => return IngestMode::Sim,
            other => {
                tracing::warn!(
                    ingest_mode = other,
                    "unknown OPENATLAS_INGEST_MODE; falling back to sim/live detection"
                );
            }
        }
    }

    if legacy_live_flag() {
        IngestMode::Live
    } else {
        IngestMode::Sim
    }
}

fn legacy_live_flag() -> bool {
    std::env::var("OPENATLAS_ENABLE_LIVE_FEEDS")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_strings_are_stable() {
        assert_eq!(IngestMode::Sim.as_str(), "sim");
        assert_eq!(IngestMode::Live.as_str(), "live");
        assert_eq!(IngestMode::Hybrid.as_str(), "hybrid");
        assert_eq!(IngestMode::Static.as_str(), "static");
        assert!(!IngestMode::Live.simulators_enabled());
        assert!(IngestMode::Hybrid.simulators_enabled());
        assert!(IngestMode::Live.live_feeds_enabled());
    }
}
