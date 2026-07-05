# AGENTS.md — Universal AI Coding Assistant Instructions

Guidance for *any* AI assistant (opencode, Claude, Cursor, Copilot) working
on this project. See `.opencode.md` for definitive tenets and directives.

---

## 1. Project Philosophy

- **Correctness over speed**. Types, invariants, tests make correctness obvious.
- **Small, reviewable changes**. One thing per commit. 5 small PRs > 1 large.
- **Explicit over implicit**. Clear names. No magic. Flat over nested.
- **Consistency is king**. Match existing codebase style, not personal preference.

## 2. Before You Write Code

1. **Read rules/** — `rules/conventions.md`, `rules/architecture.md`,
   `rules/testing.md`, `rules/workflows.md`.
2. **Load relevant skills** — Check `skills/` for language/framework patterns.
   Load via skill tool before implementing.
3. **Explore first** — Read surrounding code. Check imports, types, patterns.
   Don't invent a new pattern if one already exists.
4. **Ask if uncertain** — Ambiguous requirement? Propose 2-3 options with a
   recommendation. Let the user decide.

## 3. Quick Reference

Full details in `rules/`.

| Area | Rule |
|------|------|
| Naming | Language-idiomatic (snake_case, camelCase). Descriptive but concise. |
| Imports | std → third-party → local. No unused/wildcard imports. |
| Error handling | Explicit. Custom types. No bare unwrap/except. |
| Types | Precise. No `any`/`interface{}`/`Object`. Newtypes, branded types. |
| Functions | < 30 lines, single-responsibility, pure where possible. |
| Comments | Only *why*. Never *what* or *how*. |
| Formatting | Standard formatter per language. No debates. |
| Errors by layer | Domain → Application → Interface → Infrastructure |
| Test pyramid | 80% unit, 15% integration, 5% E2E |
| Commits | `type(scope): description` — atomic, one thing per commit |
| Planning | Todo for 3+ steps. System impact check first. |
| Proof | Bug: test first. Optimisation: benchmark before/after. |

## 4. Communication Style

- **Be concise**. Terminal-readable. 3-line answers over 3 paragraphs.
- **Show don't tell**. Output code and command results. Minimal prose.
- **Present trade-offs**. Recommend one path. Explain why.
- **Find → fix**, don't just report. If you spot a problem, suggest a solution.
- **No fluff**. No introductions, summaries, apologies, emoji, or thank-yous.

## 5. Reporting

Use `reports/` for structured analysis, planning, and decision records.
Load `skills/reporting.md` for the full workflow.

| Scenario | Template | Produces |
|----------|----------|----------|
| First encounter with codebase | `project-analysis.md` | Module map, quality signals, risks |
| Architecture decision | `architecture-decision.md` | ADR with context, options, decision |
| Greenfield feature | `technical-spec.md` | Requirements, design, implementation plan |
| Before a risky change | `change-impact.md` | Affected modules, regression vectors, rollback |
| Periodic quality check | `code-quality.md` | Metrics, issues, tech debt estimate |
| Incident investigation | `post-mortem.md` | Timeline, root cause, action items |

Reports are markdown. Convert to PDF via `./reports/scripts/md-to-pdf.sh <report.md>`.

## 6. Language/Tool Quick Reference

See `skills/` for detailed skill files covering all languages, frameworks,
databases, and infrastructure tools used in this project.

| Category | Testing | Linting | Formatting |
|----------|---------|---------|------------|
| Rust | `cargo test` | `cargo clippy` | `cargo fmt` |
| TypeScript | Vitest/Jest | ESLint | Prettier |
| Python | pytest | ruff | ruff format |
| Go | `go test` | `golangci-lint` | `gofmt` |
| C/C++ | CTest/GoogleTest | clang-tidy | clang-format |
| C# | xUnit/NUnit | dotnet format/Roslyn | dotnet format |
| Java | JUnit | Checkstyle | spotless |

## 7. Error Handling by Language

| Language | Strategy |
|----------|----------|
| Rust | `Result<T, E>` with custom error enums. `thiserror`/`anyhow`. |
| TypeScript | Tagged unions for states. `Result<T, E>` from neverthrow or custom. |
| Python | Custom exception hierarchy. Early returns over deep else chains. |
| Go | `error` interface with sentinel errors. `errors.Is()`/`errors.As()`. |
| C++ | `std::expected` (C++23) or `tl::expected`. Exceptions for exceptional paths only. |
| C# | Custom exception types. `Result<T>` pattern for expected failures. |
| Java | Custom checked exceptions for recoverable errors. `Optional` for nullable returns. |

---

*Copy into any project root. Add/remove language rows to match your actual stack.*
