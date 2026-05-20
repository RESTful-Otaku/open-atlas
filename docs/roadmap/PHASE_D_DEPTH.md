# Phase D — Depth & differentiation (P2/P3)

**Goal:** Causal exploration, server-anchored history, scale proof, broader coverage.

**Exit criteria:**

- Causal chain navigable ≥3 hops from any event (within ring bounds).
- Published benchmark command for ingest/reducer throughput.
- Product sign-off on P2/P3 backlog order.

---

## Checklist

### Causal & narrative

| Status | Item | Notes | Code / deps |
|--------|------|-------|-------------|
| [~] | **Causal exploration mode** | Upstream/downstream lists + event links in detail + map hover | [`causal-neighbors.ts`](../../web/src/lib/map/causal-neighbors.ts), [`EventDetailView.svelte`](../../web/src/lib/views/EventDetailView.svelte), [`EventMapHoverCard.svelte`](../../web/src/lib/components/EventMapHoverCard.svelte) |
| [ ] | **“Linked because” metadata** | Surface auto-link reason in UI | Module reducer metadata |
| [ ] | **Signal → event drill** | One-click from signal card | Matrix + [`EventDetailView.svelte`](../../web/src/lib/views/EventDetailView.svelte) |
| [~] | **LLM augments hub + domain desks** | Hub/domain regenerate, template fallback, NL filter stub | [`openatlas-llm-bridge`](../../crates/openatlas-llm-bridge/), [`FEATURE_IDEAS.md`](./FEATURE_IDEAS.md) |

### History & replay (server)

| Status | Item | Notes | Code / deps |
|--------|------|-------|-------------|
| [ ] | **Cold archive export** | Rings → object store | New pipeline — depends Phase A replay proof |
| [ ] | **Server time replay API** | Reducer at historical `timestamp` | STDB product capabilities — large |
| [ ] | **Client sim-time → server anchor** | Replace client-only scrub | [`map-sim-time.ts`](../../web/src/lib/map/map-sim-time.ts) |

### Scale & platform

| Status | Item | Notes | Code / deps |
|--------|------|-------|-------------|
| [ ] | **10k+ evt/s benchmark** | Reproducible harness in docs | Ingest + module — spec target |
| [ ] | **CLI SDK subscriptions** | Replace SQL polling | `spacetimedb-sdk` in CLI |
| [ ] | **Multi-region STDB** | HA | Product — not designed today |

### Coverage & clients

| Status | Item | Notes | Code / deps |
|--------|------|-------|-------------|
| [ ] | **Feeds: OSM, OWID, EONET polygons** | Registry pattern | [`feeds/mod.rs`](../../crates/openatlas-ingest/src/feeds/mod.rs) |
| [ ] | **GDELT / OpenSky / Open-Meteo fixtures** | Parser unit tests | [`tests/fixtures`](../../crates/openatlas-ingest/tests/fixtures/) |
| [ ] | **Mobile read-only hub/map** | Responsive IA | Web views |
| [ ] | **Collaborative layouts** | Server prefs | Auth — not in v1 architecture |

### Codegen & maintenance

| Status | Item | Notes | Code / deps |
|--------|------|-------|-------------|
| [ ] | **`domains.toml` codegen** | Rust / TS / CSS single source | Replaces 4 hand-maintained maps |
| [ ] | **Archive `openatlas-ui-wasm`** | Reduce confusion | [`crates/openatlas-ui-wasm`](../../crates/openatlas-ui-wasm/) |

---

## Dependencies

- **Phase A** full replay + `event_recent` before server historical replay.
- **Phase B** map/globe GA before mobile read-only (shared components).
- **Phase C** deploy automation before benchmark publication in production-like env.
