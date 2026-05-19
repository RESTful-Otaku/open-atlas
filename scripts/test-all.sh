#!/usr/bin/env bash
# Run backend + frontend test suites (unit + integration; optional e2e).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RUN_E2E="${OPENATLAS_E2E:-0}"
RUN_STDB_INTEGRATION="${OPENATLAS_STDB_INTEGRATION:-0}"

echo "==> Rust: fmt check"
cargo fmt --all -- --check

echo "==> Rust: clippy"
cargo clippy --workspace --exclude openatlas-ui-wasm --no-deps -- -D warnings

echo "==> Rust: unit + integration tests"
cargo test --workspace --exclude openatlas-ui-wasm

if [[ "$RUN_STDB_INTEGRATION" == "1" ]]; then
  echo "==> Rust: SpacetimeDB integration (ignored tests)"
  cargo test -p openatlas-ingest --test stdb_integration -- --ignored
fi

echo "==> SpacetimeDB module build"
if command -v spacetime >/dev/null 2>&1; then
  spacetime build --module-path crates/openatlas-stdb-module
else
  echo "    (skip: spacetime CLI not installed)"
fi

echo "==> Web: svelte-check"
(cd web && bun run check)

echo "==> Web: unit tests"
(cd web && bun test src/lib)

if [[ "$RUN_E2E" == "1" ]]; then
  echo "==> Web: Playwright e2e"
  (cd web && bun run build && bunx playwright install chromium && bun run test:e2e)
else
  echo "==> Web: e2e skipped (set OPENATLAS_E2E=1 to run Playwright)"
fi

echo "All requested test stages passed."
