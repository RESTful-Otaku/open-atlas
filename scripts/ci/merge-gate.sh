#!/usr/bin/env bash
# Aggregate CI job results for branch protection / required check: "Merge gate".
#
# Required env (set by GitHub Actions merge-gate job):
#   GATE_EVENT — pull_request | push | workflow_dispatch
#   GATE_FULL_SUITE — true to require every slice (QA / manual full run)
#   CHANGES_* — true|false whether that slice was in scope
#   RESULT_* — success|failure|skipped|cancelled for each job
set -euo pipefail

failures=0

require_success() {
  local enabled="$1"
  local result="$2"
  local label="$3"
  if [[ "$enabled" != "true" ]]; then
    echo "skip  $label (unchanged)"
    return 0
  fi
  case "$result" in
    success)
      echo "ok    $label"
      ;;
    skipped)
      echo "FAIL  $label — required but skipped"
      failures=$((failures + 1))
      ;;
    cancelled)
      echo "FAIL  $label — cancelled"
      failures=$((failures + 1))
      ;;
    *)
      echo "FAIL  $label — $result"
      failures=$((failures + 1))
      ;;
  esac
}

echo "=== OpenAtlas merge gate ==="
echo "event: ${GATE_EVENT:-unknown}  full_suite: ${GATE_FULL_SUITE:-false}"
echo ""

if [[ "${GATE_FULL_SUITE:-false}" == "true" ]]; then
  CHANGES_SECRETS=true
  CHANGES_RUST=true
  CHANGES_STDB=true
  CHANGES_WEB=true
  CHANGES_E2E=true
fi

# Always enforced on PRs / pushes that run CI
require_success "${CHANGES_SECRETS:-true}" "${RESULT_SECRETS:-success}" "secrets-scan"

require_success "${CHANGES_RUST:-false}" "${RESULT_RUST_FMT:-skipped}" "rust-fmt"
require_success "${CHANGES_RUST:-false}" "${RESULT_RUST_CLIPPY:-skipped}" "rust-clippy"
require_success "${CHANGES_RUST:-false}" "${RESULT_RUST_TEST:-skipped}" "rust-test"

require_success "${CHANGES_STDB:-false}" "${RESULT_STDB_BUILD:-skipped}" "stdb-module-build"

require_success "${CHANGES_WEB:-false}" "${RESULT_WEB_CHECK:-skipped}" "web-svelte-check"
require_success "${CHANGES_WEB:-false}" "${RESULT_WEB_UNIT:-skipped}" "web-unit-tests"
require_success "${CHANGES_E2E:-false}" "${RESULT_WEB_E2E:-skipped}" "web-e2e-smoke"

echo ""
if [[ "$failures" -gt 0 ]]; then
  echo "Merge gate FAILED ($failures required check(s))"
  exit 1
fi

echo "Merge gate passed"
