# Reporting Skill

Load when the task involves analysing a codebase, documenting an
architecture decision, writing a spec, or investigating an incident.
See `reports/README.md` for the template list and basic workflow.

---

## Quality Standards for Reports

- **Be factual**. Every claim should be backed by code evidence, test results,
  or measurements. If something is an opinion, label it as such.
- **Be precise**. Use specific file paths and line numbers when referencing
  code. Use quantitative metrics when possible.
- **Be actionable**. Every report should end with a prioritised list of
  concrete next steps.
- **Be concise**. Prefer tables, lists, and diagrams over paragraphs.
- **No fluff**. No introductions, no summaries of what the report will cover.
  Get straight to the findings.

## Analysis Techniques

### Codebase Exploration
1. Read `README.md`, `CONTRIBUTING.md`, and any `rules/` directory first.
2. Examine the project's dependency manifest (Cargo.toml, package.json,
   go.mod, requirements.txt) for tech stack clues.
3. Walk the directory tree — understand the module structure.
4. Read representative files from each module (entry point, core model,
   error types, test file).
5. Run linter and type checker — note the current state.

### Change Impact
1. Identify all call sites of the modified function/module.
2. Check for implicit contracts (expected invariants, pre/post conditions).
3. Run the full test suite before and after.
4. For performance-sensitive changes: benchmark before and after.
