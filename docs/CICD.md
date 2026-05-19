# CI/CD pipeline

OpenAtlas uses **path-filtered** GitHub Actions workflows so PRs only run checks for systems that actually changed. A single aggregate check — **Merge gate** — is what branch protection should require.

## Pipeline tiers

| Tier | Workflow | When | Purpose |
|------|----------|------|---------|
| **Dev** | `ci.yml` | PR + push to `main` | Fast, conditional merge checks |
| **QA** | `qa.yml` | Push to `main` | Full compile gates + Playwright after merge |
| **Staging** | `deploy-staging.yml` | After QA succeeds (or manual) | Build artifacts → staging environment |
| **Production** | `deploy-production.yml` | Manual only | Approval-gated promotion |
| **Nightly** | `nightly.yml` | Cron 04:00 UTC | Full matrix + optional live stack smoke |

## Path filters

Definitions live in [`.github/path-filters.yml`](../.github/path-filters.yml).

| Slice | Paths (summary) | Also runs when |
|-------|-----------------|----------------|
| **shared** | `.github/**`, `scripts/ci/**`, core scripts | — |
| **rust** | `crates/**`, `Cargo.toml`, `Cargo.lock` | `stdb` or `ingest` changed |
| **stdb** | `crates/openatlas-stdb-module/**` | — |
| **web** | `web/**` | — |
| **e2e** | `web/e2e/**`, Playwright config | `web` changed |
| **secrets** | entire repo | always on PR CI |

Changing **shared** paths forces the **full Dev matrix** (all slices).

### Local “should this run?”

```bash
./scripts/ci/should-run.sh rust --base origin/main
./scripts/ci/should-run.sh web --base origin/main
```

Exit `0` = run, `1` = skip.

## Dev — PR merge checks (`ci.yml`)

### Jobs (conditional)

- `secrets-scan` — always
- `rust-fmt`, `rust-clippy`, `rust-test` — if rust slice
- `stdb-module-build` — if stdb slice
- `web-svelte-check`, `web-unit-tests` — if web slice
- `web-e2e-smoke` — if e2e slice (web or e2e paths)
- **`Merge gate`** — always; fails if a **required** job for the active slices did not succeed

### Manual full matrix

Actions → **CI — Dev (PR merge checks)** → **Run workflow** → enable **full_suite**.

### Branch protection (recommended)

Repository → **Settings → Branches →** rule for `main`:

1. Require status check: **`Merge gate`**
2. Require pull request before merging
3. (Optional) Require `QA gate` on main via ruleset or second workflow — QA runs **after** merge on push

Do **not** list every conditional job individually in required checks — skipped jobs do not satisfy “required” on GitHub. **Merge gate** encodes the conditional logic ([`scripts/ci/merge-gate.sh`](../scripts/ci/merge-gate.sh)).

## QA — main (`qa.yml`)

Runs when rust, stdb, ingest, web, or shared paths change on `main` (or on `workflow_dispatch`).

| Job | What |
|-----|------|
| `qa-compile-gates` | `./scripts/e2e-qa.sh` (fmt, clippy, test, web build, STDB wasm build) |
| `qa-playwright-smoke` | Demo-mode Playwright |
| **`QA gate`** | Both succeeded when QA was in scope |

Options on manual run:

- **quick** — compile only (`e2e-qa.sh --quick`)
- **verify_feeds** — live open-data adapters (`--verify-feeds`, slow, needs network)

## Staging (`deploy-staging.yml`)

**Trigger:** successful completion of **CI — QA (main)** on `main`, or manual dispatch.

**Environment:** `staging` (configure in **Settings → Environments**).

**Outputs:** GitHub Actions artifact `openatlas-staging-<sha>.tar.gz` containing:

- `openatlas-ingest` (release binary)
- `web-dist/` (Vite build)

Add your real deploy steps in the workflow (SpacetimeDB publish, rsync, systemd) or in environment secrets/variables.

**Gate:** `Staging gate`

## Production (`deploy-production.yml`)

**Trigger:** manual only.

**Inputs:**

- `git_ref` — tag, branch, or SHA to promote
- `confirm` — must be exactly `deploy`

**Environment:** `production` — enable **Required reviewers** in GitHub Environments for approval gating.

Runs `e2e-qa.sh --quick`, builds release artifacts, uploads `openatlas-production-<sha>.tar.gz`.

Set repository **Variables** (optional):

- `PRODUCTION_STDB_URI` — passed to `VITE_STDB_URI` at build time
- `PRODUCTION_STDB_DB`

## Nightly (`nightly.yml`)

Full rust + web + STDB build; optional `e2e-qa` with local SpacetimeDB (`continue-on-error` for stack smoke). **Not required for merge.**

## Reusable workflows

| File | Use |
|------|-----|
| `reusable-rust.yml` | Callable fmt / clippy / test |
| `reusable-web.yml` | Callable check / unit / e2e |
| `reusable-stdb.yml` | Callable STDB wasm build |

Extend these when adding new workflows to avoid drift.

## Secrets and safety

- `scripts/check-no-secrets-in-git.sh` runs on every Dev CI run.
- Never commit `.env`, `.dev/feed-secrets.json`, or API keys — see [`docs/CONFIG.md`](CONFIG.md).
- **GitHub setup (environments, API keys, variables):** [`docs/GITHUB_SECRETS.md`](GITHUB_SECRETS.md).
- Feed keys in deploy/QA jobs: `scripts/ci/write-feed-secrets-from-env.sh` (values never logged).

## Related docs

- [`docs/TESTING.md`](TESTING.md) — test types and local commands
- [`docs/DEPLOY.md`](DEPLOY.md) — runtime deploy to SpacetimeDB Cloud / single host
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — system overview
