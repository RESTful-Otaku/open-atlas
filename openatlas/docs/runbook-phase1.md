# OpenAtlas Phase 1 Runbook

## Prerequisites
- Rust stable toolchain
- Cargo

## Validate workspace
`cargo test --workspace`

## Run ingest worker seed flow
`cargo run -p ingest-worker`

## Expected behavior
- Worker seeds one region and ingests sample generation events.
- Reducer pathway updates net balance and derived metrics.
- Duplicate event IDs are idempotent (covered by tests).
- All ingested events must include a source reference that resolves to a registered source with a valid URL.

## Source transparency policy
- Maintain trusted source entries in `OpenAtlasState.source_registry`.
- Store `source_reference` on every event so users can audit data provenance.
- Prefer official/public primary sources (government agencies, grid operators, scientific institutions).
- Reject reducer writes when source IDs are unknown or source URLs do not match the registry.

## Next integration step
Replace in-memory `SpacetimeGateway` with direct SpacetimeDB reducer RPC calls while preserving
current reducer function signatures and invariant checks.
