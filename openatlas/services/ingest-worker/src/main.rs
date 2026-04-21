use anyhow::Result;
use chrono::Utc;
use openatlas_core::{
    Country, CountryCode, DataSource, GridRegion, GridRegionId, SourceCredibility,
};
use openatlas_ingest::{CsvGenerationSource, GenerationSource, normalize_generation_record};
use spacetime_client::SpacetimeGateway;

fn main() -> Result<()> {
    let mut gateway = SpacetimeGateway::default();

    let country = Country {
        code: CountryCode("DE".to_string()),
        name: "Germany".to_string(),
    };
    let region = GridRegion {
        id: GridRegionId("de-central".to_string()),
        country_code: country.code.clone(),
        name: "Germany Central".to_string(),
    };
    gateway
        .state
        .countries
        .insert(country.code.clone(), country);
    gateway.state.regions.insert(region.id.clone(), region);
    gateway.state.source_registry.insert(
        "source-test".to_string(),
        DataSource {
            source_id: "source-test".to_string(),
            publisher: "OpenAtlas Seed Source".to_string(),
            dataset_name: "Seed Generation Dataset".to_string(),
            source_url: "https://example.org/open-energy-dataset".to_string(),
            license: "CC-BY-4.0".to_string(),
            credibility: SourceCredibility::OfficialBody,
        },
    );

    let source = CsvGenerationSource {
        csv_data: "region_id,asset_id,generated_mwh,event_time\n\
                   de-central,asset-1,120.5,2026-01-01T00:00:00Z\n"
            .to_string(),
    };
    let batch_id = format!("seed-{}", Utc::now().format("%Y%m%d%H%M%S"));
    let ingested_at = Utc::now();
    for raw in source.fetch()? {
        let event = normalize_generation_record(
            raw,
            &batch_id,
            source.source_name(),
            source.source_id(),
            source.source_url(),
            ingested_at,
        );
        gateway.submit_generation(event)?;
    }

    println!(
        "ingest complete: generation_events={}, net_balance_regions={}",
        gateway.state.generation_events.len(),
        gateway.state.net_balance.len()
    );
    Ok(())
}
