# OpenAtlas Technical Specification

_System-design authority. Complements [`ARCHITECTURE.md`](ARCHITECTURE.md),
which documents the code-level realization of this spec._

## Overview

OpenAtlas is a real-time, global data intelligence platform for
observation, analysis, and visualization of planetary-scale systems.

It is built as a **unified reactive programmable state engine** with
SpacetimeDB as the authoritative backbone:

- **SpacetimeDB** — single source of truth. Owns the schema, the
  durable log, and every state-changing reducer. Clients (web, CLI,
  ingest) are stateless consumers.
- **Rust** — the reducer module (`openatlas-stdb-module`), the feed
  supervisor / pusher (`openatlas-ingest`), and the terminal inspector
  (`openatlas-cli`).
- **Svelte 5 + TypeScript + MapLibre + ECharts** — the live dashboard,
  subscribing to stdb rows over WebSocket via
  `@clockworklabs/spacetimedb-sdk`.
- **Event-driven** end-to-end: producers write through reducers,
  consumers subscribe to row updates.

OpenAtlas is **not**: microservice sprawl, batch ETL, or traditional
analytics. It is one reducer log, one deterministic module, and many
subscribers.

---

## Engineering Principles (Binding)

These take precedence over local convenience when they conflict.

### Simplicity & Separation of Concerns

- Small, single-responsibility modules; no module owns more than one
  clearly named concern.
- No global mutable state; every dependency is passed explicitly.
- Interfaces are minimal, stable, and strongly typed.

### Determinism inside the module

- Reducers **never** read the wall clock. Every state transition takes
  an explicit `timestamp` argument.
- Reducers never perform I/O outside the table APIs.
- A replay of the recorded reducer log against a fresh SpacetimeDB
  instance must yield byte-identical tables.
- All randomness is explicit: if an algorithm needs entropy, it takes a
  seed as a parameter.

### Bounded Resources

- Every table that accepts streaming writes has a compile-time row cap
  enforced by `prune_rings` in the reducer epilogue.
- Every in-process ring has a compile-time or config-time upper bound.
- Every HTTP request has a timeout; every feed has a per-cycle event
  cap; rate limiters shed load rather than queue it.

### Invariants & Defensive Programming

- Module boundaries carry `debug_assert!` for cheap post-conditions
  (severity in `[0,1]`, ordinal monotonic, row cap respected, …).
- Input validation is aggressive and fail-closed: ambiguity → reject.
- No compiler, linter (`clippy -D warnings`), or test warning is
  tolerated.

### Plug-in Architecture

High-churn extension points — **data feeds** and **dashboard panels** —
are registry-driven. Adding a new feed is exactly two edits (new file
+ one `REGISTRY` entry); adding a new panel is one Svelte component.

### Readability & Review

- Every function should fit on one screen. Decompose when it grows
  beyond that.
- Comments explain _why_, not _what_.
- Code is written assuming a reviewer without context will maintain it
  under production pressure.

---

## Architecture

### Crate graph

```
openatlas-core ─────────► pure DTOs (Domain, WorldEvent, Signal, …)
      ▲
      ├─ openatlas-stdb-module   cdylib → SpacetimeDB wasm module
      │                          (tables + reducers; authoritative)
      ├─ openatlas-ingest        feeds + sim → reducer HTTP calls
      │                          axum /health, /ready, /status
      └─ openatlas-cli           clap + reqwest → stdb SQL HTTP endpoint

web/  (outside cargo workspace)  Svelte + Vite + stdb TypeScript SDK
                                 live WebSocket subscriptions into stdb
```

`openatlas-core` is a shared vocabulary only; it owns no state and
performs no I/O.

### Repository layout

```
/openatlas
├── crates/
│   ├── openatlas-core/          pure DTOs + reference reducers
│   ├── openatlas-stdb-module/   SpacetimeDB module (authoritative)
│   ├── openatlas-ingest/        feeds + sim → reducer pusher
│   └── openatlas-cli/           terminal inspector (SQL over HTTP)
├── web/                         Svelte + Vite + stdb TS SDK dashboard
├── ARCHITECTURE.md              module-level design + invariants
├── OPENATLAS_SPEC.md            this file
├── README.md
└── dev.sh                       gum-powered developer harness
```

`crates/openatlas-ui-wasm/` remains in the tree as historical
reference only (excluded from the workspace) and is slated for
removal.

---

## Core Database Layer (SpacetimeDB)

SpacetimeDB is the authoritative backbone. The module in
`crates/openatlas-stdb-module` is a `cdylib` that compiles to
`wasm32-unknown-unknown` via the SpacetimeDB CLI and is published
into a local / hosted SpacetimeDB instance.

