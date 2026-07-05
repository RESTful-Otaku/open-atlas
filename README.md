# opencode-guide

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
