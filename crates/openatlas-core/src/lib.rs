//! `openatlas-core` — the reactive world-model kernel.
//!
//! This crate intentionally contains **no I/O, no networking, no wall-clock
//! time reads inside reducers**. It exposes:
//!
//! * [`Domain`] — the fixed taxonomy of event categories.
//! * Value DTOs in [`mod@event`] — every wire type, serde-ready.
//! * [`CoreError`] — the narrow error surface produced by reducers.
//! * [`InferenceEngine`] / [`ThresholdInferenceEngine`] — the pluggable
//!   anomaly/forecast hook.
//! * [`WorldGraph`] — the authoritative in-process state and the set of
//!   reducers that transform it.
//!
//! The module layout mirrors the intended SpacetimeDB schema: each field on
//! [`WorldGraph`] becomes a table, each reducer method becomes a
//! `#[spacetimedb::reducer]`, and `Domain`/`Location`/etc. become
//! `SpacetimeType`s. See `ARCHITECTURE.md` for the migration plan.

pub mod domain;
pub mod error;
pub mod event;
pub mod graph;
pub mod inference;

pub use domain::Domain;
pub use error::CoreError;
pub use event::{
    CausalEdge, EntityNode, Location, Prediction, QueryFilters, Signal, WorldEvent, WorldState,
};
pub use graph::WorldGraph;
pub use inference::{InferenceEngine, ThresholdInferenceEngine};
