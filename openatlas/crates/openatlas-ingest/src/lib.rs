use anyhow::{Result, anyhow};
use chrono::{DateTime, Utc};
use openatlas_analytics::load_generation_csv;
use openatlas_core::{EnergyAssetId, EnergyGenerationEvent, GridRegionId, SourceReference};
use polars::prelude::AnyValue;
use uuid::Uuid;

pub struct RawGenerationRecord {
    pub region_id: String,
    pub asset_id: String,
    pub generated_mwh: f64,
    pub event_time: DateTime<Utc>,
}

pub trait GenerationSource {
    fn fetch(&self) -> Result<Vec<RawGenerationRecord>>;
    fn source_name(&self) -> &'static str;
    fn source_url(&self) -> &'static str;
    fn source_id(&self) -> &'static str;
}

pub struct CsvGenerationSource {
    pub csv_data: String,
}

impl GenerationSource for CsvGenerationSource {
    fn fetch(&self) -> Result<Vec<RawGenerationRecord>> {
        let df = load_generation_csv(&self.csv_data)?;
        let region = df.column("region_id")?;
        let asset = df.column("asset_id")?;
        let generated = df.column("generated_mwh")?;
        let time = df.column("event_time")?;

        let mut output = Vec::with_capacity(df.height());
        for idx in 0..df.height() {
            let region_id = region.get(idx)?.to_string();
            let asset_id = asset.get(idx)?.to_string();
            let generated_mwh = match generated.get(idx)? {
                AnyValue::Float64(v) => v,
                AnyValue::Float32(v) => v as f64,
                AnyValue::Int64(v) => v as f64,
                AnyValue::Int32(v) => v as f64,
                other => {
                    return Err(anyhow!(
                        "unsupported numeric type for generated_mwh: {other:?}"
                    ));
                }
            };
            let event_time = DateTime::parse_from_rfc3339(&time.get(idx)?.to_string())
                .map_err(|e| anyhow!("invalid event_time: {e}"))?
                .with_timezone(&Utc);
            output.push(RawGenerationRecord {
                region_id,
                asset_id,
                generated_mwh,
                event_time,
            });
        }
        Ok(output)
    }

    fn source_name(&self) -> &'static str {
        "csv_generation_source"
    }

    fn source_url(&self) -> &'static str {
        "https://example.org/open-energy-dataset"
    }

    fn source_id(&self) -> &'static str {
        "source-test"
    }
}

pub fn normalize_generation_record(
    raw: RawGenerationRecord,
    ingest_batch_id: &str,
    source: &str,
    source_id: &str,
    source_url: &str,
    ingested_at: DateTime<Utc>,
) -> EnergyGenerationEvent {
    let deterministic = Uuid::new_v5(
        &Uuid::NAMESPACE_OID,
        format!(
            "{}|{}|{}|{}",
            source, raw.region_id, raw.asset_id, raw.event_time
        )
        .as_bytes(),
    );
    EnergyGenerationEvent {
        event_id: deterministic,
        asset_id: EnergyAssetId(raw.asset_id),
        region_id: GridRegionId(raw.region_id),
        generated_mwh: raw.generated_mwh,
        event_time: raw.event_time,
        source: source.to_string(),
        ingest_batch_id: ingest_batch_id.to_string(),
        ingested_at,
        source_reference: SourceReference {
            source_id: source_id.to_string(),
            source_url: source_url.to_string(),
            methodology_url: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn normalization_is_deterministic() {
        let raw = RawGenerationRecord {
            region_id: "region-1".into(),
            asset_id: "asset-1".into(),
            generated_mwh: 25.0,
            event_time: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
        };
        let left = normalize_generation_record(
            raw,
            "batch-a",
            "source-a",
            "source-a-id",
            "https://example.org/a",
            Utc::now(),
        );
        let raw2 = RawGenerationRecord {
            region_id: "region-1".into(),
            asset_id: "asset-1".into(),
            generated_mwh: 25.0,
            event_time: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
        };
        let right = normalize_generation_record(
            raw2,
            "batch-b",
            "source-a",
            "source-a-id",
            "https://example.org/a",
            Utc::now(),
        );
        assert_eq!(left.event_id, right.event_id);
    }
}
