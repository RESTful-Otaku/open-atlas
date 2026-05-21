#!/usr/bin/env bash
# Write .dev/feed-secrets.json from feed API env vars (CI injects secrets; never echoed).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${OPENATLAS_FEED_SECRETS:-$ROOT/.dev/feed-secrets.json}"

mkdir -p "$(dirname "$OUT")"

fred="${FRED_API_KEY:-}"
eia="${EIA_API_KEY:-}"
opensky_id="${OPENSKY_CLIENT_ID:-}"
opensky_secret="${OPENSKY_CLIENT_SECRET:-}"

if [[ -z "$fred" && -z "$eia" && -z "$opensky_id" && -z "$opensky_secret" ]]; then
  echo "write-feed-secrets: no feed secrets in environment — skipping" >&2
  exit 0
fi

count="$(python3 - <<'PY' "$OUT" "$fred" "$eia" "$opensky_id" "$opensky_secret"
import json, sys
out, fred, eia, oid, osec = sys.argv[1:6]
data = {}
if fred.strip():
    data["FRED_API_KEY"] = fred.strip()
if eia.strip():
    data["EIA_API_KEY"] = eia.strip()
if oid.strip():
    data["OPENSKY_CLIENT_ID"] = oid.strip()
if osec.strip():
    data["OPENSKY_CLIENT_SECRET"] = osec.strip()
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
print(len(data))
PY
)"

echo "write-feed-secrets: wrote $(basename "$OUT") ($count key(s))" >&2
