# OpenAtlas Principal Engineering Review

**Date:** 2026-05-19  
**Scope:** Backend, SpacetimeDB module, ingest, LLM bridge, CLI, web client, scripts, CI, correctness, performance, maintainability.

This report records findings from a full pass over the repository, what was fixed in this iteration, and what remains as intentional tradeoffs or follow-up work.

---

## Executive summary

OpenAtlas is architecturally sound: SpacetimeDB as single source of truth, registry-driven feeds, normalization pipeline, and a thin web client over generated bindings. The main risks are **operational** (unauthenticated ingest admin API, full-ring WebSocket sync) and **process** (CI was missing in-repo). Several correctness and UX bugs were fixed; larger performance and security hardening items are documented below.

| Area | Grade | Notes |
|------|-------|--------|
| Architecture & modularity | A- | Clear crate boundaries; some tag/constant duplication |
| Correctness / data pipeline | B+ | Improved feed success reporting; domain tags tested |
| Frontend / STDB client | B | Full-ring sync is the dominant perf risk |
| Security (dev) | C+ | Feed PUT allowlisted; still no auth on :8080 |
| Testing | B- | Rust solid; web tests expanded; no E2E browser CI |
| CI/CD | B | GitHub Actions workflow added |
| Docs / operability | A- | dev.sh strong; DEPLOY.md exists |

---

## Critical findings

### C1 — Full-table SpacetimeDB subscriptions (50k events)

**Issue:** Dashboard subscriptions use `SELECT * FROM event` (and full rings for signal/causal_edge) while the module retains up to 50k rows. The UI trims to ~520 events client-side, but the SDK still syncs entire rings over WebSocket.

**Impact:** High memory and bandwidth on first connect; slow hydrate on constrained clients.

**Status:** **Documented / deferred.** Mitigations require schema or product decisions (smaller browser-facing ring, server-side views, or incremental sync API). See `web/src/lib/stdb-subscriptions.ts`, `crates/openatlas-stdb-module/src/lib.rs`.

**Recommendation:** Add a `event_recent` table or subscription-friendly materialized view capped at N rows, or expose SQL snapshot endpoint for initial hydrate.

### C2 — No authentication on ingest HTTP API

**Issue:** Ingest binds `0.0.0.0:8080` with permissive CORS. `PUT /feeds` can write API keys to disk and process env.

**Impact:** Any host that can reach :8080 can reconfigure feeds or probe upstream APIs.

**Status:** **Partially mitigated** — `PUT /feeds` now accepts only `FRED_API_KEY` and `EIA_API_KEY` (allowlist). Documented in `routes/mod.rs`.

**Recommendation:** Default bind to `127.0.0.1:8080` in production; add optional bearer token for `/feeds` admin routes.

---

## High findings

### H1 — Ingest readiness used `/status` only

**Issue:** UI treated ingest as “up” when `/status` returned 200 even if `stdb_reachable: false` or `/ready` was 503.

**Status:** **Fixed** — `readiness.svelte.ts` now requires `GET /ready` and `stdb_reachable` from `/status`.

### H2 — Feed cycle marked success when all STDB pushes failed

**Issue:** `record_feed_success` ran after fetch even when every `ingest_event` failed.

**Status:** **Fixed** — Treat all-push-failure as feed failure with backoff.

### H3 — Arbitrary env injection via `PUT /feeds`

**Issue:** Client could set any env var name (e.g. `PATH`).

**Status:** **Fixed** — `validate_secret_keys()` allowlist in `feed_config.rs`.

### H4 — No in-repo CI

**Issue:** Docs referenced CI gates; no `.github/workflows`.

**Status:** **Fixed** — `.github/workflows/ci.yml` (Rust, web, spacetime module build).

### H5 — `make test` / `dev.sh test` skipped frontend

**Issue:** Quality gates were Rust-only.

**Status:** **Fixed** — `do_check` runs `do_web_check` (svelte-check + `bun test src/lib`).

### H6 — Production LLM path

