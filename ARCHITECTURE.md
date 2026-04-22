# OpenAtlas Architecture

Code-level architecture of OpenAtlas: module layout per crate, the
invariants each module upholds, and how the system composes on top of
SpacetimeDB. For product scope, feeds, and milestones see
[`OPENATLAS_SPEC.md`](OPENATLAS_SPEC.md).

Guiding principles:

- **SpacetimeDB is the backbone.** The module is the single source of
  truth; everything else is a thin client. No other process keeps
  authoritative state.
- **Determinism in the module.** Reducers take an explicit
  `timestamp`; they never read the wall clock, never perform I/O, and
  never allocate unboundedly. A replay of the same reducer log must
  yield byte-identical tables.
- **Bounded resources.** Every table has a hard row cap; every
  in-process ring has a compile-time upper bound; every HTTP request
  has a timeout. We shed load at the edge, we don't queue it.
- **Plug-in at the edges.** Feed adapters (ingest) and UI panels (web)
  are registry-driven: one file + one entry in a `const` list.
- **NASA / TigerBeetle style.** Short functions, aggressive input
  validation, fail-closed on ambiguity, zero tolerated warnings.

## Crate graph

```
openatlas-core ─────────► pure DTOs (Domain, WorldEvent, Signal, …)
      ▲
      │
      ├─ openatlas-stdb-module   cdylib → SpacetimeDB WASM module
      │                          (tables + reducers; authoritative)
      │
      ├─ openatlas-ingest        axum + feed adapters; calls reducers
      │                          over HTTP; stateless pusher
      │
      └─ openatlas-cli           clap + reqwest; queries stdb SQL
                                 endpoint; polling, no SDK yet

web/  (outside cargo workspace)  Svelte 5 + Vite + @clockworklabs
                                 TypeScript SDK; live WebSocket
                                 subscriptions into stdb
```

`openatlas-core` is a type dictionary only. It owns no state and
performs no I/O; every other crate depends on it so the wire shapes
stay identical across boundaries.

## `openatlas-stdb-module` — the authoritative state

A `cdylib` compiled to `wasm32-unknown-unknown` via the SpacetimeDB
CLI. Everything that outlives a request lives here.

```
src/
└── lib.rs   ── tables + reducers + pruning helpers
```

### Tables

| Table              | Row cap  | Notes                                  |
| ------------------ | -------- | -------------------------------------- |
| `event`            | 50 000   | Immutable observations. `ordinal` is a monotonic u64 sequence number; `domain` is a u8 tag. |
| `signal`           | 10 000   | Anomaly signals linked to an event id. |
| `causal_edge`      | 10 000   | Directed influence between two event ids. |
| `world_state`      | unbounded (= domain count) | Per-domain aggregate (count, avg severity, risk). |
| `domain_insight`   | unbounded | Latest narrative per domain.          |
| `last_event_in_domain` | unbounded | Scratch table for incremental aggregation. |
| `ordinal_counter`  | 1 row    | Private sequencer; not part of the read API. |

### Reducers

Reducers are the **only** way to change state. Each one is a short,
deterministic function with an explicit timestamp argument.

- `init()` — seeds `ordinal_counter`. Runs once at first publish.
- `ingest_event(id, timestamp, domain, severity, location, payload_json, source_label, source_url)`
  — clamps severity to `[0.0, 1.0]`, appends to `event`, emits a
  `signal` when severity crosses the anomaly threshold, updates
  `world_state` incrementally, and prunes rings.
- `link_causal_events(source_id, target_id, influence, decay)`
  — de-duplicated edge insert, then prune.

### Invariants

- Severity is always clamped into `[0.0, 1.0]` before storage.
- `event.ordinal` is strictly increasing: it is read from
  `ordinal_counter`, incremented, and written back in the same
  transaction.
- Every reducer calls `prune_rings` at the end. Ring tables can never
  exceed their cap.
- IDs are `u64`. They are opaque to the reducer but deterministic on
  the caller side (the ingest service folds a UUIDv5 into 64 bits).

## `openatlas-ingest` — the stateless pusher

```
src/
├── main.rs       ── init tracing, build AppState, start axum + feeds
├── state.rs      ── AppState { started_at, feed_runtime, stdb }
├── stdb.rs       ── reqwest client → SpacetimeDB reducer HTTP API
├── simulator.rs  ── deterministic event generator for dev/CI
├── health.rs     ── feed + stdb liveness; backoff math
├── routes/
│   ├── mod.rs    ── router: /health, /ready, /status, fallback to web/dist
│   └── health.rs ── handlers for the three endpoints
└── feeds/
    ├── mod.rs      ── REGISTRY, spawn_all, supervisor, deterministic_event_id
    ├── adapter.rs  ── FeedDescriptor + FetchFn
    └── <feed>.rs   ── USGS, Open-Meteo, CoinGecko, NASA EONET,
                       OpenSky, GDELT, World Bank, FRED, EIA
```

