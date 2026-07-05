# Development Workflows

How work should be planned, executed, verified, and reviewed.

---

## 1. Task Lifecycle

```
Plan → Explore → Implement → Verify → Review → Merge
```

### 1.1 Plan
- For any task with 3+ steps, create a `todowrite` list before starting.
- Break large features into small, vertical slices (end-to-end but narrow).
- Each slice should be completable in a single focused session.
- Identify the files you'll need to change and the patterns you'll follow.
- **Consider system impact** — Before designing a solution, ask: What modules
  does this touch? What implicit contracts exist? Could this make a future
  refactor more likely or more costly? If the change is high-risk, produce a
  `change-impact.md` report first (see `reports/templates/`).

### 1.2 Explore
- Read the relevant existing code before writing new code.
- Understand the imports, types, and conventions used in neighbouring files.
- Check if a similar pattern already exists before inventing a new one.

### 1.3 Implement
One logical step at a time. After each step:

1. Run lint
2. Run type check
3. Run tests
4. Mark the todo `completed` (or reconsider)

### 1.4 Verify
- **Tests prove the code works**. If the change is untestable, the design is
  wrong. Redesign until it is testable.
- **Bug fixes**: First write a test that reproduces the bug. Confirm it fails.
  Then apply the fix. Confirm the test passes. This is not optional.
- **Optimizations**: Benchmark before and after. Report both values and the
  environment (CPU, RAM, OS). If the improvement is marginal (< 5%), flag it
  and let the user decide.
- **Refactors**: The full test suite must pass at every intermediate commit.
  If a refactor touches public interfaces, verify callers still compile.
- **Every claim must be evidenced**. "This is faster" → where are the numbers?
  "This is safer" → where is the proof? Claims without evidence are rejected.

### 1.5 Review
Before submitting for review:
- Re-read your diff as if you were a reviewer.
- Does each change make sense independently?
- Are there any dead code paths, unused variables, or missing edge cases?

### 1.6 Merge
- Squash-merge or rebase-merge. No merge commits on main.
- Commit message format:
  ```
  type(scope): brief description

  Optional body with motivation and context.
  ```

---

## 2. Commit Conventions

Format:
```
type(scope): description
```

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes nor adds |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests |
| `docs` | Documentation only |
| `style` | Formatting, lint fixes (no logic change) |
| `chore` | Build, CI, dependencies, tooling |
| `ci` | CI/CD configuration changes |

**Scope** is the module or area (e.g., `auth`, `parser`, `ui`, `db`). Omit if
the change is project-wide.

**Keep commits small** — each commit should be a single atomic change. If you
need "and" in the description, split it.

### Revert Commits

```
revert(<scope>): <description>
```

A revert is a normal commit with the `revert` type. The body must reference
the original commit SHA and explain *why* the revert is necessary (bug,
regression, change of requirements). This preserves bisect-ability.

```
revert(auth): remove refresh token rotation

This reverts commit abc1234. The token rotation introduced a race
condition on token refresh under concurrent requests. Will re-land
after fixing the synchronization issue.
```

### Cherry-Pick

When cherry-picking commits across branches, prefer entire atomic commits.
Do not cherry-pick partial changes from within a larger commit. If you
need only part of a commit, split it first via interactive rebase, then
cherry-pick the split result.

```
good: feat(auth): add refresh token rotation
good: fix(parser): handle empty input edge case
good: refactor(db): extract connection pooling into separate module

bad:  feat: add auth and refactor db and fix some bugs
bad:  wip
bad:  fix stuff
bad:  update
```

---

## 3. Branching

- **`main`** — always deployable. Protected. No direct pushes.
- **`feat/<name>`** — one feature branch per feature.
- **`fix/<name>`** — bug fixes.
- **`chore/<name>`** — tooling, CI, refactoring.

Rebase feature branches onto main before review. Avoid long-lived branches
(more than a few days).

---

## 4. Dependency Management