**Issue:** Vite proxies `/api/llm` only in dev; production static build on ingest has no LLM unless `VITE_LLM_BASE` is set at build time.

**Status:** **Documented** — Set `VITE_LLM_BASE` in `web/.env` for production builds. See `docs/DEPLOY.md`, `web/vite.config.ts`.

### H7 — Domain tag mapping duplicated

**Issue:** `domain_to_u8` in ingest, validator in stdb module (`domain > 12`), web `domain.ts`, CLI — no single generated source.

**Status:** **Partially mitigated** — Added `domain_count_matches_stdb_tag_cap` test in `openatlas-core`; existing round-trip tests in `stdb.rs`.

**Recommendation:** Single `domains.json` or build script generating Rust/TS constants.

---

## Medium findings

### M1 — Demo mode showed `connection: live`

**Status:** **Fixed** — `installDemoData()` sets `connection: offline`; ConnectionPill already uses `dataMode === demo` for display.

### M2 — HMR left stale STDB WebSocket

**Status:** **Fixed** — `import.meta.hot.dispose` calls `disconnectDb()` in `main.ts`.

### M3 — Clippy `private_interfaces` on `descriptor_for`

**Status:** **Fixed** — `descriptor_for` is `pub(crate)` again.

### M4 — LLM `/v1/ready` vs `/v1/capable`

**Issue:** Status bar uses fast ping; CUDA/GPU failures only appear on inference.

**Status:** **Accepted** — Settings “Test LLM pipeline” and Hub run full inference; `dev.sh llm:start` checks `/v1/capable`.

### M5 — Feed adapters without fixture tests

**Issue:** GDELT, OpenSky, open-meteo lack dedicated fixture unit tests (USGS, FRED, EIA, World Bank have them).

**Status:** **Deferred** — Live fetch test in `registry_feeds_fetch_without_error` covers network path.

### M6 — Entities table not virtualized

**Status:** **Deferred** — Cap at 520 events limits worst case; paginate if buffer grows.

### M7 — `unsafe env::set_var` for feed secrets

**Status:** **Accepted** — Single-process ingest; documented. Alternative: pass secrets through `AppState` into fetch closures (larger refactor).

---

## Low findings

| Item | Status |
|------|--------|
| Unused `.mono-block` CSS in Settings | Cosmetic |
| `reducerClient` not wired in UI | Future feature |
| Hash-only router (no History API) | Intentional |
| GDELT intermittent failures | Upstream; reconnect in Settings |

---

## What was fixed in this review (changelog)

1. `PUT /feeds` secret key allowlist + unit test  
2. Feed supervisor: failure when fetch succeeds but STDB push fails entirely  
3. Ingest readiness: `/ready` + `stdb_reachable`  
4. Demo mode connection state  
5. Vite HMR disconnect for SpacetimeDB  
6. `dev.sh check` includes web typecheck and tests  
7. `bun test src/lib` runs all web unit tests  
8. GitHub Actions CI workflow  
9. Domain count vs STDB cap test  
10. Clippy private interface fix  

---

## Verification commands

```bash
./dev.sh check          # Rust fmt, clippy, test + web check + test
./scripts/verify-runtime.sh
./scripts/prove-live-stack.sh   # stack must be up
cargo test -p openatlas-ingest --test feed_config_api
```

---

## Recommended next iterations (priority order)

1. **Browser subscription scope** — cap rows at module or add `event_recent` table.  
2. **Ingest admin auth** — optional token for `/feeds` + bind `127.0.0.1` by default.  
3. **Domain tag codegen** — one source for Rust module, ingest, web, CLI.  
4. **Playwright smoke** — demo mode + live mode connect, Settings feed test mock.  
5. **Entities virtualization** — if event buffer increases.  

---

## Architecture strengths (keep)

- Registry-driven feeds with `ObservationDraft` normalization  
- Deterministic event IDs and module-side duplicate rejection  
- Bounded STDB rings with explicit constants  
- `dev.sh` / `verify-runtime.sh` / `prove-live-stack.sh` operator tooling  
- Settings feed panel for keys, test, reconnect without shell env editing  
