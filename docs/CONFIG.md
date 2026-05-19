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

## Production

- Use your platform’s secret store (Kubernetes secrets, Vault, etc.) and map to
  the same env var names — do not ship `.dev/` or `.env` in images.
- Build the web app with `web/.env` or inline `VITE_*` at build time.
- See [DEPLOY.md](./DEPLOY.md).

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

## CI guard

```bash
./scripts/check-no-secrets-in-git.sh
```

Fails if `.env`, `.dev/`, `web/.env`, or `feed-secrets.json` are tracked.
