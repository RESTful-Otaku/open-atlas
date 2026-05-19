<div align="center">
  <img src="web/public/logo.png" alt="OpenAtlas logo" width="720" />
</div>

# OpenAtlas

Portable AI coding assistant configuration that makes agents (opencode, Claude,
Cursor, Copilot) produce correct, consistent, high-quality code — without being
told how every session. Clone into any project, the AI reads it automatically.

## Quick Start

```bash
# 1. Clone into your project
cp -r /path/to/opencode-guide my-project/

# 2. Protect from accidental push
cat opencode-guide/.gitignore.template >> my-project/.gitignore

# 3. (Optional) Remove unneeded skills — keep only your stack:
#    rm skills/{rust,python,go,...}.md

# 4. Customise commands in rules/testing.md for your toolchain
# 5. Open with your AI tool — the configs auto-load
```

## Structure

```
├── .opencode.md              # Root config: tenets, directives, load order
├── AGENTS.md                 # Universal instructions (opencode, Cursor, Copilot)
├── CLAUDE.md                 # Claude-specific config (Claude Code / IDE)
├── .gitignore.template       # Entries to prevent guide commit to remotes
├── rules/                    # Detailed reference (loaded in order)
│   ├── conventions.md        # Naming, types, error handling, functions, etc.
│   ├── architecture.md       # Layered architecture, module boundaries
│   ├── testing.md            # Test pyramid, patterns, commands per language
│   └── workflows.md          # Task lifecycle, commits, reviews, CI
├── skills/                   # Language/framework patterns (loaded on demand)
│   ├── reporting.md          # Report generation workflow
│   ├── protobuf.md           # Protocol Buffers + gRPC
│   ├── terraform.md          # Terraform / OpenTofu
│   ├── kubernetes.md         # Kubernetes + Helm
│   ├── rust.md               # Systems
│   ├── cpp.md                # Systems
│   ├── odin.md               # Systems
│   ├── golang.md             # Backend
│   ├── python.md             # Backend
│   ├── ruby.md               # Ruby + Rails
│   ├── java.md               # Backend
│   ├── csharp.md             # .NET / C#
│   ├── typescript.md         # Typed JS (web + backend)
│   ├── javascript.md         # Vanilla JS
│   ├── node.md               # Node.js runtime
│   ├── bun.md                # Bun runtime
│   ├── react.md              # Frontend
│   ├── react-native.md       # Mobile
│   ├── svelte.md             # Frontend
│   ├── vite.md               # Build tooling
│   ├── tailwind.md           # CSS framework
│   ├── capacitor.md          # Mobile hybrid
│   ├── docker.md             # Containers
│   ├── github-actions.md     # CI/CD
│   ├── yaml.md               # Data format
│   ├── json.md               # Data format
│   ├── sql.md                # SQL conventions (umbrella)
│   ├── sqlite.md, postgres.md, mariadb.md, cassandra.md
│   ├── spacetime-db.md, mongodb.md, oracle.md
├── reports/                  # Report system
│   ├── README.md             # How to generate reports
│   ├── templates/            # 6 templates (ADR, impact, quality, etc.)
│   └── scripts/md-to-pdf.sh  # Markdown → PDF converter
└── .opencode/agents/
    ├── architect.md          # High-level design agent
    ├── debugger.md           # Bug investigation agent
    └── reviewer.md           # Code review agent
```

## How It Works

### Tenets (Priority-Ordered)

When tenets conflict, the higher one wins:

| # | Tenet | Meaning |
|---|-------|---------|
| 1 | **Correctness** | Types, invariants, exhaustive tests |
| 2 | **Stability & resilience** | Graceful failure, guard rails everywhere |
| 3 | **Simplicity** | Solve the problem, not more |
| 4 | **Sensible abstractions** | YAGNI for abstractions too |
| 5 | **Testing & guard rails** | Tests are the spec |
| 6 | **System awareness** | No change is isolated |
| 7 | **Prove it** | Test-first for bugs, benchmark before/after for perf |

### Load Order

The AI reads files in this sequence, each building on the last:

1. `.opencode.md` / `AGENTS.md` — Tenets and global directives
2. `CLAUDE.md` — Claude-specific rules (if applicable)
3. `rules/conventions.md` — Universal coding conventions
4. `rules/architecture.md` — Architecture patterns
5. `rules/testing.md` — Testing requirements and commands
6. `rules/workflows.md` — Commit, branch, review workflow
7. `skills/*.md` — Language/framework patterns (loaded on demand)
8. `.opencode/agents/*.md` — Agent role definitions

