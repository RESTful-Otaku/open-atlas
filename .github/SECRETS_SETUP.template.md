# GitHub setup template (copy checklist — do not put real keys here)

Use **[docs/GITHUB_SECRETS.md](../docs/GITHUB_SECRETS.md)** for full detail.

## 1. Environments

Create in **Settings → Environments**:

- [ ] `qa`
- [ ] `staging` (deployment branch: `main`)
- [ ] `production` (required reviewers: ON)

## 2. Secrets (per environment that runs live feeds)

Add to **qa**, **staging**, and **production** as needed:

| Secret | Where to get |
|--------|----------------|
| `FRED_API_KEY` | https://fred.stlouisfed.org/docs/api/api_key.html |
| `EIA_API_KEY` | https://www.eia.gov/opendata/register.php |

## 3. Variables

### `qa`

| Variable | Your value |
|----------|------------|
| `OPENATLAS_STDB_URI` | |
| `OPENATLAS_STDB_DB` | `openatlas` |

### `staging`

| Variable | Your value |
|----------|------------|
| `STAGING_STDB_URI` | |
| `STAGING_STDB_DB` | |
| `OPENATLAS_INGEST_MODE` | `live` |

### `production`

| Variable | Your value |
|----------|------------|
| `PRODUCTION_STDB_URI` | `wss://…` |
| `PRODUCTION_STDB_DB` | `openatlas` |
| `VITE_LLM_BASE` | `https://…/api/llm` |

## 4. Branch protection

- [ ] Require **Merge gate** on `main`

## 5. Verify

- [ ] Push a PR — Dev CI passes without feed secrets
- [ ] Actions → **CI — QA** → Run with `verify_feeds` — passes with `qa` secrets
- [ ] `./scripts/check-no-secrets-in-git.sh` locally