### What it does (and doesn't)

- **Does** normalise feed payloads into `WorldEvent`, clamp severity,
  assign a deterministic u64 id, and call `ingest_event` on the
  SpacetimeDB module over HTTP.
- **Does** expose `/health`, `/ready`, `/status` for orchestration and
  dashboards.
- **Does not** keep any authoritative state. There is no in-memory
  graph, no JSONL log, no broadcast channel. If you need something
  durable, it lives in SpacetimeDB.

### Feed plug-in contract

Every feed module exports:

1. `async fn fetch(client: Client) -> anyhow::Result<Vec<WorldEvent>>`.
2. `pub(super) const DESCRIPTOR: FeedDescriptor` with name, source URL,
   poll cadence, optional `requires_env`, and a `FetchFn`.

`feeds::REGISTRY` is a `const` slice. Supervision, backoff, dormancy,
`/status` seeding, and source-URL lookup all derive from the registry.
Adding a feed is **two edits**: the new file and one entry in
`REGISTRY`.

### HTTP reducer calls

`stdb.rs` speaks the SpacetimeDB 2.1 JSON-over-HTTP reducer dialect:

- `Option<T>` is encoded as `{"some": T}` / `{"none": []}`.
- `Timestamp` is wrapped as `{"micros": i64}`.
- `u64` ids are plain JSON numbers (no string wrapping).

The wire layout is exercised by a unit test
(`stdb::tests::ingest_args_layout_is_stable`) so any drift is caught
at compile/test time.

### Determinism boundary

Everything that reads the clock or the network lives at the edges:

- Feed workers (`feeds/*.rs`) poll on a fixed cadence.
- `stdb.rs` performs HTTP I/O.
- `routes/*.rs` accept sockets.

Between ingest boundary and reducer call the pipeline is pure: same
payload in → same reducer arguments out. The reducer itself is
deterministic, so replay of the ingest logs reconstructs state
bit-for-bit.

## `openatlas-cli` — terminal inspector

```
src/
├── main.rs      ── clap surface + dispatch
├── http.rs      ── SpacetimeDB SQL helpers (run_sql, row decoders)
└── commands.rs  ── view events | state | anomalies | trace
```

### Why SQL (not SDK)

The CLI is a polling operator tool, not a live client. Using the HTTP
SQL endpoint keeps the dependency footprint small
(`reqwest + serde_json`) and avoids dragging in `tokio-tungstenite`
just for occasional queries. The interactive live view is the Svelte
dashboard.

### Invariants

- Timestamps decode from three SATS wire shapes (object tag, array
  wrapper, plain integer). All three are covered by unit tests.
- `domain_label` / `tag_for_domain` keep the CLI in lockstep with the
  module's numeric domain tags and the frontend's
  `DOMAIN_CATALOG`. A round-trip test enforces totality.
- SpacetimeDB 2.1 SQL lacks `ORDER BY` and aggregates; fetchers sort
  and truncate client-side after pulling the (bounded) table.

## `web/` — Svelte + SpacetimeDB SDK dashboard

```
web/
├── package.json           bun; depends on svelte, vite, maplibre-gl,
│                          echarts, @lucide/svelte, spacetimedb (SDK)
├── src/
│   ├── main.ts            mount App.svelte, call connectDb()
│   ├── App.svelte         layout + panel composition
│   ├── app.css            dark-first design tokens + base styles
│   ├── lib/
│   │   ├── connection.svelte.ts  DbConnection lifecycle + subscriptions
│   │   ├── state.svelte.ts       $state store; projects SDK rows → UI DTOs
│   │   ├── stdb/                 generated bindings (from spacetime generate)
│   │   ├── domain.ts             u8 tag ↔ string id mapping
│   │   ├── types.ts              UI-facing DTOs (UiEvent, UiSignal, …)
│   │   ├── colors.ts             DOMAIN_CATALOG (id + accent colour)
│   │   └── format.ts             shortId, shortTime, computeTrend
│   └── lib/components/*.svelte   one panel per file
└── vite.config.ts         dev proxy: /health, /ready, /status only
```

### Data flow

1. `connectDb()` uses the generated bindings to build a `DbConnection`
   against `VITE_STDB_URI` / `VITE_STDB_DB`.
2. On connect, it installs row handlers (`onInsert`, `onUpdate`,
   `onDelete`) for `event`, `signal`, `causal_edge`, `world_state`,
   `domain_insight` and subscribes to bounded SQL projections.
3. Handlers call `apply/remove*` helpers in `state.svelte.ts`, which
   convert camelCase SDK rows into snake_case UI DTOs and merge them
   into the reactive `dashboard` store.
4. Svelte components read from `dashboard` and re-render via runes
   (`$state`, `$derived`).

### Invariants

- `dashboard.events`, `recentSignals`, and `recentCausalEdges` are
  bounded by `MAX_EVENTS`, `MAX_SIGNALS`, `MAX_CAUSAL_EDGES`.
