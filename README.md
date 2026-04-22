<div align="center">
  <img src="web/public/logo.png" alt="OpenAtlas logo" width="720" />
</div>

# OpenAtlas

OpenAtlas is a real-time global data intelligence system built as a
**unified reactive world-state engine** on [SpacetimeDB]. It ingests
open-data feeds (seismic, climate, finance, aviation, conflict, energy,
…), folds them into a deterministic causal graph inside a SpacetimeDB
module, and streams live projections to a Svelte dashboard and a terminal
CLI.

SpacetimeDB is the single source of truth. Every producer writes through
a reducer; every consumer subscribes to rows. There is no separate
database, cache, message bus, or REST read surface.

[SpacetimeDB]: https://spacetimedb.com

## Architecture at a Glance

```
┌──────────────────┐   reducer calls (HTTP)      ┌──────────────────────┐
│ openatlas-ingest ├────────────────────────────►│ SpacetimeDB module   │
│ (feeds + sim)    │                             │ openatlas-stdb-module│
└──────────────────┘                             │                      │
                                                 │  tables + reducers   │
┌──────────────────┐   stdb SQL (HTTP)           │  (authoritative)     │
│ openatlas-cli    ├────────────────────────────►│                      │
│ (terminal)       │                             │                      │
└──────────────────┘                             │                      │
                                                 │                      │
┌──────────────────┐   stdb SDK (WebSocket)      │                      │
│ Svelte dashboard ├────────────────────────────►│                      │
│ (web/)           │   live row subscriptions    └──────────────────────┘
└──────────────────┘
```

- **`openatlas-stdb-module`** — SpacetimeDB module that owns the schema
  (`event`, `signal`, `causal_edge`, `world_state`, `domain_insight`, …)
  and every state transition (`ingest_event`, `link_causal_events`).
- **`openatlas-ingest`** — stateless pusher. Supervises feed adapters
  and the simulator, normalises them into `WorldEvent`s, and calls
  reducers over HTTP. Also exposes `/health`, `/ready`, `/status` for
  operational visibility.
- **`openatlas-cli`** — small Clap-based tool that queries SpacetimeDB
  directly via its HTTP SQL endpoint.
- **`web/`** — Svelte 5 + Vite dashboard using the SpacetimeDB
  TypeScript SDK over WebSocket. Renders a global MapLibre map, ECharts
  panels (causal force graph, severity heatmap), and live event lists.
- **`openatlas-core`** — pure Rust DTOs (`Domain`, `WorldEvent`,
  `Signal`, …) shared between the ingest service and the module at the
  wire boundary.

## Quick Start with `dev.sh`

