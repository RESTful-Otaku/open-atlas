# GitHub secrets & CI/CD configuration

This document lists **every** config knob and API key in OpenAtlas, what needs to be secret, and how to configure **GitHub Environments** so staging and production stay isolated.

**Local dev** uses gitignored files — see [CONFIG.md](./CONFIG.md). **Never** commit real keys; CI uses [check-no-secrets-in-git.sh](../scripts/check-no-secrets-in-git.sh).

---

## Inventory

### API keys (treat as secrets)

| Name | Used by | Required for | Get a key |
|------|---------|--------------|-----------|
| `FRED_API_KEY` | Ingest feed `fred` | Live FRED macro data | [fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html) |
| `EIA_API_KEY` | Ingest feed `eia` | Live EIA energy data | [eia.gov/opendata/register.php](https://www.eia.gov/opendata/register.php) |
| `OPENSKY_CLIENT_ID` | Ingest feed `opensky` | OAuth2 client ID (optional; higher limits than anonymous) | [opensky-network.org](https://opensky-network.org) → Account → API clients |
| `OPENSKY_CLIENT_SECRET` | Ingest feed `opensky` | OAuth2 client secret (**must** be set with `OPENSKY_CLIENT_ID`) | Same |

Only these names are accepted by `PUT /feeds` and `.dev/feed-secrets.json` (allowlist in `feed_config.rs`). OpenSky works without credentials (anonymous, rate-limited).

| Name | Status | Notes |
|------|--------|-------|
| `OPENATLAS_API_KEY` | Optional | Required for `PUT /feeds*` when set or when ingest binds non-loopback; header `x-openatlas-key` |

### SpacetimeDB (usually variables, not secrets)

| Name | Default | Used by |
|------|---------|---------|
| `OPENATLAS_STDB_URI` | `http://127.0.0.1:3000` | Ingest HTTP, CLI, QA scripts |
| `OPENATLAS_STDB_DB` | `openatlas` | Ingest, CLI, subscriptions |

Cloud hosts often use a **public** `https://` / `wss://` URL without a separate API key in this repo. If your host issues a token, store it as a **secret** and pass it via your deploy layer (not committed here).

### Web build (`VITE_*` — inlined into the static bundle)

| Name | Secret? | Used by |
|------|---------|---------|
| `VITE_STDB_URI` | No (public URL) | Browser WebSocket to SpacetimeDB |
| `VITE_STDB_DB` | No | Module/database name |
| `VITE_LLM_BASE` | No | Production LLM bridge URL (browser calls this) |
| `VITE_DEMO_DATA` | No | Build-time demo mode — **never set in prod** |

### Ingest / ops (variables unless they contain keys)

| Name | Default | Purpose |
|------|---------|---------|
| `OPENATLAS_INGEST_MODE` | `sim` / `hybrid` in dev | `sim` · `live` · `hybrid` · `static` |
| `OPENATLAS_ENABLE_LIVE_FEEDS` | unset | Legacy flag → `live` |
| `OPENATLAS_FEED_SECRETS` | `.dev/feed-secrets.json` | Path to feed keys file on disk |
| `OPENATLAS_OPERATOR_FETCH_COOLDOWN_SECS` | `30` | Settings test/reconnect cooldown |
| `OPENATLAS_SKIP_BUILD` | unset | Dev harness only |
| `OPENATLAS_START_LLM` | `1` in dev | Auto-start LLM bridge in `dev.sh` |
| `OPENATLAS_LOG_JSON` | unset | JSON logs from ingest |
| `RUST_LOG` | `openatlas_ingest=info,info` | Rust tracing filter |

### LLM bridge (optional stack)

| Name | Default | Purpose |
|------|---------|---------|
| `OPENATLAS_OLLAMA_BASE` | `http://127.0.0.1:11434` | Ollama HTTP API |
| `OPENATLAS_OLLAMA_MODEL` | `llama3.2` | Model name |
| `OPENATLAS_OLLAMA_TIMEOUT_SECS` | `300` | Request timeout |
| `OPENATLAS_OLLAMA_NUM_GPU` | unset | GPU layers hint |
| `OPENATLAS_LLM_LISTEN` | `127.0.0.1:3847` | Bridge bind address |

### Feeds without API keys (no GitHub secret)

`usgs`, `open-meteo`, `coingecko`, `nasa-eonet`, `gdelt`, `world-bank` — public APIs; rate-limited in ingest only. `opensky` is public without OAuth but benefits from client credentials.

### CI-only (GitHub Actions built-in)

| Name | Purpose |
|------|---------|
| `GITHUB_TOKEN` | Default `permissions:` in workflows — artifacts, summaries |
| `CI` | Set by Actions — Playwright retries, etc. |

### iOS CI signing (optional)

Required only for **device IPA** export in [`mobile-ios.yml`](../.github/workflows/mobile-ios.yml) (`release-ipa` or `v*` tags). Simulator builds do not need these.

| Secret | Purpose |
|--------|---------|
| `IOS_BUILD_CERTIFICATE_BASE64` | `.p12` distribution or development cert, base64 |
| `IOS_BUILD_PROVISION_PROFILE_BASE64` | `.mobileprovision` for `com.openatlas.app`, base64 |
| `IOS_KEYCHAIN_PASSWORD` | Ephemeral CI keychain password |
| `IOS_TEAM_ID` | Apple Developer Team ID |

Optional **variables** for mobile web build:

| Variable | Purpose |
|----------|---------|
| `OPENATLAS_PUBLIC_INGEST_URL` | Baked `VITE_INGEST_BASE` on phone (public ingest health) |
| `OPENATLAS_PUBLIC_LLM_URL` | Baked `VITE_LLM_BASE` (cloud LLM bridge) |

**Not in GitHub:** Gemini API keys — users enter them in **Settings** on the device (never baked into `VITE_*`).

---

## What CI needs today

| Workflow | Secrets required? | Notes |
|----------|-------------------|-------|
| **CI — Dev** (`ci.yml`) | **No** | Path-filtered tests; demo Playwright; no live feeds |
| **CI — QA** (`qa.yml`) | **Only if** `verify_feeds: true` | Needs feed secrets in **`qa` environment** (see below) |
| **CD — Staging** | Optional for real deploy | STDB URL + feed keys when you add publish steps |
| **CD — Production** | Optional for real deploy | Same; use **production** environment only |
| **Nightly** | Optional | `RUN_LIVE_FEED_TEST=1` ignored test — optional repo secret |

**Merge gate and unit tests never need your API keys.**

---

## Recommended GitHub layout

Use **three environments** (Settings → Environments). Do **not** put production feed keys in repository-level secrets.

```
Repository
├── Secrets (minimal)
│   └── (none ideally, or org-wide read-only tokens)
│
├── Environment: qa
│   ├── Secrets: FRED_API_KEY, EIA_API_KEY
│   └── Variables: OPENATLAS_STDB_URI, OPENATLAS_STDB_DB (if QA hits remote STDB)
│
├── Environment: staging
│   ├── Secrets: FRED_API_KEY, EIA_API_KEY
│   ├── Variables: STAGING_STDB_URI, STAGING_STDB_DB, OPENATLAS_INGEST_MODE=live
│   └── Deployment branches: main only
│
└── Environment: production
    ├── Required reviewers: 1+
    ├── Secrets: FRED_API_KEY, EIA_API_KEY, (OPENATLAS_API_KEY future)
    ├── Variables: PRODUCTION_STDB_URI, PRODUCTION_STDB_DB, VITE_LLM_BASE
    └── Deployment: manual workflow only
```

### Why environments?

- **Isolation** — staging keys cannot be read by production workflows (and vice versa) when secrets are defined per environment.
- **Approval gates** — production environment “Required reviewers”.
- **Audit** — GitHub deployment history per environment.

---

## Step-by-step setup

### 1. Create environments

**Repository → Settings → Environments → New environment**

Create: `qa`, `staging`, `production`.

For **production**: enable **Required reviewers** and optionally **Wait timer**.

### 2. Add secrets (sensitive)

For each environment that runs **live feeds** or deploys ingest:

| Secret name | Value |
|-------------|--------|
| `FRED_API_KEY` | your FRED key |
| `EIA_API_KEY` | your EIA key |
| `OPENSKY_CLIENT_ID` | OpenSky API **client ID** (plain string, not JSON) |
| `OPENSKY_CLIENT_SECRET` | OpenSky API **client secret** (set together with the ID) |

**OpenSky:** Do not paste the `credentials.json` blob as one secret. Create **two** repository/environment secrets with the exact names above — copy `clientId` → `OPENSKY_CLIENT_ID` and `clientSecret` → `OPENSKY_CLIENT_SECRET`.

Optional later:

| Secret name | Value |
|-------------|--------|
| `OPENATLAS_API_KEY` | random string for admin routes |
| `SPACETIMEDB_TOKEN` | only if your host requires it (custom deploy) |

**Naming:** Use the **exact** env var names above so workflows map 1:1 without translation.

### 3. Add variables (non-sensitive)

**Environment `staging`**

| Variable | Example |
|----------|---------|
| `STAGING_STDB_URI` | `https://maincloud.spacetimedb.com` |
| `STAGING_STDB_DB` | `openatlas-staging` |
| `OPENATLAS_INGEST_MODE` | `live` |

**Environment `production`**

| Variable | Example |
|----------|---------|
| `PRODUCTION_STDB_URI` | `wss://maincloud.spacetimedb.com` |
| `PRODUCTION_STDB_DB` | `openatlas` |
| `VITE_LLM_BASE` | `https://your-domain.com/api/llm` |

`deploy-production.yml` already maps `PRODUCTION_STDB_URI` → `VITE_STDB_URI` at web build time.

### 4. Branch protection

Require status check **`Merge gate`** on `main` (see [CICD.md](./CICD.md)).

Do **not** require feed-dependent jobs globally.

### 5. Optional: QA live feed verification

**Actions → CI — QA (main) → Run workflow** → enable **verify_feeds**.

Requires feed secrets on the **`qa`** environment (at minimum the feeds you want `e2e-qa.sh --verify-feeds` to hit — include OpenSky pair for authenticated OpenSky tests).

---

## How workflows consume secrets

Feed keys in CI are written to a ephemeral file (never logged):

```bash
./scripts/ci/write-feed-secrets-from-env.sh
```

That script reads `FRED_API_KEY`, `EIA_API_KEY`, `OPENSKY_CLIENT_ID`, and `OPENSKY_CLIENT_SECRET` from the environment and writes `.dev/feed-secrets.json` for ingest.

Staging/production deploy jobs should:

1. Use `environment: staging` or `environment: production`.
2. Map secrets to env vars in the step (GitHub masks values in logs).
3. Call `write-feed-secrets-from-env.sh` before starting ingest or `e2e-qa.sh --verify-feeds`.

---

## Security rules

1. **Never** commit `.env`, `web/.env`, or `.dev/feed-secrets.json` — run `./scripts/check-no-secrets-in-git.sh` locally.
2. **Never** print secrets in workflow logs (`echo "$FRED_API_KEY"` is masked only if passed via `secrets.` context).
3. Prefer **environment secrets** over repository secrets for keys.
4. Rotate keys in GitHub and in [FRED](https://fred.stlouisfed.org) / [EIA](https://www.eia.gov/) dashboards if leaked.
5. `VITE_*` values are **public** in the built JS bundle — only put URLs/names there, never API keys.

---

## Local ↔ GitHub mapping

| Local (gitignored) | GitHub equivalent |
|------------------|-------------------|
| `.env` | Environment variables (per env) |
| `.dev/local.env` | Optional extra variables |
| `.dev/feed-secrets.json` | Environment secrets `FRED_API_KEY`, `EIA_API_KEY` |
| `web/.env` | Variables `PRODUCTION_STDB_URI`, `VITE_LLM_BASE`, etc. |

Quick local bootstrap:

```bash
./scripts/init-local-config.sh
# Edit .dev/feed-secrets.json from docs/feed-secrets.example.json
```

---

## Related docs

- [CONFIG.md](./CONFIG.md) — local files and precedence
- [CICD.md](./CICD.md) — workflows and gates
- [DEPLOY.md](./DEPLOY.md) — SpacetimeDB Cloud and static hosting
- [.github/environments/README.md](../.github/environments/README.md) — short environment checklist