- `mergeOrAppendById` keeps list updates O(n) and preserves ordering
  by ordinal / id.
- Domain IDs are always strings in the UI; the numeric tag never
  leaves `domain.ts`.
- Reconnect uses exponential backoff with a capped maximum so a flaky
  stdb instance cannot storm the browser.

## `openatlas-core` — wire DTOs

```
src/
├── lib.rs
├── domain.rs     Domain enum + closed `Domain::ALL`
├── event.rs      WorldEvent, Signal, WorldState, CausalEdge DTOs
├── error.rs      CoreError
├── inference.rs  InferenceEngine trait + threshold baseline
└── graph.rs      Historical in-memory reducer (kept for unit tests
                  and replay fixtures; not used at runtime any more)
```

The crate is intentionally small and allocation-light: it is the
shared vocabulary between the ingest service and the module (on the
Rust side). The `graph.rs` reducer is a reference implementation used
by unit tests; production state lives exclusively in SpacetimeDB.

## Testing strategy

- **Module (`openatlas-stdb-module`)**: compile + publish smoke via
  `dev.sh spacetime:build` / `spacetime:publish`. Reducer behaviour is
  validated end-to-end by the ingest service test fixtures, which
  replay deterministic simulator output against a live stdb.
- **Ingest (`openatlas-ingest`)**: unit tests for feed decoders,
  deterministic id stability, and the `stdb::ingest_args` wire
  layout. `health::tests::backoff_doubles_until_cap` pins the backoff
  curve.
- **CLI (`openatlas-cli`)**: unit tests for domain round-trip and
  every row decoder (including the three timestamp wire shapes).
- **Web**: `svelte-check` in CI; the design is that visual regressions
  are caught by running the app against the simulator.
- **E2E smoke** (`./scripts/e2e-qa.sh` or `./dev.sh e2e`): runs
  `fmt --check`, clippy, tests, `bun run build` in `web/`, `spacetime build`, publishes
  to the local instance, starts **release** `openatlas-ingest` (if
  :8080 is free), checks `/health` + `/ready` + static `index.html` from
  `web/dist/`, and asserts the `event` table count increases while
  simulators run. Use `./dev.sh e2e:quick` to skip the live stack. Requires
  **bun**, `spacetime` CLI, and a running SpacetimeDB (e.g. `./dev.sh
  spacetime:start`).

## How to extend

### Add a feed (2 edits)

1. `crates/openatlas-ingest/src/feeds/<name>.rs` with `fetch` +
   `DESCRIPTOR`.
2. `feeds/mod.rs`: `mod <name>;` and append `<name>::DESCRIPTOR` to
   `REGISTRY`.

### Add a domain (append-only, compile-time-verified)

Adding a domain is additive — never reorder, never renumber. Every
call site below is either a total `match` or a positional list so a
missed edit fails at compile or load.

1. `openatlas-core/src/domain.rs`: append a new `Domain` variant, extend
   `Domain::ALL`, `as_str`, and `FromStr`.
2. `openatlas-ingest/src/stdb.rs`: extend `domain_to_u8` /
   `u8_to_domain` (total match keeps this honest).
3. `openatlas-stdb-module/src/lib.rs`: raise the `ingest_event`
   validator upper bound (`domain > N` where `N == Domain::ALL.len() - 1`).
4. `openatlas-cli/src/http.rs`: append to `DOMAIN_BY_TAG`.
5. `web/src/lib/domain.ts` and `web/src/lib/colors.ts`: append the new
   string id and its accent colour. The runtime assertion in
   `domain.ts` fails fast if the two lists drift.
6. `web/src/app.css`: add a `--domain-<id>` token so components that
   read from CSS variables pick up the accent.

### Add a reducer (1 edit in the module)

Append the reducer to `openatlas-stdb-module/src/lib.rs`, rebuild
with `./dev.sh spacetime:build`, republish with
`./dev.sh spacetime:publish`, and regenerate frontend bindings with
`spacetime generate --lang typescript --out-dir web/src/lib/stdb`.

### Add a dashboard panel

Drop a new Svelte component into `web/src/lib/components/` and mount
it in `App.svelte`. Read from the `dashboard` store; never open a
direct WebSocket.

## SpacetimeDB lifecycle (development)

`dev.sh` owns the full lifecycle:

- `spacetime:build` — `spacetime build --module-path
  crates/openatlas-stdb-module`.
- `spacetime:start` — `spacetime start` as a background process with
  pid file + log under `.dev/`.
- `spacetime:publish` — idempotent `spacetime publish … openatlas`.
- `spacetime:stop` — SIGTERM via the pid file.
- `spacetime:logs` — tail `.dev/spacetime.log`.

The composite `dev.sh all` task chains build → start → publish →
frontend build → ingest start so a fresh machine reaches a running
dashboard in one command.