### What the AI MUST Do

- Read `rules/` before writing any code
- Load the relevant `skill` before implementing
- Explore surrounding code before inventing new patterns
- Run `[lint] + [typecheck] + [test]` after every change
- Write the failing test first for bug fixes
- Benchmark before and after for optimisations

### What the AI MUST NOT Do

- Use `any`/`interface{}`/`Object`/`as` casts without justification
- Use bare `.unwrap()`/`except: pass` in production code
- Guess library versions or APIs (check codebase or ask)
- Commit code without being asked
- Waste tokens on introductions, emoji, or apologies

## Quick Reference (Commands)

| Language | Test | Lint | Typecheck | Format |
|----------|------|------|-----------|--------|
| Rust | `cargo test` | `cargo clippy` | `cargo check` | `cargo fmt` |
| TypeScript | `vitest`/`jest` | `eslint` | `tsc --noEmit` | `prettier` |
| Python | `pytest` | `ruff` | `mypy`/`pyright` | `ruff format` |
| Go | `go test` | `golangci-lint` | `go vet` | `gofmt` |
| C++ | `ctest`/`gtest` | `clang-tidy` | — | `clang-format` |
| C# | `dotnet test` | `dotnet format` | — | `dotnet format` |
| Java | `mvn test` | `checkstyle` | — | `spotless` |

## Customizing for Your Project

| What | How |
|------|-----|
| Language commands | Edit `rules/testing.md` — lint/typecheck/test commands |
| Architecture | Edit `rules/architecture.md` — layer boundaries |
| Error handling | Edit `rules/conventions.md` — per-language strategies |
| Stack-specific patterns | Keep only `skills/*.md` files for your stack |
| Agent behaviour | Edit `.opencode/agents/*.md` — scope and instructions |
| Report templates | Edit `reports/templates/*.md` — sections and prompts |
| Everything else | Every file is plain markdown. Change anything to match your taste. |

## Why Specificity Is the Art

A generic AI prompt like "write a function" produces generic code. A specific
one like "write a function using our conventions" produces code that fits.
The level of specificity you encode in these files is the single biggest
determinant of output quality.

### The Specificity Spectrum

```
Vague config → AI writes what it thinks is right → You fix it → Repeat
Exact config → AI writes what you want → You review → Ship
```

Every convention you encode — every naming rule, error pattern, test structure,
commit format — removes one decision the AI has to guess. Each guess it gets
wrong costs you a review cycle, a fix commit, or a production bug.

### For a Solo Engineer

You encode *your* preferences once. Every future session inherits them. Over
time, the guide becomes a living record of your engineering taste — what you
value, how you structure code, what you consider "done."

Start small: add your lint commands, your error handling pattern, your commit
format. Use the guide for one week, then add what annoyed you most. Repeat.
Each iteration pays back more than the last.

### For a Team

The guide becomes the shared source of truth that survives Slack messages,
outdated wikis, and onboarding docs. When a new engineer joins, they clone the
guide and the AI teaches them the team's conventions by *enforcing* them — not
by documenting them in a document nobody reads.

Specificity at team level means:
- **Consistent code review**: The AI's reviewer agent checks against the same
  rules every human reviewer uses. No more "you missed the convention" comments.
- **Faster onboarding**: New hires produce idiomatic team code on day one, not
  month six. The AI enforces team conventions automatically.
- **Collective improvement**: When the team agrees on a better convention, one
  file change updates everyone. No more "I didn't get the memo" commits.

### For a Company

At scale, specificity prevents fragmentation across dozens of repos and teams.
A shared company-level guide (forked and customised per team) ensures that:

- Security conventions are enforced everywhere, not just in audited repos
- Error handling patterns are consistent across microservices
- Logging and observability standards are built-in, not retrofit
- Cross-team engineers can read any repo and recognise the patterns

The guide becomes the company's collective engineering knowledge, encoded in
a form that both humans and AI can use. It's the difference between hoping
everyone follows "best practices" and knowing they do.

### Practical Advice

Start with the defaults in this guide. Use them for a week. Then ask:

- *What did the AI get wrong that I had to fix?* → Add a convention for it.
- *What did I have to explain more than once?* → Add it to a skill or rule.
- *What annoyed me?* → Fix it in the config.

The guide should hurt less every week. If it doesn't, you're not customising
enough. Specificity compounds — every convention you add makes the next one
easier to enforce, because the AI already respects the ones before it.

