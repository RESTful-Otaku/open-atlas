//! Shrink canonical event payloads before STDB storage (less WS + RAM).

use serde_json::{Map, Value};

/// Target max serialized payload size for open-data feeds (module allows 8 KiB).
pub const TARGET_PAYLOAD_BYTES: usize = 8_192;

/// Keys always kept when compacting provider fields.
const KEEP_KEYS: &[&str] = &[
    "icao24",
    "callsign",
    "velocity_mps",
    "true_track_deg",
    "baro_altitude_m",
    "on_ground",
    "magnitude",
    "value",
    "title",
    "category",
    "simulated",
];

/// Build minimal canonical JSON: drop redundant `source_url` (on domain_insight).
pub fn compact_canonical_payload(
    source: &str,
    external_key: &str,
    fields: Map<String, Value>,
) -> Value {
    let mut out = Map::new();
    out.insert("v".to_owned(), Value::from(1));
    out.insert("src".to_owned(), Value::String(source.to_owned()));
    out.insert("eid".to_owned(), Value::String(external_key.to_owned()));

    for key in KEEP_KEYS {
        if let Some(v) = fields.get(*key) {
            if !v.is_null() {
                out.insert((*key).to_owned(), v.clone());
            }
        }
    }

    let serialized = Value::Object(out.clone());
    if serde_json::to_string(&serialized)
        .map(|s| s.len())
        .unwrap_or(0)
        <= TARGET_PAYLOAD_BYTES
    {
        return serialized;
    }

    for key in out.keys().cloned().collect::<Vec<_>>() {
        if !matches!(key.as_str(), "v" | "src" | "eid") {
            out.remove(&key);
        }
    }
    Value::Object(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn drops_source_url_and_uses_short_keys() {
        let mut fields = Map::new();
        fields.insert("magnitude".to_owned(), json!(4.2));
        let p = compact_canonical_payload("usgs", "abc", fields);
        assert_eq!(p["v"], 1);
        assert_eq!(p["src"], "usgs");
        assert_eq!(p["eid"], "abc");
        assert!(p.get("source_url").is_none());
    }
}
