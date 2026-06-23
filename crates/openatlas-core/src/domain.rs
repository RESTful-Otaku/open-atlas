

use std::str::FromStr;

use serde::{Deserialize, Serialize};

/// All domains OpenAtlas reasons about.
/// Only append new variants — reordering would silently reinterpret existing rows.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Domain {
    Energy,
    Finance,
    Climate,
    Seismic,
    Transport,
    Health,
    Geospatial,
    Economy,
    Geopolitics,
    Cyber,
    Space,
    Demographics,
    Infrastructure,
}

impl Domain {
    pub const fn as_str(&self) -> &'static str {
        match self {
            Domain::Energy => "energy",
            Domain::Finance => "finance",
            Domain::Climate => "climate",
            Domain::Seismic => "seismic",
            Domain::Transport => "transport",
            Domain::Health => "health",
            Domain::Geospatial => "geospatial",
            Domain::Economy => "economy",
            Domain::Geopolitics => "geopolitics",
            Domain::Cyber => "cyber",
            Domain::Space => "space",
            Domain::Demographics => "demographics",
            Domain::Infrastructure => "infrastructure",
        }
    }

    pub const ALL: [Domain; 13] = [
        Domain::Energy,
        Domain::Finance,
        Domain::Climate,
        Domain::Seismic,
        Domain::Transport,
        Domain::Health,
        Domain::Geospatial,
        Domain::Economy,
        Domain::Geopolitics,
        Domain::Cyber,
        Domain::Space,
        Domain::Demographics,
        Domain::Infrastructure,
    ];
}

impl std::fmt::Display for Domain {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for Domain {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.to_ascii_lowercase().as_str() {
            "energy" => Ok(Domain::Energy),
            "finance" => Ok(Domain::Finance),
            "climate" => Ok(Domain::Climate),
            "seismic" => Ok(Domain::Seismic),
            "transport" => Ok(Domain::Transport),
            "health" => Ok(Domain::Health),
            "geospatial" => Ok(Domain::Geospatial),
            "economy" => Ok(Domain::Economy),
            "geopolitics" => Ok(Domain::Geopolitics),
            "cyber" => Ok(Domain::Cyber),
            "space" => Ok(Domain::Space),
            "demographics" => Ok(Domain::Demographics),
            "infrastructure" => Ok(Domain::Infrastructure),
            _ => Err(format!("unknown domain: {value}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_all_variants() {
        for domain in Domain::ALL.iter() {
            let parsed: Domain = domain.as_str().parse().expect("known variant");
            assert_eq!(&parsed, domain);
        }
    }

    #[test]
    fn rejects_unknown_domain() {
        assert!("not-a-domain".parse::<Domain>().is_err());
    }

    #[test]
    fn domain_count_matches_stdb_tag_cap() {
        const STDB_MAX_DOMAIN_TAG: u8 = 12;
        assert_eq!(Domain::ALL.len(), STDB_MAX_DOMAIN_TAG as usize + 1);
    }
}
