# Backend ingest architecture

OpenAtlas follows the same layering as production event pipelines (mobile
analytics, CDC, warehouse ingest): a **stateless edge** that validates and
normalizes, a **durable authoritative store** with idempotent writes, and
**read clients** that subscribe to bounded views.

## Industry patterns we adopt

| Pattern | Implementation |
|--------|----------------|
| Stateless ingest service | `openatlas-ingest` — no authoritative DB of its own |
| Idempotent sink | `event.id` primary key; duplicates return success |
| At-least-once edge | Feeds may retry; STDB dedupes by id |
| Batch writes | `ingest_events_batch` reducer (≤128 events / txn) |
| Audit / causality | `ingest_audit` append-only ring in STDB |
| Time + count retention | 24h prune + ring caps on events, signals, edges, audit |
| Rate limiting | Per-host + per-feed poll spacing (`rate_limit.rs`) |
| Circuit breaker | Open after 5 consecutive failures; manual reconnect |
| Fail closed | Invalid rows rejected before HTTP; module validates again |

## Write path

```
External API
    → feed worker (poll, circuit, rate limit)
    → validate + normalize (ingest)
    → pipeline::push_events (chunks of 64)
    → HTTP POST ingest_events_batch
    → STDB: try_ingest_one × N, audit rows, prune once
```

Single-event `ingest_event` remains for compatibility and fallback if a
batch call fails.

## SpacetimeDB tables (authoritative)

| Table | Role |
|-------|------|
| `event` | Canonical observations (24h + 50k cap) |
| `ingest_audit` | Per-attempt log: accepted / duplicate / rejected |
| `signal`, `causal_edge` | Derived, 24h + ring caps |
| `world_state`, `domain_insight` | Aggregates (small) |

Clients should **not** subscribe to `ingest_audit` on the dashboard —
use `GET /status` for operator metrics.

## Operator API

- `GET /status` — STDB reachability, row counts, `ingest_metrics`, feed health
- `GET /feeds` — per-feed poll config, circuit state, last cycle stats
- `PUT /feeds/poll-intervals` — cadence without restart

## Deploy note

After module changes:

```bash
spacetime publish --project-path crates/openatlas-stdb-module openatlas
```

Then restart ingest (`./dev.sh restart`).
