# GitHub Environments

Configure in **Repository → Settings → Environments**.

Full inventory and setup: **[docs/GITHUB_SECRETS.md](../../docs/GITHUB_SECRETS.md)**.

## `qa`

Used by **CI — QA (main)** when running **verify_feeds** (live open-data smoke).

| Type | Name | Required |
|------|------|----------|
| Secret | `FRED_API_KEY` | For `verify_feeds` only |
| Secret | `EIA_API_KEY` | For `verify_feeds` only |
| Variable | `OPENATLAS_STDB_URI` | If QA targets remote STDB (optional) |
| Variable | `OPENATLAS_STDB_DB` | Default `openatlas` |

No approval gate. Do not reuse production keys if you can avoid it — use separate FRED/EIA keys per environment when providers allow.

## `staging`

Used by **CD — Staging** (artifact build + future deploy steps).

| Type | Name | Example |
|------|------|---------|
| Secret | `FRED_API_KEY` | staging feed key |
| Secret | `EIA_API_KEY` | staging feed key |
| Variable | `STAGING_STDB_URI` | `https://…` |
| Variable | `STAGING_STDB_DB` | `openatlas-staging` |
| Variable | `OPENATLAS_INGEST_MODE` | `live` |

**Deployment branches:** restrict to `main` (recommended).

## `production`

Used by **CD — Production** (manual promotion only).

| Type | Name | Example |
|------|------|---------|
| Secret | `FRED_API_KEY` | production feed key |
| Secret | `EIA_API_KEY` | production feed key |
| Variable | `PRODUCTION_STDB_URI` | `wss://maincloud.spacetimedb.com` |
| Variable | `PRODUCTION_STDB_DB` | `openatlas` |
| Variable | `VITE_LLM_BASE` | `https://your-host/api/llm` |

**Required reviewers:** enable (at least one release owner).

**Wait timer:** optional (e.g. 5 minutes).

## Repository-level secrets

Avoid storing feed keys at repository scope — use environment secrets so staging cannot read production keys.

Repository secrets are appropriate only for org-wide tokens unrelated to OpenAtlas feeds (e.g. future `SPACETIMEDB_DEPLOY_TOKEN` if you add one).

## Checklist

- [ ] Created `qa`, `staging`, `production` environments
- [ ] Added `FRED_API_KEY` + `EIA_API_KEY` to each environment that needs live feeds
- [ ] Set `PRODUCTION_STDB_URI` / `PRODUCTION_STDB_DB` as **variables** (not secrets)
- [ ] Enabled production required reviewers
- [ ] Branch protection requires **Merge gate** on `main`
- [ ] Verified no `.env` or `.dev/` files are tracked (`./scripts/check-no-secrets-in-git.sh`)
