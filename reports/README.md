# Reports

A system for generating structured markdown reports that can be reviewed as-is
or converted to PDF. These reports serve as project documentation, analysis
artifacts, and decision records that both humans and AI can consume.

## Report Types

| Template | When to Use |
|----------|-------------|
| `templates/project-analysis.md` | First encounter with an existing codebase |
| `templates/architecture-decision.md` | Recording an architectural decision (ADR) |
| `templates/technical-spec.md` | Specifying a greenfield feature or system |
| `templates/change-impact.md` | Before making a significant change |
| `templates/code-quality.md` | Assessing code quality (periodic or per-module) |
| `templates/post-mortem.md` | After an incident or bug |

## Workflow

1. **Choose a template** from `templates/` based on what you need.
2. **Copy it** to `reports/` with a descriptive filename
   (e.g., `reports/2026-07-05-auth-module-analysis.md`).
3. **Fill the sections** — I will populate them based on project exploration,
   code analysis, or user input.
4. **Review** — Read the report, add corrections, extend sections.
5. **Convert to PDF** (optional) using the script:
   ```bash
   ./reports/scripts/md-to-pdf.sh reports/my-report.md
   ```

## Conversion

The `md-to-pdf.sh` script converts markdown to PDF using one of these engines
(in order of preference):

- **pandoc** + weasyprint (recommended) — best output quality
- **md-to-pdf** (npm) — simpler, good for basic reports
- **grip** + browser print — zero-install fallback

See `scripts/md-to-pdf.sh --help` for details.

## Convention

- Reports live in `reports/` at the project root.
- Filename format: `YYYY-MM-DD-short-descriptive-name.md`.
- Keep reports factual and concise. Use tables, diagrams (mermaid), and code
  snippets where they add clarity.
- Every report should answer: *What was the context? What did we decide/observe?
  What action is needed?*
