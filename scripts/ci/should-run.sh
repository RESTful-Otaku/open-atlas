#!/usr/bin/env bash
# Print whether a CI slice should run for the current git change set.
# Usage:
#   ./scripts/ci/should-run.sh rust
#   ./scripts/ci/should-run.sh web --base origin/main
# Exit 0 = run, 1 = skip
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_REF="${CI_BASE_REF:-origin/main}"
SLICE="${1:-}"

usage() {
  echo "usage: $0 <rust|stdb|ingest|web|e2e|docs|shared|all> [--base REF]" >&2
  exit 2
}

[[ -n "$SLICE" ]] || usage

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_REF="${2:?}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if ! git -C "$ROOT" rev-parse "$BASE_REF" >/dev/null 2>&1; then
  echo "should-run: base ref '$BASE_REF' not found — default run" >&2
  exit 0
fi

DIFF_RANGE="$BASE_REF...HEAD"
if ! git -C "$ROOT" rev-parse "$DIFF_RANGE" >/dev/null 2>&1; then
  DIFF_RANGE="$BASE_REF HEAD"
fi

diff_hits() {
  git -C "$ROOT" diff --name-only $DIFF_RANGE -- "$@" | grep -q .
}

case "$SLICE" in
  all) exit 0 ;;
  shared)
    diff_hits .github/ scripts/ci/ scripts/test-all.sh scripts/check-no-secrets-in-git.sh scripts/e2e-qa.sh && exit 0
    exit 1
    ;;
  rust)
    diff_hits .github/ scripts/ci/ && exit 0
    diff_hits crates/ Cargo.toml Cargo.lock rust-toolchain.toml && exit 0
    exit 1
    ;;
  stdb)
    diff_hits .github/ scripts/ci/ && exit 0
    diff_hits crates/openatlas-stdb-module/ && exit 0
    diff_hits crates/ Cargo.toml Cargo.lock && exit 0
    exit 1
    ;;
  ingest)
    diff_hits .github/ scripts/ci/ && exit 0
    diff_hits crates/openatlas-ingest/ && exit 0
    diff_hits crates/ Cargo.toml Cargo.lock && exit 0
    exit 1
    ;;
  web)
    diff_hits .github/ scripts/ci/ && exit 0
    diff_hits web/ && exit 0
    exit 1
    ;;
  e2e)
    diff_hits .github/ scripts/ci/ && exit 0
    diff_hits web/ && exit 0
    exit 1
    ;;
  docs)
    diff_hits docs/ ARCHITECTURE.md && exit 0
    git -C "$ROOT" diff --name-only $DIFF_RANGE | grep -qE '\.md$' && exit 0
    exit 1
    ;;
  *)
    usage
    ;;
esac