## Why This Exists

**Without this guide**: Every AI session starts from zero. The AI guesses your
preferences, invents patterns, wastes tokens on fluff, and makes the same
mistakes repeatedly. You prompt constantly to correct it.

**With this guide**: The AI loads your conventions automatically. It knows your
priority order (correctness over simplicity), your error handling patterns
(Result types, not exceptions), your testing requirements (80% coverage,
table-driven), and your workflow (test-first, verify after every step). You
describe *what* to build, the AI handles *how* — correctly, first time.

## License

Use freely. Clone into any project. Do not push to project remotes.
# OpenAtlas

OpenAtlas is a real-time global data intelligence system built as a
**unified reactive world-state engine** on [SpacetimeDB]. It ingests
open-data feeds (seismic, climate, finance, aviation, conflict, energy,
…), folds them into a deterministic causal graph inside a SpacetimeDB
module, and streams live projections to a Svelte dashboard and a terminal
CLI.

SpacetimeDB is the single source of truth. Every producer writes through
a reducer; every consumer subscribes to rows. There is no separate
database, cache, message bus, or REST read surface.

[SpacetimeDB]: https://spacetimedb.com

## Architecture at a Glance

```
┌──────────────────┐   reducer calls (HTTP)      ┌──────────────────────┐
│ openatlas-ingest ├────────────────────────────►│ SpacetimeDB module   │
│ (feeds + sim)    │                             │ openatlas-stdb-module│
└──────────────────┘                             │                      │
                                                 │  tables + reducers   │
┌──────────────────┐   stdb SQL (HTTP)           │  (authoritative)     │
│ openatlas-cli    ├────────────────────────────►│                      │
│ (terminal)       │                             │                      │
└──────────────────┘                             │                      │
                                                 │                      │
┌──────────────────┐   stdb SDK (WebSocket)      │                      │
│ Svelte dashboard ├────────────────────────────►│                      │
│ (web/)           │   live row subscriptions    └──────────────────────┘
└──────────────────┘
```

- **`openatlas-stdb-module`** — SpacetimeDB module that owns the schema
  (`event`, `signal`, `causal_edge`, `world_state`, `domain_insight`, …)
  and every state transition (`ingest_event`, `link_causal_events`).
- **`openatlas-ingest`** — stateless pusher. Supervises feed adapters
  and the simulator, normalises them into `WorldEvent`s, and calls
  reducers over HTTP. Also exposes `/health`, `/ready`, `/status` for
  operational visibility.
- **`openatlas-cli`** — small Clap-based tool that queries SpacetimeDB
  directly via its HTTP SQL endpoint.
- **`web/`** — Svelte 5 + Vite dashboard using the SpacetimeDB
  TypeScript SDK over WebSocket. Renders a global MapLibre map, ECharts
  panels (causal force graph, severity heatmap), and live event lists.
- **`openatlas-core`** — pure Rust DTOs (`Domain`, `WorldEvent`,
  `Signal`, …) shared between the ingest service and the module at the
  wire boundary.

## Quick Start with `dev.sh` / `make`

