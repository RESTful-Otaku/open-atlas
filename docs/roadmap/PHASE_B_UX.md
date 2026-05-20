# Phase B — Instrument room UX (P1)

**Goal:** Cohesive operator experience on map, globe, and domain desks.

**Exit criteria:**

- Operator can scrub 24h, toggle layers, read narrative, and open an event without leaving the map.
- Playwright covers map scrub + layer toggle in demo mode.
- Design review: “instrument room” passes (density, tokens, domain color discipline).

---

## Checklist

### Map & globe

| Status | Item | Notes | Code / deps |
|--------|------|-------|-------------|
| [x] | **Solar scrub + sim-time GA** | UTC scrub, phase icon, `map-sim-time` filter; 2D `flushSolarLayers` + 3D `updateGlobeSolarDecor` on scrub | [`SolarTimeScrub.svelte`](../../web/src/lib/components/SolarTimeScrub.svelte), [`map-sim-time.ts`](../../web/src/lib/map/map-sim-time.ts) |
| [x] | **Solar terminator + city lights** | Shader shell tracks scrub every frame; 2D night fill without duplicate terminator | [`globe-solar-overlay.ts`](../../web/src/lib/map/globe-solar-overlay.ts), [`ThreeGlobe.svelte`](../../web/src/lib/components/ThreeGlobe.svelte) |
| [x] | **Weather / admin boundary layers** | Layer toggles + persist | [`globe-weather-layers.ts`](../../web/src/lib/map/globe-weather-layers.ts), [`globe-admin-boundaries.ts`](../../web/src/lib/map/globe-admin-boundaries.ts), [`map-domains-persist.ts`](../../web/src/lib/map/map-domains-persist.ts) |
| [x] | **Ops strip** | `OpsStrip.svelte` on full-page map/globe header — STDB, feeds, sim UTC + phase | [`OpsStrip.svelte`](../../web/src/lib/components/OpsStrip.svelte), [`ops-strip.ts`](../../web/src/lib/components/ops-strip.ts) |
| [x] | **Hover → inspector dock** | Pin/unpin, docked bottom-left, Escape closes pin before layers panel | [`EventMapHoverCard.svelte`](../../web/src/lib/components/EventMapHoverCard.svelte) |
| [x] | **Map layers design system** | Extracted `MapLayersPanel.svelte`; Escape closes panel | [`MapLayersPanel.svelte`](../../web/src/lib/components/MapLayersPanel.svelte), [`WorldMap.svelte`](../../web/src/lib/components/WorldMap.svelte) |

### Domain desks & matrix

| Status | Item | Notes | Code / deps |
|--------|------|-------|-------------|
| [x] | **Domain desk layout GA** | Drag reorder, 1–3 col spans, localStorage | [`domain-chart-layout.ts`](../../web/src/lib/views/domain/domain-chart-layout.ts), [`DomainChartsBlock.svelte`](../../web/src/lib/views/domain/DomainChartsBlock.svelte) |
| [x] | **Layout presets** | Analyst / Executive built-ins + named presets in localStorage | [`domain-chart-presets.ts`](../../web/src/lib/views/domain/domain-chart-presets.ts) |
| [x] | **Matrix → domain deep links** | Header link to `#/domain/:id` from `accentDomain` | [`MatrixView.svelte`](../../web/src/lib/matrices/MatrixView.svelte) |
| [x] | **Nav grouping** | Collapsible “Domains” section when rail expanded (default collapsed) | [`LeftRail.svelte`](../../web/src/lib/shell/LeftRail.svelte), [`rail.svelte.ts`](../../web/src/lib/shell/rail.svelte.ts) |

### Operator affordances

| Status | Item | Notes | Code / deps |
|--------|------|-------|-------------|
| [~] | **Feed health single pane** | Summary in `OpsStrip` + existing Settings / `SystemStatusBar` — not a dedicated single pane yet | [`feed-live.svelte.ts`](../../web/src/lib/feed-live.svelte.ts), [`/feeds`](../../crates/openatlas-ingest/src/routes/feeds.rs) |
| [x] | **Live sparse empty states** | Map/globe overlay when zero geo events in sim window + Layers/Settings links | [`WorldMap.svelte`](../../web/src/lib/components/WorldMap.svelte) |
| [ ] | **Guided onboarding (3 steps)** | Tied to `VIEW_CATALOG` | New overlay component |

---

## Dependencies

- **Phase A `event_recent`** (optional) improves connect before heavy map work — not blocking scrub/layers. *Deferred to Phase A.*
- **Inspector dock** benefits from stable hover card API — after `EventMapHoverCard` polish. *Done.*
- **Playwright map tests** depend on demo seed stability — [`demo-seed.ts`](../../web/src/lib/demo-seed.ts). *Phase C / follow-up.*

**Blocks Phase C smoke:** none; can parallelize with Phase A remainder.
