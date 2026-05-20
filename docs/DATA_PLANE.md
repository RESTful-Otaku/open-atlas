# Data plane (API → SpacetimeDB → browser)

OpenAtlas is designed so **external APIs are called rarely** and **SpacetimeDB
+ the browser cache are hit often** for dashboards, scrubbing, and maps.

## Tiers

| Tier | Who | What | Cadence |
|------|-----|------|---------|
| **1 — External APIs** | `openatlas-ingest` feed workers only | HTTP fetch, normalize, validate | Operator poll (30s–4h via Settings); rate-limited |
| **2 — SpacetimeDB module** | Reducers on write | Aggregates (`world_state`), insights, signals, causal edges, ring prune | Every successful `ingest_event` |
| **3 — Ingest HTTP** | Operators / Settings | `/status`, `/feeds`, test/reconnect | On demand |
| **4 — Browser SDK** | Svelte dashboard | WebSocket subscriptions + local row cache | Continuous while connected |
| **5 — UI projection** | `state.svelte.ts` | Trim/sort caps (`MAX_EVENTS`, …) | Per row event |

The UI **never** calls FRED, EIA, USGS, OpenSky, etc. in live mode. Vite proxies
only **ingest health** and **LLM** — not open-data providers.

## Live path (default)

```
open-data API ──poll──► ingest feed ──HTTP reducer──► SpacetimeDB
                                                          │
                     WebSocket subscriptions ◄────────────┘
                              │
                     SDK table cache (bounded)
                              │
                     dashboard.* (trimmed UI DTOs)
                              │
                     charts / map / desks
```

Heavy work stays in **tier 2** (module reducers): domain aggregates, anomaly
signals, narrative text, ring pruning. The browser does light projection and
charting on at most ~500 events.

## Map / tracking exception

| Layer | Source |
|-------|--------|
| Event points, heatmaps, desks | SpacetimeDB `event` subscription |
| ADS-B aircraft glyphs (live) | SpacetimeDB `opensky` transport events |
| NORAD satellite TLE paths | Static files in `web/public/tracking/` (no API) |
| Sample maritime | Static `maritime-samples.json` |

## Memory bounds

| Location | Cap |
|----------|-----|
| STDB `event` retention | 24h + ring **800** max (was 50k) |
| STDB `signal` / `causal_edge` | 24h + rings **400** / **600** |
| `ingest_audit` | Private table (not synced to browser) |
| Default WS subscription | Core tables only (no `event_narrative`) |
| Narratives | Lazy subscribe when Hub / event detail / map mounts |
| `dashboard.events` | **24h UTC retention** + count cap **800** (`MAX_EVENTS`), hard ceiling **2000** (`MAX_EVENTS_HARD_CEILING`) |
| Event `payload_json` | Compact keys, **8 KiB** max |

## Browser subscription vs UI trim

SpacetimeDB subscriptions use full-table `SELECT *` on ring tables (see `stdb-subscriptions.ts`). The module retains up to **~800** `event` rows (plus 24h retention pruning), so the TypeScript SDK syncs that full ring on connect and on each prune — not the smaller UI projection.

The browser then trims again in `sync-dashboard-cache.ts` via **`trimEventsByRetention`** (`event-retention-trim.ts`): keep events with `timestamp >= now − 24h`, newest ordinal first, capped at **`MAX_EVENTS = 800`** with a **`MAX_EVENTS_HARD_CEILING = 2000`** safety bound. Signals and causal edges use count caps aligned to STDB rings (**400** / **600**). Memory and bandwidth on first connect still scale with the **server ring (~800)** until `event_recent` (below) ships.

**Planned mitigation (P0, not yet implemented):** add a browser-facing `event_recent` table (or capped view when STDB supports it) with N≈300 rows, subscribed instead of full `event`. Until then, treat R1 in [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md) as an accepted connect-cost tradeoff. Track implementation in [roadmap/PHASE_A_TRUST.md](./roadmap/PHASE_A_TRUST.md).

## Operator actions

- **Poll interval** — Settings → Feeds; persisted in `.dev/feed-poll.json` (`PUT /feeds/poll-intervals`). Options: 30s, 1m, 5m, 30m, 1h, 4h (provider minimums enforced).
- **Live feed status** — Shell **Feeds** pill + Settings table refresh every ~8–10s (`GET /feeds`): last poll, next poll, accepted/duplicate counts.
- **Reconnect (STDB)** — Settings pill + Ops strip; exponential auto-reconnect (max 8 attempts, 2s base) when the socket drops; manual **Reconnect** resets backoff.
- **Test / Reconnect feed** — hits upstream once; 30s cooldown per feed. Failed cycles wait the configured interval only (no exponential retry storm).
- **Scrubbing / time slider** — reads cached `dashboard` + TLE propagation only.

See also [RATE_LIMITS.md](./RATE_LIMITS.md), [CONFIG.md](./CONFIG.md).