`dev.sh` (and the thin `Makefile`) orchestrate build, run, verify, and tear-down.
Use [charmbracelet/gum](https://github.com/charmbracelet/gum) for a nicer menu, or
run commands directly / via `make`.

```bash
# Daily workflow (two terminals, or one with `run`)
make up              # SpacetimeDB + hybrid ingest + LLM bridge
make web             # Vite UI → http://localhost:5173
make down            # stop ingest, LLM, SpacetimeDB

# Same via dev.sh
./dev.sh up          # default: hybrid (live APIs + simulators for all domains)
./dev.sh web
./dev.sh down

# One terminal: backend + UI (Ctrl+C stops Vite only)
make run             # or  ./dev.sh run

# Fast restart (skip wasm/web rebuild)
./dev.sh up:fast

# Test & verify
make test            # fmt + clippy + unit tests
make verify          # test + subscription SQL + runtime health (if stack up)
make verify-full     # + prove-live (+ prove-llm when bridge/Ollama up)

Principal-engineering review notes: [docs/REVIEW_REPORT.md](docs/REVIEW_REPORT.md)

# Ingest modes
./dev.sh up:sim      # simulators only
./dev.sh up:live     # live public APIs only
./dev.sh web:demo    # UI only, no SpacetimeDB

./dev.sh help        # full command list
```

Local config and API keys stay **out of git**. Run `./scripts/init-local-config.sh`
(or `./dev.sh init-config`) and see **[docs/CONFIG.md](docs/CONFIG.md)** for
`.env`, `.dev/local.env`, `.dev/feed-secrets.json`, and `web/.env`.

Ingest PID and logs live under `.dev/server.{pid,log}`; SpacetimeDB
state lives under `.dev/spacetime-data/` with logs in
`.dev/spacetime.log`.

### Prerequisites

- Rust toolchain (stable) with `cargo`.
- [SpacetimeDB CLI](https://spacetimedb.com/install) 2.1+.
- [Bun](https://bun.sh) for the Svelte frontend (`bun`, not `npm`).
- `curl`, plus `jq` for prettier status output.
- `gum` (optional) for the nicest interactive menu.

## Manual Quick Start

```bash
# 1. Start SpacetimeDB and publish the module.
spacetime start --listen-addr 127.0.0.1:3000 &
spacetime publish --server http://127.0.0.1:3000 \
  --module-path crates/openatlas-stdb-module --yes openatlas

# 2. Run the ingest service (simulated feeds by default).
OPENATLAS_INGEST_MODE=sim cargo run -p openatlas-ingest

# 3. Run the Svelte dev server.
cd web && bun install && bun run dev
# → http://localhost:5173
```

`./dev.sh up` (hybrid/live) and `./dev.sh start` already set `OPENATLAS_ENABLE_LIVE_FEEDS=1`
and start **`openatlas-llm-bridge`** (unless `OPENATLAS_START_LLM=0`). The bridge
listens on `127.0.0.1:3847` and forwards to Ollama; the Vite dev server proxies
`/api/llm` there (see `web/vite.config.ts`).

**Ollama (required for hub “AI analysis”):** install Ollama, then run
`ollama serve`, pull a model, e.g. `ollama pull llama3.2`, and keep it running.
If the bridge starts before Ollama, you still get ingest and the UI, but
`GET :3847/v1/ready` fails until Ollama is up.

For the Svelte app with the proxy, use **`./dev.sh web`** (same as
`dev:frontend`, or `cd web && bun run dev`) on port **5173** while the stack
from `./dev.sh` is running. **`./dev.sh up`** does not start Vite by default; use
**`./dev.sh web`** or **`make run`** for the dev UI (or serve `web/dist` via ingest on :8080).

For ad-hoc bridge only: `cargo run -p openatlas-llm-bridge` (same env vars as
`crates/openatlas-llm-bridge` / `./dev.sh llm:start`).

Set `OPENATLAS_ENABLE_LIVE_FEEDS=1` manually if you are not using `./dev.sh`
and want the supervised live-feed adapters listed below.

## Live Open-Data Feeds

Every feed is a self-contained plug-in. Supervision, backoff, dormancy,
and `/status` seeding are all driven by `feeds::REGISTRY`.

| Feed              | Domain         | Auth required    | Default poll |
| ----------------- | -------------- | ---------------- | ------------ |
| USGS Earthquake   | `seismic`      | none             | 45 s         |
| Open-Meteo        | `climate`      | none             | 60 s         |
| CoinGecko         | `finance`      | none             | 60 s         |
| NASA EONET        | `seismic` / `climate` / `geospatial` / `geopolitics` | none | 180 s |
| OpenSky Network   | `transport`    | none             | 90 s         |
| GDELT 2.0         | `geopolitics`  | none             | 180 s        |
| World Bank        | `economy`      | none             | 3600 s       |
| FRED (St. Louis)  | `finance`      | `FRED_API_KEY`   | 600 s        |
| EIA               | `energy`       | `EIA_API_KEY`    | 900 s        |

Outbound calls are rate-limited per provider and per API host; Settings **Test** has a
30s cooldown per feed. See [docs/RATE_LIMITS.md](docs/RATE_LIMITS.md).

Data path: APIs → ingest → SpacetimeDB → WebSocket subscriptions → bounded UI cache.
See [docs/DATA_PLANE.md](docs/DATA_PLANE.md).

Feeds that require a secret stay dormant until `FRED_API_KEY` / `EIA_API_KEY`
are set in **`.dev/feed-secrets.json`** (gitignored) or via **Settings → API keys**.
See [docs/CONFIG.md](docs/CONFIG.md). Live adapters require `hybrid` or `live`
(default for `./dev.sh up`).

Deploying to SpacetimeDB Cloud or a single host: see [docs/DEPLOY.md](docs/DEPLOY.md).

## CLI

The CLI talks to SpacetimeDB over its HTTP SQL endpoint. Point it at
the live database (defaults shown):

```bash
export OPENATLAS_STDB_URI=http://127.0.0.1:3000
export OPENATLAS_STDB_DB=openatlas

cargo run -p openatlas-cli -- view events --limit 15
cargo run -p openatlas-cli -- view events --watch --domain seismic
cargo run -p openatlas-cli -- state --domain energy
cargo run -p openatlas-cli -- anomalies --domain finance --limit 30
cargo run -p openatlas-cli -- trace <event_id>   # event_id is a u64
```

> SpacetimeDB 2.1 SQL does not yet support `ORDER BY` or aggregates.
> The CLI therefore pulls the bounded table once (events / signals are
> capped by the module's ring buffer) and sorts newest-first locally.

## SpacetimeDB Schema (authoritative)

All tables live in [`crates/openatlas-stdb-module/src/lib.rs`](crates/openatlas-stdb-module/src/lib.rs):

| Table            | Purpose                                             |
| ---------------- | --------------------------------------------------- |
| `event`          | Immutable `WorldEvent` facts. Capped at 50 000 rows. |
| `signal`         | Anomaly signals emitted by inference. Ring of 10 000. |
| `causal_edge`    | Directed influence between two events. Ring of 10 000. |
| `world_state`    | Per-domain aggregate (event count, avg severity, risk). |
| `domain_insight` | Narrative summary per domain, with source URL.      |
| `ordinal_counter`| Monotonic sequencer for `event.ordinal` (private).  |

Writes go through reducers only:

- `ingest_event(id, timestamp, domain, severity, location, payload, source_label, source_url)`
- `link_causal_events(source_id, target_id, influence_score, decay_rate)`
- `init()` (seeds `ordinal_counter`)

All reducers are deterministic: they take an explicit `timestamp`, clamp
severity to `[0.0, 1.0]`, and prune their ring tables in the same
transaction.

## Configuration

| Env var                      | Default                 | Purpose                                     |
| ---------------------------- | ----------------------- | ------------------------------------------- |
| `OPENATLAS_STDB_URI`         | `http://127.0.0.1:3000` | SpacetimeDB HTTP endpoint (ingest + CLI)    |
| `OPENATLAS_STDB_DB`          | `openatlas`             | Database/module name                        |
| `OPENATLAS_INGEST_MODE`      | `sim` (or `live` via `./dev.sh start`) | `sim` · `live` · `static` — how ingest sources events |
| `OPENATLAS_ENABLE_LIVE_FEEDS`| unset                   | Legacy: `1` implies `live` when ingest mode is unset |
| `OPENATLAS_API_KEY`          | unset                   | Reject `/status`-adjacent admin writes unless `x-openatlas-key` matches |
| `FRED_API_KEY`, `EIA_API_KEY`| unset (or `.dev/feed-secrets.json`) | FRED / EIA feeds; see Settings or `docs/feed-secrets.example.json` |
| `OPENATLAS_FEED_SECRETS`     | `.dev/feed-secrets.json`| Alternate path for persisted feed API keys  |
| `VITE_STDB_URI`, `VITE_STDB_DB` | same as above        | Used by the Svelte dashboard at build time  |
| `VITE_LLM_BASE`            | unset (`/api/llm` in Vite) | Public URL of the LLM bridge for production |
| `OPENATLAS_OLLAMA_BASE`    | `http://127.0.0.1:11434` | Ollama HTTP API (bridge → model)         |
| `OPENATLAS_OLLAMA_MODEL`   | `llama3.2`             | Model name after `ollama pull`              |
| `OPENATLAS_LLM_LISTEN`     | `127.0.0.1:3847`      | LLM bridge bind (match Vite proxy)         |
| `OPENATLAS_START_LLM`      | `1`                    | `0` skips auto-starting the bridge in `./dev.sh` |

## Example Event (wire shape)

```json
{
  "domain": "energy",
  "severity_score": 0.72,
  "location": { "lat": 40.7, "lon": -74.0, "region_tags": ["north-america"] },
  "payload": { "grid_load_pct": 93.2, "source": "mock-feed" }
}
```

## Roadmap

- Replay harness that feeds a recorded reducer log into a fresh
  SpacetimeDB instance and asserts byte-identical state.
- Benchmark harness targeting 10 000+ events/sec through the reducer.
- Native reducer subscriptions in the CLI (SDK) to replace polling.
- Additional feeds: OSM Overpass, Our World in Data, NASA EONET
  polygons.
