#!/usr/bin/env bash
# Run the reducer replay scaffold (host-side WorldGraph oracle).
set -euo pipefail
cd "$(dirname "$0")/.."
exec cargo test -p openatlas-stdb-module --test replay_harness -- --nocapture
