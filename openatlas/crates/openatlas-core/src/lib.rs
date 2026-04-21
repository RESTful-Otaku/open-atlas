use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct CountryCode(pub String);

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct GridRegionId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct EnergyAssetId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct TransmissionLinkId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Country {
    pub code: CountryCode,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridRegion {
    pub id: GridRegionId,
    pub country_code: CountryCode,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EnergySource {
    Solar,
    Wind,
    Hydro,
    Nuclear,
    Gas,
    Coal,
    Oil,
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnergyAsset {
    pub id: EnergyAssetId,
    pub region_id: GridRegionId,
    pub source: EnergySource,
    pub capacity_mw: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SourceCredibility {
    OfficialBody,
    ScientificInstitution,
    PeerReviewedJournal,
    AttributedNews,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSource {
    pub source_id: String,
    pub publisher: String,
    pub dataset_name: String,
    pub source_url: String,
    pub license: String,
    pub credibility: SourceCredibility,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceReference {
    pub source_id: String,
    pub source_url: String,
    pub methodology_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnergyGenerationEvent {
    pub event_id: Uuid,
    pub asset_id: EnergyAssetId,
    pub region_id: GridRegionId,
    pub generated_mwh: f64,
    pub event_time: DateTime<Utc>,
    pub source: String,
    pub ingest_batch_id: String,
    pub ingested_at: DateTime<Utc>,
    pub source_reference: SourceReference,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnergyConsumptionEvent {
    pub event_id: Uuid,
    pub region_id: GridRegionId,
    pub consumed_mwh: f64,
    pub event_time: DateTime<Utc>,
    pub source: String,
    pub ingest_batch_id: String,
    pub ingested_at: DateTime<Utc>,
    pub source_reference: SourceReference,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarbonEmissionEvent {
    pub event_id: Uuid,
    pub region_id: GridRegionId,
    pub emitted_tco2: f64,
    pub event_time: DateTime<Utc>,
    pub source: String,
    pub ingest_batch_id: String,
    pub ingested_at: DateTime<Utc>,
    pub source_reference: SourceReference,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketPriceSnapshot {
    pub region_id: GridRegionId,
    pub price_per_mwh_usd: f64,
    pub event_time: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransmissionLink {
    pub id: TransmissionLinkId,
    pub from_region: GridRegionId,
    pub to_region: GridRegionId,
    pub capacity_mw: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetEnergyBalance {
    pub region_id: GridRegionId,
    pub generated_mwh: f64,
    pub consumed_mwh: f64,
    pub net_mwh: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarbonIntensityIndex {
    pub region_id: GridRegionId,
    pub grams_co2_per_kwh: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridStabilityIndex {
    pub region_id: GridRegionId,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenewablePenetrationRatio {
    pub region_id: GridRegionId,
    pub ratio: f64,
}

#[derive(Debug, Clone, Default)]
pub struct OpenAtlasState {
    pub countries: BTreeMap<CountryCode, Country>,
    pub regions: BTreeMap<GridRegionId, GridRegion>,
    pub assets: BTreeMap<EnergyAssetId, EnergyAsset>,
    pub transmission_links: BTreeMap<TransmissionLinkId, TransmissionLink>,
    pub generation_events: Vec<EnergyGenerationEvent>,
    pub consumption_events: Vec<EnergyConsumptionEvent>,
    pub carbon_events: Vec<CarbonEmissionEvent>,
    pub market_price_snapshots: Vec<MarketPriceSnapshot>,
    pub net_balance: BTreeMap<GridRegionId, NetEnergyBalance>,
    pub carbon_intensity: BTreeMap<GridRegionId, CarbonIntensityIndex>,
    pub grid_stability: BTreeMap<GridRegionId, GridStabilityIndex>,
    pub renewable_ratio: BTreeMap<GridRegionId, RenewablePenetrationRatio>,
    pub processed_event_ids: BTreeSet<Uuid>,
    pub source_registry: BTreeMap<String, DataSource>,
}

#[derive(Debug, Error)]
pub enum ValidationError {
    #[error("value must be non-negative")]
    NegativeValue,
    #[error("unknown region id: {0}")]
    UnknownRegion(String),
    #[error("untrusted source id: {0}")]
    UntrustedSource(String),
    #[error("invalid source url")]
    InvalidSourceUrl,
}

pub fn validate_non_negative(value: f64) -> Result<(), ValidationError> {
    if value < 0.0 {
        return Err(ValidationError::NegativeValue);
    }
    Ok(())
}

pub fn validate_source_reference(
    source_registry: &BTreeMap<String, DataSource>,
    source_reference: &SourceReference,
) -> Result<(), ValidationError> {
    let Some(source) = source_registry.get(&source_reference.source_id) else {
        return Err(ValidationError::UntrustedSource(
            source_reference.source_id.clone(),
        ));
    };
    let is_http = source_reference.source_url.starts_with("https://")
        || source_reference.source_url.starts_with("http://");
    if !is_http || source.source_url != source_reference.source_url {
        return Err(ValidationError::InvalidSourceUrl);
    }
    Ok(())
}
