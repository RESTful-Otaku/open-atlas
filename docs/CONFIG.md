# Local configuration & secrets

OpenAtlas keeps **all operator secrets and machine-local settings out of git**.
Committed files are **examples only** (placeholders, no real keys).

## Quick start

```bash
./scripts/init-local-config.sh   # creates gitignored files from examples
# Edit .env, .dev/local.env, .dev/feed-secrets.json, web/.env as needed
./dev.sh up
```

Or use **Settings → API keys** in the web UI to write feed keys to
`.dev/feed-secrets.json` without editing files.

## Gitignored locations

| Path | Purpose |
|------|---------|
| `.env` | Main dev overrides (`OPENATLAS_*`, `RUST_LOG`, …) — loaded by `dev.sh` and ingest |
| `.dev/local.env` | Optional extra secrets / overrides (same format as `.env`) |
| `.dev/feed-secrets.json` | Feed API keys (`FRED_API_KEY`, `EIA_API_KEY`) — Settings UI or manual |
| `.dev/` (entire dir) | PID files, logs, SpacetimeDB data, Ollama logs — never commit |
| `web/.env` | Vite build-time `VITE_*` (production STDB URL, LLM base, demo flag) |

## Committed examples (safe to copy)

| Example | Copy to |
|---------|---------|
| `.env.example` | `.env` |
| `docs/local.env.example` | `.dev/local.env` |
| `docs/feed-secrets.example.json` | `.dev/feed-secrets.json` |
| `web/.env.example` | `web/.env` |

## Precedence

When ingest starts:

1. **Process environment** (explicit `export`, systemd, container env) — highest
2. **`.dev/feed-secrets.json`** — overwrites feed key env vars
3. **`.dev/local.env`** then **`.env`** — only sets keys not already set

`./dev.sh` sources `.env`, `.dev/local.env`, and applies feed secrets (without
overriding keys you already exported).

## Feed API keys

| Variable | Feed |
|----------|------|
| `FRED_API_KEY` | FRED (St. Louis Fed) |
| `EIA_API_KEY` | EIA energy data |

`PUT /feeds` accepts **only** these names (allowlist). Keys are masked in the
API/UI (`••••` + last 4 characters).

Override secrets file path: `OPENATLAS_FEED_SECRETS=/path/to/file.json`

