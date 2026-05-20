# Phase C — Ship path & observability (P1)

**Goal:** Repeatable deploy, measurable runtime, merge-ready CI.

**Exit criteria:**

- One-click staging promote with automated health + WebSocket smoke.
- Dashboard initial JS budget agreed and measured (baseline TBD).
- Grafana (or equivalent) dashboard for ingest reachability + STDB health.

---

## Checklist

### CI/CD & deploy

| Status | Item | Notes | Code / deps |
|--------|------|-------|-------------|
| [x] | **GitHub Actions CI** | Rust, web, module build | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) |
| [x] | **CD: STDB publish + ingest rollout** | Post-deploy `curl` + WS subscribe | [`DEPLOY.md`](../DEPLOY.md), [`GITHUB_SECRETS.md`](../GITHUB_SECRETS.md), [`post-deploy-smoke.sh`](../../scripts/post-deploy-smoke.sh) |
| [x] | **Staging smoke in workflow** | Optional job when `STAGING_INGEST_URL` set | [`deploy-staging.yml`](../../.github/workflows/deploy-staging.yml), [`scripts/`](../../scripts/) |
| [x] | **Nightly e2e-qa** | Continue-on-error optional job | [`scripts/e2e-qa.sh`](../../scripts/e2e-qa.sh) |

### Observability

| Status | Item | Notes | Code / deps |
|--------|------|-------|-------------|
| [ ] | **STDB SLO dashboard** | Reachability, ingest lag | Ops — scrape ingest `/metrics` + STDB host metrics |
| [x] | **OTel / Prometheus export** | `GET /metrics` Prometheus text from `IngestMetrics` | [`metrics.rs`](../../crates/openatlas-ingest/src/metrics.rs), [`routes/health.rs`](../../crates/openatlas-ingest/src/routes/health.rs) |
| [x] | **Browser ops console (Settings)** | Collapsible terminal: live log, feeds, metrics, STDB tier | [`ObservabilityTerminal.svelte`](../../web/src/lib/components/ObservabilityTerminal.svelte), [`observability/`](../../web/src/lib/observability/) |
| [x] | **Structured client errors** | Remediation hints in Settings / OpsStrip | [`connection-errors.ts`](../../web/src/lib/connection-errors.ts) |
| [x] | **Browser ops console (Settings)** | Live diagnostics: `/status`, `/feeds`, `/metrics`, STDB log | [`OpsConsole.svelte`](../../web/src/lib/components/OpsConsole.svelte), [`ops-console.ts`](../../web/src/lib/ops/ops-console.ts) |

### Frontend performance

| Status | Item | Notes | Code / deps |
|--------|------|-------|-------------|
| [x] | **Route code splitting** | Lazy routes + dynamic `ThreeGlobe` import | [`view-loaders.ts`](../../web/src/lib/view-loaders.ts), [`WorldMap.svelte`](../../web/src/lib/components/WorldMap.svelte), `globe` vendor chunk in [`vite.config.ts`](../../web/vite.config.ts) |
| [ ] | **Lazy `causal_edge` subscribe** | Only on map/matrix routes | [`stdb-subscriptions.ts`](../../web/src/lib/stdb-subscriptions.ts) — deferred (core dashboard still needs edges) |
| [ ] | **Bundle budget gate** | CI fails over threshold | Requires baseline measurement in `qa.yml` |

### Quality gates

| Status | Item | Notes | Code / deps |
|--------|------|-------|-------------|
| [x] | **`dev.sh check` includes web** | svelte-check + `bun test src/lib` | [`dev.sh`](../../dev.sh) |
| [x] | **Playwright live connect smoke** | Demo map layers + solar scrub | [`web/e2e/map-demo.spec.ts`](../../web/e2e/map-demo.spec.ts) |
| [x] | **A11y: charts + layers panel** | Layers Escape + OpsStrip `aria-label` | [`web/e2e/map-demo.spec.ts`](../../web/e2e/map-demo.spec.ts) |

---

## Dependencies

- **Phase A ingest auth** before exposing ingest on `0.0.0.0` in staging/prod.
- **Phase A full replay** (optional) before aggressive reducer publishes in CD.
- **Prometheus** can start with ingest-only metrics; STDB exporter depends on hosting.

## Design notes (deferred)

- **Bundle budget:** run `cd web && bun run build` and record largest chunks; add `qa-compile-gates` size check once baseline is agreed.
- **STDB metrics:** no first-party Prometheus exporter in-module; use host/cloud observability for WS latency and DB health until a dedicated scrape target exists.
