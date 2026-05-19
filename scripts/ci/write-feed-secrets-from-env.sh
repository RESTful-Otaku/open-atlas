#!/usr/bin/env bash
# Write .dev/feed-secrets.json from FRED_API_KEY / EIA_API_KEY in the environment.
# For CI: secrets are injected by GitHub Actions; values are never echoed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${OPENATLAS_FEED_SECRETS:-$ROOT/.dev/feed-secrets.json}"

mkdir -p "$(dirname "$OUT")"

fred="${FRED_API_KEY:-}"
eia="${EIA_API_KEY:-}"

if [[ -z "$fred" && -z "$eia" ]]; then
  echo "write-feed-secrets: no FRED_API_KEY or EIA_API_KEY set — skipping" >&2
  exit 0
fi

count="$(python3 - <<'PY' "$OUT" "$fred" "$eia"
import json, sys
out, fred, eia = sys.argv[1], sys.argv[2], sys.argv[3]
data = {}
if fred.strip():
    data["FRED_API_KEY"] = fred.strip()
if eia.strip():
    data["EIA_API_KEY"] = eia.strip()
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
print(len(data))
PY
)"

echo "write-feed-secrets: wrote $(basename "$OUT") ($count key(s))" >&2
