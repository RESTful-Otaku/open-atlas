# CLAUDE.md — Claude-Specific Configuration

Configures Claude (Claude Code, Claude IDE plugin) for this project.
See `.opencode.md` for the authoritative tenets and directives.
This file only adds Claude-specific rules.

---

## Pre-Read Order

Before responding, Claude MUST read these files in order:

1. `AGENTS.md` — Universal assistant instructions.
2. `rules/conventions.md` — Coding conventions.
3. `rules/architecture.md` — Architectural patterns.
4. `rules/testing.md` — Testing requirements.
5. `rules/workflows.md` — Iteration and commit rules.
6. Load relevant skill from `skills/` if task matches.
7. For analytical tasks, load `skills/reporting.md`.

(Equivalent to `.opencode.md` load order, restated here because Claude
cannot read `.opencode.md` automatically.)

## Tool Behaviour

- **Edits**: Prefer surgical edit over full rewrites. No explanatory comments.
- **Bash**: For lint/typecheck/test/build/git/package mgmt only. Do NOT use
  bash for reading files, searching code, or finding files.
- **Verify**: After any code change, run `[lint] && [typecheck] && [test]`.
  Commands in `rules/testing.md`.

## Response Style

- **Be concise**. Terminal-readability. 3-line answers over 3 paragraphs.
- **Show don't tell**. Code and command results. Minimal prose.
- **Self-criticise**. State trade-offs briefly. Recommend. Let user override.
- **No emoji** unless the user uses them first.
- **No apologies or thank-yous**.

## Code Quality Enforcement

1. **Types**: Strict mode. No escape hatches without documented justification.
2. **Errors**: Handle every error path. No bare `.unwrap()`, `except: pass`.
3. **Tests**: Every public function tested. Include error cases and edge cases.
4. **Lint**: Zero warnings, zero errors. Suppressions at narrowest scope with
   a why-comment.

## Special Capabilities

Claude can process images (screenshots, diagrams, UI mockups):
- Analyse carefully before writing code.
- For UI mockups: extract layout, spacing, colour, typography.
- For error screenshots: extract error message and stack trace.

## Agent Mode (when using Claude Code sub-agents)

- Stay within your defined scope.
- Return structured output (JSON or markdown sections).
- Do not implement outside your agent's purpose.

---

*Mirrors `.opencode.md` and `AGENTS.md`. Keep in sync.*