### Tables

| Table              | Row cap  | Purpose                                |
| ------------------ | -------- | -------------------------------------- |
| `event`            | 50 000   | Immutable `WorldEvent` facts. Indexed by `id` (u64 primary key) with a monotonic `ordinal`. |
| `signal`           | 10 000   | Anomaly signals emitted by the inference step. |
| `causal_edge`      | 10 000   | Directed influence between two event ids. |
| `world_state`      | unbounded (= domain count) | Per-domain aggregate (event count, avg severity, risk index, last update). |
| `domain_insight`   | unbounded | Latest narrative per domain with source URL. |
| `last_event_in_domain` | unbounded | Scratch table for incremental aggregation. |
| `ordinal_counter`  | 1 row    | Monotonic sequencer for `event.ordinal` (private). |

### Wire types

`WorldEvent` fields: `id: u64`, `timestamp: Timestamp`, `domain: u8`
(indexed into `DOMAIN_CATALOG`), `severity_score: f64 ∈ [0.0, 1.0]`,
`location: Option<{lat, lon}>`, `payload_json: String`, `ordinal: u64`.

`CausalEdge` fields: `id: u64`, `source_event_id: u64`,
`target_event_id: u64`, `influence_score: f64`, `decay_rate: f64`.

### Reducers

State mutates through reducers only. Every reducer is deterministic,
atomic, and takes an explicit timestamp — never the wall clock.

- **`init()`** — seeds `ordinal_counter`.
- **`ingest_event(id, timestamp, domain, severity, location,
  payload_json, source_label, source_url)`** — validate, clamp
  severity, append, emit a `signal` when severity crosses the anomaly
  threshold, update `world_state` incrementally, prune rings.
- **`link_causal_events(source_id, target_id, influence, decay)`** —
  deduplicated edge insert; prune rings.

### Subscriptions

Clients read through subscriptions against SQL projections of the
tables. The dashboard subscribes to:

```sql
SELECT * FROM event         ORDER BY ordinal DESC LIMIT N  -- see note
SELECT * FROM signal        ORDER BY id      DESC LIMIT N
SELECT * FROM causal_edge   ORDER BY id      DESC LIMIT N
SELECT * FROM world_state
SELECT * FROM domain_insight
```

> SpacetimeDB 2.1 SQL does not yet support `ORDER BY` or aggregates
> against the `sql` HTTP endpoint. Subscriptions accept the full
> clause; the CLI — which uses the HTTP SQL endpoint — fetches the
> whole (bounded) table and sorts client-side. The table row caps make
> this tractable.

---

## Data Ingestion Layer (`openatlas-ingest`)

### Responsibilities

- Run supervised live-feed adapters and the deterministic simulator.
- Normalise every source payload into a `WorldEvent`.
- Call `ingest_event` on the SpacetimeDB module over HTTP.
- Expose `/health`, `/ready`, `/status` for operational visibility.

It holds no authoritative state. There is no in-memory graph, no
JSONL log, no broadcast channel. All durable state lives in the
module's tables.

### Plug-in Contract: Feed Adapters (Binding)

Every live data source is a self-contained plug-in:

1. Export `async fn fetch(client: Client) -> anyhow::Result<Vec<WorldEvent>>`.
2. Export `pub(super) const DESCRIPTOR: FeedDescriptor`:

   ```rust
   pub(crate) struct FeedDescriptor {
       pub name: &'static str,              // stable kebab-case id
       pub source_url: &'static str,        // public docs/homepage URL
       pub poll_interval: Duration,         // respects provider rate limits
       pub requires_env: Option<&'static str>, // env var gate, or None
       pub fetch: FetchFn,                  // fn(Client) -> BoxFuture<...>
   }
   ```

3. `feeds::REGISTRY` is a `const` slice of descriptors. Supervision,
   backoff, dormancy, `/status` health seeding, and source-URL lookup
   all derive from this registry.

**Adding a new feed is exactly two edits.** There is no parallel
`FEED_NAMES`, no per-feed spawn arm, no `match source { ... }`.

### Ingress Guards

- API key enforcement on admin-adjacent surfaces (fail-closed when
  configured but invalid).
- Per-request payload size cap.
- All configuration failures reject traffic rather than silently
  permitting it.

### Deterministic Event Identity

Feed event ids are derived from `UUIDv5(NAMESPACE_URL,
"{source}:{external_key}")` and then folded into a `u64` via the
stable `uuid_to_u64` helper in `ingest/src/stdb.rs`. Re-polling the
same upstream record yields the same `event.id`, so downstream dedup
is trivial and reducer calls are idempotent.

