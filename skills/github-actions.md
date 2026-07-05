# GitHub Actions / CI/CD Skill

Loaded when the project uses GitHub Actions for CI/CD. Supplements
`rules/conventions.md` with CI/CD patterns.

---

## Workflow Structure

```
.github/workflows/
├── ci.yml               # main CI — lint, typecheck, test, build
├── deploy.yml           # deployment to staging/production
├── release.yml          # release automation (tag, publish)
└── audit.yml            # periodic security scans
```

## CI Workflow Template

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: 22
  PNPM_VERSION: 9

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/test

  build:
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

## Conventions

- **Checkout v4**: Always `actions/checkout@v4`. Pinned major versions,
  never `@main` or `@latest`.
- **Cache dependencies**:
  ```yaml
  - uses: actions/setup-node@v4
    with: { cache: 'pnpm' }
  ```
  Or manually for other ecosystems (Rust: `Swatinem/rust-cache`, Python:
  `actions/setup-python` with cache).
- **Matrix builds** sparingly. Only when you need to test multiple OS or
  language versions. Prefer a single fast runner over 4 slow matrix jobs.
  ```yaml
  strategy:
    matrix:
      node: [20, 22]
  ```
- **Environment separation**: Use `environment:` for deploy jobs.
  Required reviewers for production. Secrets per environment.
  ```yaml
  deploy-production:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://app.example.com
    needs: [build, test]
    steps: [/* ... */]
  ```
- **No secrets in workflow files**: Use `${{ secrets.NAME }}`. Never
  echo secrets or pass them as env vars to debug steps.
- **Job concurrency**: Cancel in-progress runs on the same branch/PR
  when a new push arrives:
  ```yaml
  concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: true
  ```
- **Step summaries**: Use `>> $GITHUB_STEP_SUMMARY` for human-readable
  output (coverage, lint results, release notes).
- **Artifacts**: Upload build artifacts with `actions/upload-artifact@v4`
  only if needed by a downstream job (deploy, release). Set retention
  days: `retention-days: 7`.
- **Actions pinning**: Pin third-party actions to commit SHAs for
  security. Dependabot can update them automatically:
  ```yaml
  - uses: actions/checkout@v4
  # instead of: actions/checkout@v4  ← tag may be overwritten
  ```
- **Speed**: Target < 10 min total CI time. Parallelise lint and
  typecheck. Use test splitting for large suites.
- **No `pull_request_target`** without understanding the security
  implications. It runs in the base repo's context, not the PR's.
