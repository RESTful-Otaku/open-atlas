# Testing guide

OpenAtlas uses layered automated tests so regressions surface close to the code that broke: pure unit tests, HTTP integration tests, optional SpacetimeDB integration, client unit tests, and Playwright end-to-end smoke tests in demo mode.

## Quick commands

| Goal | Command |
|------|---------|
| Everything (CI-like, no e2e) | `./scripts/test-all.sh` |
| Rust only | `cargo test --workspace --exclude openatlas-ui-wasm` |
| Ingest HTTP API tests | `cargo test -p openatlas-ingest --test http_api_surface` |
| Web unit tests | `cd web && bun test src/lib` |
| Web typecheck | `cd web && bun run check` |
| E2E (demo, no STDB) | `cd web && bun run build && bun run test:e2e` |
| Full local verify | `./dev.sh test` |

## Rust backend

### Unit tests (`#[cfg(test)]` in crates)

- **`openatlas-core`** — graph ingest, domain tags, query filters.
- **`openatlas-ingest`** — feed parsers (fixtures), rate limits, circuit breaker, pipeline batching, STDB wire encoding, simulator catalog, metrics.
- **`openatlas-stdb-module`** — ingest validation rules, ring-size invariants, trend labels (host-side `cfg(test)`).
- **`openatlas-cli` / `openatlas-llm-bridge`** — SDK row decoding helpers.

### Integration tests (`crates/openatlas-ingest/tests/`)

| File | What it covers |
|------|----------------|
| `feed_pipeline.rs` | Observation → core graph → validation |
| `feed_config_api.rs` | `GET /feeds`, `POST /feeds/usgs/test` |
| `http_api_surface.rs` | `/health`, `/status`, poll-interval `PUT` |
| `stdb_integration.rs` | `/ready` vs live STDB (**ignored** by default) |

Shared harness: `tests/common/mod.rs` builds an Axum router with the same state as production.

### Optional SpacetimeDB integration

Requires a running instance (`./dev.sh spacetime:start` or `spacetime start`):

```bash
OPENATLAS_STDB_INTEGRATION=1 cargo test -p openatlas-ingest --test stdb_integration -- --ignored
```

### Logging in tests and dev

- **`RUST_LOG`** — filter tracing, e.g. `RUST_LOG=openatlas_ingest=debug,info`.
- **`OPENATLAS_LOG_JSON=1`** — newline-delimited JSON logs from ingest (`crates/openatlas-ingest/src/logging.rs`).

## Web client

### Unit tests (Bun)

Located next to sources as `*.test.ts`. Run:

```bash
cd web && bun test src/lib
```

Coverage highlights:

- **Demo** — deterministic `buildDemoSnapshot(seed)`.
- **Charts** — `hub-charts`, `chart-cache` memoization.
- **Geo index** — `buildGeoEventIndex` (pure, no Svelte runes).
- **STDB** — subscription SQL shape, endpoint normalization, aircraft mapping.
- **Map / viz** — solar geometry, globe zoom, showcase datasets.

### Structured client logging

`web/src/lib/telemetry/log.ts`:

```js
localStorage.setItem("openatlas-log-level", "debug"); // debug | info | warn | error
```

Dashboard flush emits `debug` lines when enabled. Connection/STDB paths can use the same helper.

### End-to-end (Playwright)

Demo mode (`?demo=1`) avoids SpacetimeDB in CI:

```bash
cd web
bun install
bun run build
bunx playwright install chromium
bun run test:e2e
```

Specs: `web/e2e/smoke.spec.ts` (shell, globe, entities, hub), `web/e2e/accessibility.spec.ts` (landmarks, Ctrl+K palette).

Interactive debugging: `bun run test:e2e:ui`.

## CI/CD

Path-filtered workflows, merge gates, and staging/production promotion are documented in [`docs/CICD.md`](CICD.md).

Summary:

- **PR / Dev** — conditional jobs + required **`Merge gate`**
- **main / QA** — `e2e-qa.sh` + Playwright after merge
- **Staging / Production** — artifact builds with GitHub Environment gates
- **Nightly** — full suite (non-blocking)

## Writing new tests

1. **Prefer pure functions** — extract logic from Svelte runes or reducers when tests need determinism.
2. **Use fixtures** — ingest feed tests read JSON under `crates/openatlas-ingest/tests/fixtures/` (or inline `include_str!` in modules).
3. **Do not hit live APIs in unit tests** — mark network tests `#[ignore]` with a clear message (see `feeds::tests::registry_feeds_fetch_without_error`).
4. **HTTP tests** — use `tests/common/mod.rs` + `tower::ServiceExt::oneshot`, no TCP bind required.
5. **E2E** — assert roles/labels users rely on; keep demo mode so CI stays hermetic.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `ready` integration fails | STDB up? `OPENATLAS_STDB_URI`, module published? |
| Playwright timeout | `bun run build` first; port 4173 free |
| Flaky feed test | Run without `--ignored` network tests; use `POST /feeds/{name}/test` manually |
| Empty dashboard in e2e | URL must include `?demo=1` |
