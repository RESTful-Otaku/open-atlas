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

/// Estimate serialised JSON byte-length without allocating a string.
fn estimate_json_size(v: &Value) -> usize {
    match v {
        Value::Null => 4,
        Value::Bool(b) => {
            if *b { 4 } else { 5 }
        }
        Value::Number(n) => n.to_string().len(),
        Value::String(s) => s.len() + 2,
        Value::Array(arr) => {
            let mut total = 2;
            for v in arr {
                total += estimate_json_size(v) + 1;
            }
            total
        }
        Value::Object(obj) => {
            let mut total = 2;
            for (k, v) in obj {
                total += k.len() + 3 + estimate_json_size(v) + 1;
            }
            total
        }
    }
}

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

    let size = estimate_json_size(&Value::Object(out.clone()));
    if size <= TARGET_PAYLOAD_BYTES {
        return Value::Object(out);
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
