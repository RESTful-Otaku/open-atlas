# ADR 0001: SpacetimeDB as Source of Truth

## Status
Accepted

## Context
OpenAtlas needs global realtime state, deterministic state transitions, and low-latency subscriptions
across multiple projections (web, TUI, AI).

## Decision
SpacetimeDB is the only system of record. All mutations must pass through reducers. Projection layers
must consume state by subscriptions and query snapshots, not by direct writes or shadow databases.

## Consequences
- Positive: single consistency model, native replayability, clear event lineage.
- Positive: shared reducer semantics across all clients.
- Tradeoff: reducer quality and schema discipline become critical early lifecycle concerns.