---

## Frontend (Svelte 5 + Vite + stdb TypeScript SDK)

### Stack

- Svelte 5 (runes mode: `$state`, `$derived`, `$effect`).
- Vite 5 for dev/build, Bun as the package manager.
- `@clockworklabs/spacetimedb-sdk` for the live connection.
- MapLibre GL for the global event map (CARTO dark basemap).
- Apache ECharts for the causal force graph and severity heatmap.
- `@lucide/svelte` for icons.

### Data flow

1. `connectDb()` (in `lib/connection.svelte.ts`) builds a
   `DbConnection` against `VITE_STDB_URI` / `VITE_STDB_DB` using the
   generated bindings under `lib/stdb/`.
2. On connect, it installs row handlers (`onInsert`, `onUpdate`,
   `onDelete`) for `event`, `signal`, `causal_edge`, `world_state`,
   `domain_insight` and subscribes to bounded SQL projections.
3. Handlers call `apply/remove*` helpers in `lib/state.svelte.ts`,
   which project the camelCase SDK row shapes into snake_case UI DTOs
   and merge them into the reactive `dashboard` store.
4. Svelte components in `lib/components/` read from `dashboard` and
   re-render reactively.

### Panels

The MVP panel set, mounted in `src/App.svelte`:

- **Global Map** — MapLibre map with severity-coloured markers.
- **Domain Panels** — per-domain aggregate cards with trend
  classification (sparkline over `domainSeverityHistory[domain]`).
- **Generated Insights** — narrative cards with source attribution.
- **Anomaly Indicators** — `recentSignals` list, filtered by domain.
- **Causal Graph** — ECharts force layout over `recentCausalEdges`.
- **Severity Heatmap** — ECharts heatmap of domain × time buckets.
- **Live Event Stream** — bounded scrolling list of the latest events.

### Domain Catalogue

`lib/colors.ts::DOMAIN_CATALOG` drives every domain-aware surface in
the UI (filter dropdowns, accent colours, legends). `lib/domain.ts`
maps the module's numeric `u8` tag to the catalogue id; a runtime
assertion fails fast if the two lists drift.

### Client-side Invariants

- `dashboard.events`, `recentSignals`, `recentCausalEdges` are bounded
  by `MAX_EVENTS`, `MAX_SIGNALS`, `MAX_CAUSAL_EDGES`.
- `mergeOrAppendById` is O(n) per update and preserves ordering.
- Domain ids are always strings in the UI; the numeric tag never
  leaves `domain.ts`.
- Reconnect uses exponential backoff with a capped maximum.
- Per-panel failures do not prevent other panels from updating.

---

## CLI / Terminal Inspector

### Stack

- Rust + `clap` + `reqwest` + `serde_json`.
- Talks to SpacetimeDB over the HTTP SQL endpoint (`POST
  /v1/database/<db>/sql`).
- Deliberately does **not** use the SDK yet: the CLI is a polling
  operator tool, not a live client. The live view is the Svelte app.

### Commands

```
openatlas-cli view events [--domain X] [--limit N] [--watch [--interval-ms MS]]
openatlas-cli state       [--domain X]
openatlas-cli anomalies   [--domain X] [--limit N]
openatlas-cli trace EVENT_ID
```

`EVENT_ID` is a decimal `u64`. Timestamps decode from the three SATS
wire shapes SpacetimeDB 2.1 emits (object tag, one-element array,
plain integer). Client-side sorting is documented in `http.rs`.

---

## Inference Layer

Authoritative: inline in `ingest_event` inside the SpacetimeDB module.
A severity threshold crossing emits a `signal` row in the same
transaction as the originating `event`, so subscribers see them
atomically.

The reference implementation in
`openatlas-core/src/inference.rs::ThresholdInferenceEngine` is kept
for unit tests and future richer engines (rule-based, statistical,
model-backed). It is not used at runtime.

**No** full ML in the initial milestones. Leave extension points only.

---

## Determinism & Replay

Determinism is a first-class product property:

- Clocks and I/O live at the **edges** (feed workers, ingest HTTP
  client, browser sockets).
- Reducer state transitions take `timestamp: Timestamp` as an
  argument.
- Severity scores are clamped at the ingest boundary into `[0.0,
  1.0]` (NaN → rejected); `debug_assert!` re-checks this in the
  module.
- Feed event ids are deterministic (UUIDv5 over `source:key`, folded
  into `u64`).
- A recorded reducer log replayed against a fresh SpacetimeDB
  instance must reconstruct tables byte-for-byte.

