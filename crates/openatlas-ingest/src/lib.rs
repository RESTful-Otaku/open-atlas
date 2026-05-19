//! OpenAtlas ingest library — feed adapters, validation, and SpacetimeDB client.
//!
//! The binary (`main.rs`) is a thin wrapper; integration tests and tools
//! import this crate.

pub mod circuit;
pub mod logging;
pub mod feed_config;
pub mod feed_poll;
pub mod feeds;
pub mod metrics;
pub mod payload_compact;
pub mod pipeline;
pub mod local_env;
pub mod rate_limit;
pub mod fixtures;
pub mod health;
pub mod ingest_mode;
pub mod routes;
pub mod simulator;
pub mod state;
pub mod stdb;
pub mod validate;
