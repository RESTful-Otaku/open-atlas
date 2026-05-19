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
| `dashboard.events` | **400** after trim (top by ordinal on hydrate) |
| Event `payload_json` | Compact keys, **8 KiB** max |

## Operator actions

- **Poll interval** — Settings → Feeds; persisted in `.dev/feed-poll.json` (`PUT /feeds/poll-intervals`). Options: 30s, 1m, 5m, 30m, 1h, 4h (provider minimums enforced).
- **Live feed status** — Shell **Feeds** pill + Settings table refresh every ~8–10s (`GET /feeds`): last poll, next poll, accepted/duplicate counts.
- **Reconnect (STDB)** — Settings; manual only (no auto-reconnect loop).
- **Test / Reconnect feed** — hits upstream once; 30s cooldown per feed. Failed cycles wait the configured interval only (no exponential retry storm).
- **Scrubbing / time slider** — reads cached `dashboard` + TLE propagation only.

See also [RATE_LIMITS.md](./RATE_LIMITS.md), [CONFIG.md](./CONFIG.md).
