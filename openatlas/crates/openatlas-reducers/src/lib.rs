use anyhow::{Result, anyhow};
use openatlas_core::{
    CarbonEmissionEvent, CarbonIntensityIndex, EnergyConsumptionEvent, EnergyGenerationEvent,
    GridRegionId, GridStabilityIndex, NetEnergyBalance, OpenAtlasState, RenewablePenetrationRatio,
    ValidationError, validate_non_negative, validate_source_reference,
};

pub fn ingest_generation_event(
    state: &mut OpenAtlasState,
    event: EnergyGenerationEvent,
) -> Result<()> {
    validate_non_negative(event.generated_mwh)?;
    ensure_region_exists(state, &event.region_id)?;
    validate_source_reference(&state.source_registry, &event.source_reference)?;
    if !state.processed_event_ids.insert(event.event_id) {
        return Ok(());
    }
    state.generation_events.push(event.clone());
    calculate_energy_balance(state, &event.region_id);
    update_carbon_metrics(state, &event.region_id);
    update_grid_state(state, &event.region_id);
    Ok(())
}

pub fn ingest_consumption_event(
    state: &mut OpenAtlasState,
    event: EnergyConsumptionEvent,
) -> Result<()> {
    validate_non_negative(event.consumed_mwh)?;
    ensure_region_exists(state, &event.region_id)?;
    validate_source_reference(&state.source_registry, &event.source_reference)?;
    if !state.processed_event_ids.insert(event.event_id) {
        return Ok(());
    }
    state.consumption_events.push(event.clone());
    calculate_energy_balance(state, &event.region_id);
    update_carbon_metrics(state, &event.region_id);
    update_grid_state(state, &event.region_id);
    Ok(())
}

pub fn update_grid_state(state: &mut OpenAtlasState, region_id: &GridRegionId) {
    let balance = state
        .net_balance
        .get(region_id)
        .map(|v| v.net_mwh)
        .unwrap_or(0.0);
    let score = (100.0 - balance.abs().min(100.0)).max(0.0);
    state.grid_stability.insert(
        region_id.clone(),
        GridStabilityIndex {
            region_id: region_id.clone(),
            score,
        },
    );
}

pub fn calculate_energy_balance(state: &mut OpenAtlasState, region_id: &GridRegionId) {
    let generated: f64 = state
        .generation_events
        .iter()
        .filter(|event| &event.region_id == region_id)
        .map(|event| event.generated_mwh)
        .sum();
    let consumed: f64 = state
        .consumption_events
        .iter()
        .filter(|event| &event.region_id == region_id)
        .map(|event| event.consumed_mwh)
        .sum();
    state.net_balance.insert(
        region_id.clone(),
        NetEnergyBalance {
            region_id: region_id.clone(),
            generated_mwh: generated,
            consumed_mwh: consumed,
            net_mwh: generated - consumed,
        },
    );
}

pub fn update_carbon_metrics(state: &mut OpenAtlasState, region_id: &GridRegionId) {
    let generated_mwh = state
        .net_balance
        .get(region_id)
        .map(|n| n.generated_mwh)
        .unwrap_or(0.0);
    let emitted_tco2: f64 = state
        .carbon_events
        .iter()
        .filter(|event| &event.region_id == region_id)
        .map(|event| event.emitted_tco2)
        .sum();
    let grams_co2_per_kwh = if generated_mwh > 0.0 {
        (emitted_tco2 * 1_000_000.0) / (generated_mwh * 1_000.0)
    } else {
        0.0
    };
    state.carbon_intensity.insert(
        region_id.clone(),
        CarbonIntensityIndex {
            region_id: region_id.clone(),
            grams_co2_per_kwh,
        },
    );

    let renewable_generation = state
        .generation_events
        .iter()
        .filter(|event| &event.region_id == region_id)
        .map(|event| event.generated_mwh * 0.4)
        .sum::<f64>();
    let ratio = if generated_mwh > 0.0 {
        renewable_generation / generated_mwh
    } else {
        0.0
    };
    state.renewable_ratio.insert(
        region_id.clone(),
        RenewablePenetrationRatio {
            region_id: region_id.clone(),
            ratio,
        },
    );
}

pub fn ingest_carbon_event(state: &mut OpenAtlasState, event: CarbonEmissionEvent) -> Result<()> {
    validate_non_negative(event.emitted_tco2)?;
    ensure_region_exists(state, &event.region_id)?;
    validate_source_reference(&state.source_registry, &event.source_reference)?;
    if !state.processed_event_ids.insert(event.event_id) {
        return Ok(());
    }
    state.carbon_events.push(event.clone());
    update_carbon_metrics(state, &event.region_id);
    Ok(())
}

fn ensure_region_exists(state: &OpenAtlasState, region_id: &GridRegionId) -> Result<()> {
    if state.regions.contains_key(region_id) {
        Ok(())
    } else {
        Err(anyhow!(ValidationError::UnknownRegion(region_id.0.clone())))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use openatlas_core::{
        Country, CountryCode, DataSource, GridRegion, SourceCredibility, SourceReference,
    };
    use uuid::Uuid;

    fn seeded_state() -> OpenAtlasState {
        let mut state = OpenAtlasState::default();
        let code = CountryCode("US".into());
        state.countries.insert(
            code.clone(),
            Country {
                code: code.clone(),
                name: "United States".into(),
            },
        );
        state.regions.insert(
            GridRegionId("us-west".into()),
            GridRegion {
                id: GridRegionId("us-west".into()),
                country_code: code,
                name: "US West".into(),
            },
        );
        state.source_registry.insert(
            "source-test".into(),
            DataSource {
                source_id: "source-test".into(),
                publisher: "Test ISO".into(),
                dataset_name: "Test Dataset".into(),
                source_url: "https://example.org/dataset".into(),
                license: "CC-BY-4.0".into(),
                credibility: SourceCredibility::OfficialBody,
            },
        );
        state
    }

    #[test]
    fn duplicate_generation_event_is_idempotent() {
        let mut state = seeded_state();
        let event = EnergyGenerationEvent {
            event_id: Uuid::new_v4(),
            asset_id: openatlas_core::EnergyAssetId("a1".into()),
            region_id: GridRegionId("us-west".into()),
            generated_mwh: 10.0,
            event_time: Utc::now(),
            source: "test".into(),
            ingest_batch_id: "b1".into(),
            ingested_at: Utc::now(),
            source_reference: SourceReference {
                source_id: "source-test".into(),
                source_url: "https://example.org/dataset".into(),
                methodology_url: None,
            },
        };
        ingest_generation_event(&mut state, event.clone()).expect("first insert should succeed");
        ingest_generation_event(&mut state, event).expect("duplicate should be ignored");
        assert_eq!(state.generation_events.len(), 1);
    }

    #[test]
    fn negative_consumption_is_rejected() {
        let mut state = seeded_state();
        let event = EnergyConsumptionEvent {
            event_id: Uuid::new_v4(),
            region_id: GridRegionId("us-west".into()),
            consumed_mwh: -1.0,
            event_time: Utc::now(),
            source: "test".into(),
            ingest_batch_id: "b1".into(),
            ingested_at: Utc::now(),
            source_reference: SourceReference {
                source_id: "source-test".into(),
                source_url: "https://example.org/dataset".into(),
                methodology_url: None,
            },
        };
        assert!(ingest_consumption_event(&mut state, event).is_err());
    }
}
