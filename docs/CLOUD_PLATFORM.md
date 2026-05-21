# Maincloud platform (fully hosted)

Run OpenAtlas on a phone or browser **without** a dev machine on the same LAN. Live data still flows:

```text
3rd-party APIs → openatlas-ingest (your cloud VM) → HTTP reducers → Maincloud STDB
                                                                      ↑
Phone / browser ←──────────── WebSocket subscriptions ──────────────┘
```

## What runs where

| Component | Host | Notes |
|-----------|------|--------|
| **openatlas-stdb-module** | Maincloud (`wss://maincloud.spacetimedb.com`) | Single WASM module — authoritative state |
| **openatlas-ingest** | Your cloud VM / container | Rust HTTP service — **not** a second SpacetimeDB module |
| **LLM (optional)** | Same ingest host | `/api/llm/v1/*` Gemini proxy when `OPENATLAS_CLOUD_GEMINI_API_KEY` is set on the server |
| **Client** | Phone / browser | Settings → **Cloud platform (full)** |

### Why ingest is not inside SpacetimeDB

SpacetimeDB reducers must be deterministic and cannot perform outbound HTTP or hold API secrets. Feed polling, circuit breakers, and third-party keys live in **openatlas-ingest**, which calls `ingest_event` / `ingest_events_batch` on the module over HTTP.

### Why LLM is not inside SpacetimeDB

Same constraints: model inference is non-deterministic and requires external APIs. Options:

1. **Hosted Gemini proxy on ingest** (recommended for teams) — set `OPENATLAS_CLOUD_GEMINI_API_KEY` on the ingest host; clients use `VITE_LLM_BASE=https://your-ingest/api/llm` with provider **Local bridge**.
2. **Per-device Gemini** — Settings → LLM providers → Google Gemini (API key on device).

## Deploy ingest to a cloud host

1. Publish the module (once per environment):

   ```bash
   ./dev.sh spacetime:publish:cloud
   ```

2. On a VM with outbound internet and feed API keys:

   ```bash
   export OPENATLAS_STDB_URI=https://maincloud.spacetimedb.com
   export OPENATLAS_STDB_DB=openatlas
   export OPENATLAS_INGEST_MODE=live
   export OPENATLAS_BIND=0.0.0.0:8080
   export OPENATLAS_API_KEY=your-operator-key
   export OPENATLAS_CLOUD_GEMINI_API_KEY=your-gemini-key   # optional LLM proxy
   # FRED_API_KEY, EIA_API_KEY, OPENSKY_* — see docs/CONFIG.md
   ./target/release/openatlas-ingest
   ```

3. Put HTTPS in front (Caddy, nginx, Fly.io, etc.) so the phone can reach:

   - `https://ingest.example.com/health`
   - `https://ingest.example.com/status`
   - `https://ingest.example.com/api/llm/v1/ready` (if Gemini key set)

4. Verify:

   ```bash
   INGEST_BASE=https://ingest.example.com ./scripts/post-deploy-smoke.sh
   curl -s https://ingest.example.com/status | jq .stdb_reachable,.ingest_mode
   ```

## Local dev (simulate cloud platform)

Runs ingest on your laptop **writing to Maincloud**, with Vite using the same paths as production:

```bash
# Optional: enable Gemini proxy on local ingest
export OPENATLAS_CLOUD_GEMINI_API_KEY=your-key

./dev.sh run:cloud:platform
```

Then in the app: **Settings → Deployment → Cloud platform (full)** → **Apply & reconnect**.

Defaults for local sim:

- Ingest: `http://127.0.0.1:8080` (Vite proxies `/status`, `/api/llm`)
- STDB: `wss://maincloud.spacetimedb.com`

Override public URLs:

```bash
export OPENATLAS_CLOUD_INGEST_URL=https://ingest.example.com
export OPENATLAS_CLOUD_LLM_URL=https://ingest.example.com/api/llm
./dev.sh run:cloud:platform
```

## Build clients for hosted URLs

### Web

```bash
export OPENATLAS_CLOUD_INGEST_URL=https://ingest.example.com
export OPENATLAS_CLOUD_LLM_URL=https://ingest.example.com/api/llm
./dev.sh build:web:cloud:platform
```

### Android APK

```bash
export OPENATLAS_CLOUD_INGEST_URL=https://ingest.example.com
export OPENATLAS_CLOUD_LLM_URL=https://ingest.example.com/api/llm
make mobile-apk-cloud-platform
# → dist/mobile/openatlas-cloud-platform-release-unsigned.apk
```

Install: `adb install -r dist/mobile/openatlas-release.apk`

In the app: **Settings → Deployment → Cloud platform (full)**. LLM: provider **Local bridge** (points at hosted `/api/llm`) or **Google Gemini** on device.

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `OPENATLAS_STDB_URI` | Ingest host | `https://maincloud.spacetimedb.com` |
| `OPENATLAS_STDB_DB` | Ingest host | `openatlas` |
| `OPENATLAS_CLOUD_GEMINI_API_KEY` | Ingest host only | Enables `/api/llm/v1/*` on ingest |
| `OPENATLAS_CLOUD_INGEST_URL` | Build time | Baked `VITE_INGEST_BASE` |
| `OPENATLAS_CLOUD_LLM_URL` | Build time | Baked `VITE_LLM_BASE` (often `{ingest}/api/llm`) |
| `VITE_CLOUD_PLATFORM=1` | Build time | Default profile = cloud platform |

## CI / GitHub

Set repository variables (see `docs/GITHUB_SECRETS.md`):

- `STAGING_INGEST_URL` / `OPENATLAS_PUBLIC_INGEST_URL`
- `OPENATLAS_PUBLIC_LLM_URL`
- Feed API keys as secrets for the deploy host

The workflow does not run a long-lived ingest process for you — add your VM/systemd/k8s deploy after artifacts build.
