# Deploying OpenAtlas

This guide covers a **local production-like** stack and **SpacetimeDB Cloud**.
The browser always reads from SpacetimeDB; ingest is the only writer.

## Architecture (deploy view)

```
open-data APIs ──► openatlas-ingest ──HTTP reducers──► SpacetimeDB
                                                              ▲
Svelte (web/dist) ◄──────── WebSocket subscriptions ───────────┘
```

## 1. Local / single host

Use the dev harness (recommended):

```bash
./dev.sh build
./dev.sh spacetime:start
./dev.sh spacetime:publish
./dev.sh start:sim          # or start:live / start:static
./dev.sh web                # Vite :5173 → STDB on same host :3000
```

Production-like static hosting (ingest serves `web/dist` on :8080):

```bash
./dev.sh build
./dev.sh up                 # sim + open browser hint
# open http://127.0.0.1:8080 after build
```

### Ingest modes

| `OPENATLAS_INGEST_MODE` | `./dev.sh`        | Use case                          |
| ----------------------- | ----------------- | --------------------------------- |
| `live` (recommended)    | `up`, `start`     | Real open-data adapters only      |
| `hybrid`                | `up:hybrid`       | Live APIs + simulators            |
| `sim`                   | `up:sim`          | Simulators only                   |
| `static`                | `start:static`    | One-shot fixture burst (CI / QA)  |

## 2. SpacetimeDB Cloud

1. Install the [SpacetimeDB CLI](https://spacetimedb.com/install) and log in.
2. Publish the module (replace host/name with your cloud database):

```bash
spacetime build --module-path crates/openatlas-stdb-module
spacetime publish --server "https://maincloud.spacetimedb.com" \
  --module-path crates/openatlas-stdb-module \
  --yes openatlas
```

3. Note the database name and HTTP/WebSocket base URL from the SpacetimeDB dashboard.

### Ingest against cloud

Run `openatlas-ingest` anywhere that can reach the cloud HTTP API:

```bash
export OPENATLAS_STDB_URI="https://maincloud.spacetimedb.com"
export OPENATLAS_STDB_DB="openatlas"
export OPENATLAS_INGEST_MODE="live"   # or sim / static
# optional: FRED_API_KEY, EIA_API_KEY (use a secret store in production — see CONFIG.md)
cargo run --release -p openatlas-ingest
```

Verify: `curl -s http://localhost:8080/status | jq .ingest_mode,.stdb_reachable`

### Frontend against cloud

Build the Svelte app with cloud WebSocket URL (must be `wss://` on HTTPS sites):

```bash
cd web
export VITE_STDB_URI="wss://maincloud.spacetimedb.com"
export VITE_STDB_DB="openatlas"
bun install && bun run build
```

Serve `web/dist` behind your CDN or reverse proxy, **or** let ingest serve it:

```bash
# ingest already falls back to web/dist when present
OPENATLAS_STDB_URI=... OPENATLAS_INGEST_MODE=live cargo run -p openatlas-ingest
```

Do **not** set `VITE_DEMO_DATA=1` in production builds.

## 3. Verification

```bash
./scripts/e2e-qa.sh              # compile + sim smoke
./scripts/e2e-qa.sh --verify-feeds   # live adapters (network, jq)
RUN_LIVE_FEED_TEST=1 ./scripts/e2e-qa.sh   # also runs ignored Rust fetch tests
```

Or from the repo root:

```bash
./dev.sh e2e
./dev.sh e2e:feeds    # if wired in dev.sh
```

## 4. Environment reference

| Variable                 | Consumers   | Purpose                                |
| ------------------------ | ----------- | -------------------------------------- |
| `OPENATLAS_STDB_URI`     | ingest, CLI | SpacetimeDB HTTP base                  |
| `OPENATLAS_STDB_DB`      | ingest, CLI | Database / module name                 |
| `OPENATLAS_INGEST_MODE`  | ingest      | `sim` · `live` · `static`              |
| `VITE_STDB_URI`          | web build   | Browser WebSocket (`wss://` in prod)   |
| `VITE_STDB_DB`           | web build   | Module name                            |
| `FRED_API_KEY`, `EIA_API_KEY` | ingest | Optional live feeds                |

See [README.md](../README.md) for LLM bridge and full feed table.