A replay harness is on the roadmap; the determinism contract is
already exercised by the ingest wire-layout unit test and the CLI row
decoder tests.

---

## System Constraints

### Latency

- Target end-to-end propagation (ingest → subscribed client):
  **< 200 ms**.
- Mechanism: SpacetimeDB subscription broadcast.
- Anti-pattern: client polling (accepted only in the CLI).

### Consistency

- SpacetimeDB is the sole authority.
- Clients subscribe; they never hold independent business state.
- No duplicated domain logic across the module and the client.

### Throughput

| Tier        | Target events / second |
| ----------- | ---------------------- |
| MVP         | 1 000 – 10 000         |
| Scale       | 100 000+               |

Partitioning by domain and/or time window is left as a future scale
lever. The reducer's ring caps today provide back-pressure by
overwriting oldest rows.

### Security

- No secrets in source. Feeds that require credentials declare
  `requires_env` in their descriptor; the supervisor holds them
  dormant when the env var is absent.
- Ingress guards are fail-closed on configuration error.
- Input is validated and normalised before it reaches the reducer.

---

## Milestones

### Phase 1 — Core + mock ingest (complete)

- Schema, reducer shapes, query DTOs in `openatlas-core`.
- Mock ingestion generators.

### Phase 2 — Reactive dashboard (complete, superseded)

- The original WASM dashboard has been replaced by a Svelte 5
  dashboard with live MapLibre + ECharts panels.

### Phase 3 — Inference + causality (complete)

- Threshold anomaly detection, signal emission on ingest, causal
  linking (automatic + manual).

### Phase 4 — Terminal observability (complete, reshaped)

- Terminal view is now a minimal `openatlas-cli` built on the stdb
  SQL endpoint. The prior ratatui live TUI was retired; the live view
  is the Svelte app.

### Phase 5 — Live open-data feeds (complete)

- Supervised feed runner with deterministic UUIDs, exponential
  backoff, per-feed health.
- Nine adapters: USGS, Open-Meteo, CoinGecko, NASA EONET, OpenSky,
  GDELT, World Bank, FRED (key-gated), EIA (key-gated).
- Registry-driven plug-in surface.

### Phase 6 — SpacetimeDB backbone (complete)

- `openatlas-stdb-module` owns schema + reducers + pruning.
- `openatlas-ingest` is a stateless pusher; no in-memory graph, no
  JSONL store, no broadcast channel.
- Dashboard uses `@clockworklabs/spacetimedb-sdk` for subscriptions.
- CLI queries the HTTP SQL endpoint.
- `dev.sh` orchestrates `spacetime start`, publish, stop, logs.

### Phase 7 — Production hardening (in progress)

- Replay harness that feeds a recorded reducer log into a fresh
  SpacetimeDB instance and asserts byte-identical state.
- Benchmark / perf harness against the 10k+ events/sec tier.
- Native SDK subscriptions in the CLI to replace polling.
- Additional feeds: OSM Overpass, Our World in Data, NASA EONET
  polygons.
- Deployment packaging + observability (metrics, tracing exporter).

### Stretch (not yet)

- Planetary digital twin simulation.
- Prediction engine.
- Multi-region distributed replication.
- Advanced ML causal inference.

---

## Coding Requirements

- Rust-first on the backend. The frontend is Svelte 5 + TypeScript
  (strict mode, runes).
- `cargo fmt`, `cargo clippy -D warnings`, `cargo test`, and
  `bun run build` (which runs `svelte-check`) must all pass in CI
  before merge.
- Prefer stable, widely-used libraries (`tokio`, `axum`, `serde`,
  `reqwest`, `clap`, `svelte`, `vite`, `maplibre-gl`, `echarts`,
  `@clockworklabs/spacetimedb-sdk`). No niche/experimental deps.
- Small commits with clear messages; meaningful branch names.
- All non-trivial logic has automated tests. Tests are deterministic.
- No function on a hot path may be longer than ~60 lines; decompose.
- Every public function has a doc comment explaining _why_ it exists
  and what invariants it relies on.

---

## Cursor Instructions

Build incrementally. Consult this spec and `ARCHITECTURE.md` at every
iteration.

When in doubt about any third-party API, protocol, or tool (especially
SpacetimeDB's still-evolving SQL / reducer HTTP surface), verify
against the **current** online documentation before implementing.

**Do not** regress into service fragmentation, unbounded buffers,
non-deterministic reducers, or ad-hoc registration surfaces. Those are
the load-bearing properties of OpenAtlas; the rest is commentary.