`dev.sh` orchestrates the whole stack. It uses
[charmbracelet/gum](https://github.com/charmbracelet/gum) for a polished
interactive menu when installed and falls back to plain shell otherwise.

```bash
./dev.sh                   # short interactive menu
./dev.sh all               # full stack with live open-data; opens browser
./dev.sh all:sim|up        # same with simulated feeds only (safe default)
./dev.sh up:live           # alias for "all" (live feeds)
./dev.sh down              # stop ingest, LLM bridge, SpacetimeDB
./dev.sh web|web:demo      # Vite on :5173 (normal); demo = no SpacetimeDB
./dev.sh check             # test + lint
./dev.sh spacetime:*       # start|stop|publish|build|logs  (unchanged)
./dev.sh start|start:sim   # ingest only, live or sim
./dev.sh stop|stop:all|clean
./dev.sh e2e|e2e:quick|cli|tail|status|test|lint|dashboard
# ./dev.sh help  —  full non-interactive command list
```

Ingest PID and logs live under `.dev/server.{pid,log}`; SpacetimeDB
state lives under `.dev/spacetime-data/` with logs in
`.dev/spacetime.log`.

### Prerequisites

- Rust toolchain (stable) with `cargo`.
- [SpacetimeDB CLI](https://spacetimedb.com/install) 2.1+.
- [Bun](https://bun.sh) for the Svelte frontend (`bun`, not `npm`).
- `curl`, plus `jq` for prettier status output.
- `gum` (optional) for the nicest interactive menu.

## Manual Quick Start

```bash
# 1. Start SpacetimeDB and publish the module.
spacetime start --listen-addr 127.0.0.1:3000 &
spacetime publish --server http://127.0.0.1:3000 \
  --module-path crates/openatlas-stdb-module --yes openatlas

# 2. Run the ingest service (simulators on, live feeds off by default).
cargo run -p openatlas-ingest

# 3. Run the Svelte dev server.
cd web && bun install && bun run dev
# → http://localhost:5173
```

`./dev.sh all` and `./dev.sh start` already set `OPENATLAS_ENABLE_LIVE_FEEDS=1`
and start **`openatlas-llm-bridge`** (unless `OPENATLAS_START_LLM=0`). The bridge
listens on `127.0.0.1:3847` and forwards to Ollama; the Vite dev server proxies
`/api/llm` there (see `web/vite.config.ts`).

**Ollama (required for hub “AI analysis”):** install Ollama, then run
`ollama serve`, pull a model, e.g. `ollama pull llama3.2`, and keep it running.
If the bridge starts before Ollama, you still get ingest and the UI, but
`GET :3847/v1/ready` fails until Ollama is up.

For the Svelte app with the proxy, use **`./dev.sh web`** (same as
`dev:frontend`, or `cd web && bun run dev`) on port **5173** while the stack
from `./dev.sh` is running. The non-interactive **`./dev.sh all`** does not
start Vite; it only opens the browser URL, which needs a dev server (or use
ingest’s static host on :8080 if you built `web/dist`).

For ad-hoc bridge only: `cargo run -p openatlas-llm-bridge` (same env vars as
`crates/openatlas-llm-bridge` / `./dev.sh llm:start`).

Set `OPENATLAS_ENABLE_LIVE_FEEDS=1` manually if you are not using `./dev.sh`
and want the supervised live-feed adapters listed below.

## Live Open-Data Feeds

Every feed is a self-contained plug-in. Supervision, backoff, dormancy,
and `/status` seeding are all driven by `feeds::REGISTRY`.

| Feed              | Domain         | Auth required    | Default poll |
| ----------------- | -------------- | ---------------- | ------------ |
| USGS Earthquake   | `seismic`      | none             | 45 s         |
| Open-Meteo        | `climate`      | none             | 60 s         |
| CoinGecko         | `finance`      | none             | 60 s         |
| NASA EONET        | `seismic` / `climate` / `geospatial` / `geopolitics` | none | 180 s |
| OpenSky Network   | `transport`    | none             | 90 s         |
| GDELT 2.0         | `geopolitics`  | none             | 180 s        |
| World Bank        | `economy`      | none             | 3600 s       |
| FRED (St. Louis)  | `finance`      | `FRED_API_KEY`   | 600 s        |
| EIA               | `energy`       | `EIA_API_KEY`    | 900 s        |

Feeds that require a secret stay dormant until the corresponding env
var is set. All feeds are gated behind `OPENATLAS_ENABLE_LIVE_FEEDS=1`.

## CLI

The CLI talks to SpacetimeDB over its HTTP SQL endpoint. Point it at
the live database (defaults shown):

```bash
export OPENATLAS_STDB_URI=http://127.0.0.1:3000
export OPENATLAS_STDB_DB=openatlas

cargo run -p openatlas-cli -- view events --limit 15
cargo run -p openatlas-cli -- view events --watch --domain seismic
cargo run -p openatlas-cli -- state --domain energy
cargo run -p openatlas-cli -- anomalies --domain finance --limit 30
cargo run -p openatlas-cli -- trace <event_id>   # event_id is a u64
```

> SpacetimeDB 2.1 SQL does not yet support `ORDER BY` or aggregates.
> The CLI therefore pulls the bounded table once (events / signals are
> capped by the module's ring buffer) and sorts newest-first locally.

## SpacetimeDB Schema (authoritative)

All tables live in [`crates/openatlas-stdb-module/src/lib.rs`](crates/openatlas-stdb-module/src/lib.rs):

| Table            | Purpose                                             |
| ---------------- | --------------------------------------------------- |
| `event`          | Immutable `WorldEvent` facts. Capped at 50 000 rows. |
| `signal`         | Anomaly signals emitted by inference. Ring of 10 000. |
| `causal_edge`    | Directed influence between two events. Ring of 10 000. |
| `world_state`    | Per-domain aggregate (event count, avg severity, risk). |
| `domain_insight` | Narrative summary per domain, with source URL.      |
| `ordinal_counter`| Monotonic sequencer for `event.ordinal` (private).  |

Writes go through reducers only:

- `ingest_event(id, timestamp, domain, severity, location, payload, source_label, source_url)`
- `link_causal_events(source_id, target_id, influence_score, decay_rate)`
- `init()` (seeds `ordinal_counter`)

All reducers are deterministic: they take an explicit `timestamp`, clamp
severity to `[0.0, 1.0]`, and prune their ring tables in the same
transaction.

## Configuration

| Env var                      | Default                 | Purpose                                     |
| ---------------------------- | ----------------------- | ------------------------------------------- |
| `OPENATLAS_STDB_URI`         | `http://127.0.0.1:3000` | SpacetimeDB HTTP endpoint (ingest + CLI)    |
| `OPENATLAS_STDB_DB`          | `openatlas`             | Database/module name                        |
| `OPENATLAS_ENABLE_LIVE_FEEDS`| unset                   | `1` enables live-feed adapters              |
| `OPENATLAS_API_KEY`          | unset                   | Reject `/status`-adjacent admin writes unless `x-openatlas-key` matches |
| `FRED_API_KEY`, `EIA_API_KEY`| unset                   | Enable the respective feeds                 |
| `VITE_STDB_URI`, `VITE_STDB_DB` | same as above        | Used by the Svelte dashboard at build time  |
| `VITE_LLM_BASE`            | unset (`/api/llm` in Vite) | Public URL of the LLM bridge for production |
| `OPENATLAS_OLLAMA_BASE`    | `http://127.0.0.1:11434` | Ollama HTTP API (bridge → model)         |
| `OPENATLAS_OLLAMA_MODEL`   | `llama3.2`             | Model name after `ollama pull`              |
| `OPENATLAS_LLM_LISTEN`     | `127.0.0.1:3847`      | LLM bridge bind (match Vite proxy)         |
| `OPENATLAS_START_LLM`      | `1`                    | `0` skips auto-starting the bridge in `./dev.sh` |

## Example Event (wire shape)

```json
{
  "domain": "energy",
  "severity_score": 0.72,
  "location": { "lat": 40.7, "lon": -74.0, "region_tags": ["north-america"] },
  "payload": { "grid_load_pct": 93.2, "source": "mock-feed" }
}
```

## Roadmap

- Replay harness that feeds a recorded reducer log into a fresh
  SpacetimeDB instance and asserts byte-identical state.
- Benchmark harness targeting 10 000+ events/sec through the reducer.
- Native reducer subscriptions in the CLI (SDK) to replace polling.
- Additional feeds: OSM Overpass, Our World in Data, NASA EONET
  polygons.