## Ingest HTTP (admin API)

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENATLAS_BIND` | `127.0.0.1:8080` | Listen address for `/health`, `/status`, `/feeds`, static `web/dist` fallback |
| `OPENATLAS_API_KEY` | unset | Shared secret for mutating routes (`PUT /feeds`, `PUT /feeds/poll-intervals`) |

**Auth policy (fail-closed):**

- **Loopback bind** + no API key → local dev may call `PUT /feeds*` without a header.
- **API key set** → all mutating `/feeds` routes require header `x-openatlas-key` (even on loopback).
- **Non-loopback bind** (e.g. `0.0.0.0:8080`) → `OPENATLAS_API_KEY` **must** be set; requests without a valid header receive `401` / `403`.

Read-only routes (`GET /health`, `/ready`, `/status`, `GET /feeds`, `GET /metrics`) stay unauthenticated; place ingest behind a reverse proxy for production.

### Browser operations console (Settings)

**Settings → Operations console** polls ingest while the panel is expanded:

| Endpoint | Use |
|----------|-----|
| `GET /status` | Ingest mode, STDB reachability, per-feed health |
| `GET /feeds` | Feed catalog, poll cadence, circuit state |
| `GET /metrics` | Prometheus text counters (`openatlas_ingest_*`) |

In Vite **dev** and **`vite preview`**, `/status`, `/feeds`, `/ready`, `/health`, and `/metrics` proxy to `127.0.0.1:8080` (`web/vite.config.ts`, override with `VITE_INGEST_PROXY_TARGET`). If `GET /metrics` returns 404, rebuild/restart ingest (`cargo build -p openatlas-ingest`); the Metrics tab still fills from `/status` `ingest_metrics` until then. SpacetimeDB connection events are mirrored into the live log from `connection.svelte.ts`.

## Production

- Use your platform’s secret store (Kubernetes secrets, Vault, etc.) and map to
  the same env var names — do not ship `.dev/` or `.env` in images.
- Build the web app with `web/.env` or inline `VITE_*` at build time.
- See [DEPLOY.md](./DEPLOY.md).
- **GitHub Actions:** [GITHUB_SECRETS.md](./GITHUB_SECRETS.md) — environment-scoped
  `FRED_API_KEY` / `EIA_API_KEY` and `PRODUCTION_STDB_*` variables.

## API rate limiting (ingest)

Live feeds are throttled in `openatlas-ingest` so upstream providers are not hammered:

| Mechanism | Purpose |
|-----------|---------|
| Per-feed `poll_interval` | Minimum time between poll cycles (45s–3600s per provider) |
| Per-host gap | Minimum spacing between HTTP calls to the same API host (e.g. 12s for CoinGecko, 30s for GDELT) |
| Staggered startup | Feeds start 3s apart so nine workers do not burst at once |
| Operator cooldown | Settings **Test** / **Reconnect**: 30s per feed (override: `OPENATLAS_OPERATOR_FETCH_COOLDOWN_SECS`) |
| HTTP 429 handling | Longer retry backoff; error surfaced in feed health |

Details: [docs/RATE_LIMITS.md](./RATE_LIMITS.md).

## LLM bridge (Ollama)

Optional narrative analysis for Hub, domain desks, and matrix panels. **Not**
part of SpacetimeDB reducers — deterministic module narratives remain the source
of truth for event detail.

### Stack

| Step | Command / service |
|------|-------------------|
| 1 | `ollama serve` (or `./dev.sh ollama:cpu` on incompatible GPUs) |
| 2 | `ollama pull llama3.2` (recommended; `qwen2.5:7b` / `mistral:7b` also work) |
| 3 | `./dev.sh llm:start` — runs `openatlas-llm-bridge` on `127.0.0.1:3847` |
| 4 | `./dev.sh up` or `bun run dev` — Vite proxies `/api/llm` → bridge |

Set `OPENATLAS_START_LLM=1` in `.env` to auto-start the bridge with `./dev.sh up`.

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENATLAS_LLM_LISTEN` | `127.0.0.1:3847` | Bridge HTTP bind |
| `OPENATLAS_OLLAMA_BASE` | `http://127.0.0.1:11434` | Ollama API |
| `OPENATLAS_OLLAMA_MODEL` | `llama3.2` | Model name (`ollama pull` first) |
| `OPENATLAS_OLLAMA_TIMEOUT_SECS` | `120` | Upstream chat timeout |
| `OPENATLAS_OLLAMA_NUM_GPU` | unset | Pass `0` to request CPU layers (restart Ollama for GTX 10xx CUDA errors) |
| `VITE_LLM_BASE` | unset (`/api/llm` in dev) | Production build: public bridge URL |
| `VITE_LLM_INSIGHT_TIMEOUT_MS` | `120000` | Browser abort for `POST /v1/insight` |

Production: reverse-proxy `/api/llm` to the bridge or set `VITE_LLM_BASE` at
`web` build time. See [DEPLOY.md](./DEPLOY.md).

### Verify

1. **Settings → Test LLM pipeline** — ping + one inference (uses `/v1/capable`).
2. **Hub → Generate Daily Briefing** — structured telemetry JSON; template fallback if LLM fails.
3. **Domain desk → AI analysis → Regenerate insight** — domain-scoped snapshot.

## CI guard

```bash
./scripts/check-no-secrets-in-git.sh
```

Fails if `.env`, `.dev/`, `web/.env`, or `feed-secrets.json` are tracked.
