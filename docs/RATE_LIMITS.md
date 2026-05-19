# External API rate limits

OpenAtlas ingest enforces conservative outbound limits so public APIs and your
API keys (FRED, EIA) are not abused. Limits are implemented in
`crates/openatlas-ingest/src/rate_limit.rs` and `feeds/http.rs`.

## Per-feed poll intervals

| Feed | Interval | Notes |
|------|----------|--------|
| USGS | 45s | Earthquake GeoJSON feed |
| Open-Meteo | 60s | 6 regions per cycle (host gap between calls) |
| CoinGecko | 90s | Free tier friendly |
| NASA EONET | 180s | Single request per cycle |
| GDELT | 180s | Fragile; 30s host gap |
| FRED | 600s | 4 series per cycle, 2s between calls |
| EIA | 900s | Single request per cycle |
| OpenSky | 900s | Anonymous tier |
| World Bank | 3600s | Single batched request |

After failures, exponential backoff applies (5s → 10s → … capped at 5 minutes).
HTTP **429** responses use at least the feed’s poll interval before retry.

## Per-host minimum gaps

Applied between **any** HTTP requests to the same host (including multi-URL
cycles like FRED and Open-Meteo):

| Host | Gap |
|------|-----|
| `api.gdeltproject.org` | 30s |
| `api.coingecko.com` | 12s |
| `opensky-network.org` | 10s |
| `eonet.gsfc.nasa.gov` | 5s |
| `api.stlouisfed.org` | 2s |
| `api.eia.gov` | 2s |
| `api.worldbank.org` | 2s |
| `earthquake.usgs.gov` | 1s |
| `api.open-meteo.com` | 1s |
| (other) | 1s |

## Operator actions (Settings UI)

**Test** and **Reconnect** share a per-feed cooldown (default **30 seconds**).
If you click too soon, the API returns a clear message instead of hitting the
upstream provider.

Override: `OPENATLAS_OPERATOR_FETCH_COOLDOWN_SECS=60`

## Startup

When live feeds start, each worker is delayed by `index × 3s` so all nine feeds
do not fetch simultaneously on `./dev.sh up`.

## Tuning

Poll intervals are constants in each `feeds/<name>.rs` module. Host gaps are in
`rate_limit::host_min_gap`. Change there if a provider updates their policy;
rebuild ingest after edits.
