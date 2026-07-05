# YAML Skill

Loaded when the project uses YAML for configuration (CI, Docker Compose,
Kubernetes, application config). Supplements `rules/conventions.md` with
YAML-specific patterns.

---

## Conventions

- **2-space indentation**. No tabs — YAML forbids them. Configure your
  editor to insert spaces when pressing Tab.
- **`---` document separator** at the start of top-level YAML files (CI
  configs, compose files, k8s manifests). Not required for simple configs.
- **No trailing whitespace**. Configure your editor to trim on save.
- **Quotes**: Double-quote strings that contain special characters (`:`,
  `#`, `{`, `}`, `[`, `]`, `,`, `&`, `*`, `?`, `|`, `-`, `<`, `>`, `=`,
  `!`, `%`, `@`, `` ` ``). Unquoted is preferred for simple strings:

  ```yaml
  # Good
  name: Alice
  description: "Value: $100"    # colon needs quoting
  path: "/var/log/app/${ENV}"  # template needs quoting

  # Bad
  description: Value: $100      # parser error on colon
  ```

- **Booleans**: Use `true`/`false`, `yes`/`no`, `on`/`off` all work but
  are inconsistent. Prefer `true`/`false` everywhere.

  ```yaml
  # Good
  enabled: true

  # Risky
  enabled: yes
  ```

- **Numbers**: Unquoted. Use `_` for readability in large numbers:
  `max_connections: 10_000`.
- **Multiline strings**:

  ```yaml
  # Literal block (preserves newlines)
  script: |
    echo hello
    echo world

  # Folded block (wraps long lines)
  description: >
    This is a long description that will be
    folded into a single line.
  ```

- **Anchors & aliases** for DRY config:

  ```yaml
  # Good — reuse defaults
  x-defaults: &defaults
    restart: unless-stopped
    logging:
      driver: json-file

  services:
    app:
      <<: *defaults
      image: myapp

    worker:
      <<: *defaults
      image: myworker
  ```

- **No duplicate keys**: YAML merges duplicate keys (last wins), which is
  almost always a mistake. Use linting to catch them.
- **Lint**: `yamllint` for syntax checking. Config file `.yamllint.yml`:

  ```yaml
  extends: default
  rules:
    line-length: disable
    document-start: disable
  ```

- **Schema validation**: For application config YAML, define a schema
  (JSON Schema or language-specific validator) and validate at startup.
  A YAML parse error that silently uses defaults is a bug.
- **No `null` vs `~`**: Both represent null. Pick `null` and be
  consistent.
- **Comments**: `#` at the start of the line. YAML has no inline
  comments. Use sparingly — the structure should be self-documenting.