- **Add dependencies deliberately**. Every new dependency is a contract with
  another project. Before adding, ask: Do we need this? Could we write it
  ourselves in < 1 day? Is the dependency maintained and stable?
- **Pin versions**. Use lockfiles (Cargo.lock, package-lock.json, go.sum).
  Do not use version ranges (`^`, `~`) for application code — pin exact
  versions. Libraries may use ranges.
- **Update responsibly**. Renovate or Dependabot for automated updates.
  Review changelogs before merging. Run full test suite after every update.
- **Remove unused dependencies**. Periodically audit. A dependency not
  imported anywhere is dead weight (security surface, compile time, bundle
  size).
- **Minimize dependency count**. Every 10 dependencies doubles the chance of
  a supply-chain issue. Prefer stdlib > smaller dedicated libs > frameworks.
- **Vulnerability scanning**. Run `cargo audit`, `npm audit`, `govulncheck`,
  `pip-audit`, or `trivy` in CI.

## 5. Code Review Checklist

### Correctness (`→ Tenet 1`)
- [ ] Does the code do what it says?
- [ ] Are all error paths handled?
- [ ] Are edge cases (empty, nil, overflow, race) covered?
- [ ] Are there tests for the above?

### Stability & Resilience (`→ Tenet 2`)
- [ ] Are there timeouts / circuit breakers for external calls?
- [ ] Is non-deterministic behaviour isolated and documented?
- [ ] Does the code degrade gracefully when dependencies fail?
- [ ] Are resources (memory, connections) bounded?

### Design (`→ Tenets 3, 4, 6`)
- [ ] Does the change fit the existing architecture?
- [ ] Are module boundaries respected?
- [ ] Any circular dependencies?
- [ ] Could this be simpler? Is every abstraction justified?
- [ ] What future refactor cost does this introduce?

### Style
- [ ] Matches `rules/conventions.md`?
- [ ] Function signatures readable? Names descriptive?

### Safety
- [ ] Secrets/config properly handled?
- [ ] Inputs validated at boundaries?
- [ ] Any `unsafe` / `any` / `#![allow]` needing justification?

---

## 6. When to Ask vs. When to Decide

| Situation | Action |
|-----------|--------|
| The requirement is ambiguous | List 2-3 interpretations + recommended approach, ask |
| Two libraries do the same thing | Recommend the one already in the project |
| The project has no established pattern | Propose one, explain why, implement it cleanly |
| A choice has no clear winner | Make a decision, note the trade-off in the commit |
| You spot a pre-existing issue | Fix it if it's in scope, file an issue otherwise |

---

## 7. Managing Context

- **One thing at a time**. Do not open 5 files and edit them all — finish one
  thing, commit, move on.
- **If you get stuck** (30+ min on the same problem), stop and describe the
  problem to the user. Fresh eyes help.
- **Use `todowrite` for the session** so the user can see progress and
  course-correct.
- **At natural pausing points** (end of a feature, after a refactor), ask if
  the direction is still correct.

---

## 8. Reporting

When the task involves analysis, planning, or risk assessment, produce a
structured report using `reports/templates/`. This applies to:

- **First encounter with a codebase** → `project-analysis.md`
- **Architecture decision** → `architecture-decision.md`
- **New feature specification** → `technical-spec.md`
- **Significant change** → `change-impact.md`
- **Code quality assessment** → `code-quality.md`
- **Incident investigation** → `post-mortem.md`

Reports serve as project memory. They help maintain context across sessions
and provide a reference for future decisions. Archive them in `reports/` with
a dated filename.

## 9. Quality Automation

Every project should have, at minimum:

```
make lint       # run all linters
make typecheck  # run all type checkers  
make test       # run all tests
make check      # lint + typecheck + test (for CI)
make bench      # run benchmarks
```

If `make` is not available, document the exact commands in `testing.md` or
the project's README.

---

*Copy into any project. Adjust branching strategy and CI commands to match
the hosting platform.*
