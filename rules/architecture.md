# Architecture Guidelines

High-level patterns for structuring software. These are universal —
apply them regardless of language or framework.

---

## 1. Layered Architecture

Structure the codebase into horizontal layers with strict dependency direction.
Inner layers must not know about outer layers.

```
┌─────────────────────────────┐
│         Interface           │  ← HTTP handlers, CLI, GUI, API boundaries
│   (entry points, ports)     │
├─────────────────────────────┤
│         Application         │  ← Use cases, orchestration, workflow logic
│   (services, controllers)   │
├─────────────────────────────┤
│         Domain              │  ← Core business logic, entities, rules
│   (models, aggregates)      │
├─────────────────────────────┤
│      Infrastructure         │  ← DB, network, file system, external APIs
│    (repositories, clients)  │
└─────────────────────────────┘
```

**Rules**:
- Domain has zero dependencies on frameworks, databases, or external services.
- Application depends on Domain, not on Infrastructure.
- Infrastructure implements interfaces defined by Domain or Application
  (dependency inversion).
- Interface depends on Application to wire up use cases.

### Use Case: Hexagonal / Ports & Adapters

For larger or long-lived projects, prefer a hexagonal (ports-and-adapters)
layout:

```
domain/
  ports/       ← interfaces (contracts) that the domain needs
  models/
  services/

application/
  use_cases/   ← one file per use case

infrastructure/
  persistence/ ← adapters implementing domain ports
  http/        ← HTTP clients for external APIs

interface/
  api/         ← REST / GraphQL handlers
  cli/         ← command-line entry points
  events/      ← message consumers / producers
```

---

## 2. Module Boundaries

- **Cohesion over coupling**. Modules should contain things that change together.
  If two things are always changed or understood together, they belong in the
  same module.
- **Stable dependencies**. Modules that change rarely (domain models, utility
  libraries) should be depended upon by modules that change frequently
  (UI, API handlers), not the other way around.
- **No circular dependencies**. If module A depends on B and B depends on A,
  they are one module, or need an abstraction between them.

---

## 3. Error Architecture

| Layer | Error Strategy |
|-------|---------------|
| Domain | Rich domain errors (enums / tagged unions): `UserNotFound`, `InsufficientFunds` |
| Application | Wraps domain errors, adds context. Maps to external error types if needed. |
| Interface | Maps application errors to protocol errors (HTTP status codes, error codes, etc.). |
| Infrastructure | Translates external errors (DB, network) into domain errors **at the boundary**. |

**Never leak infrastructure errors** into domain or application layers.
An SQL error is not a domain concept.

```
// Good — infrastructure translates at the boundary
impl UserRepository for PostgresUserRepo {
    async fn find_by_id(&self, id: UserId) -> Result<User, DomainError> {
        self.pool
            .query_one("SELECT * FROM users WHERE id = $1", &[&id])
            .await
            .map(|row| row.into())
            .map_err(|e| match e {
                PgRowNotFound => DomainError::UserNotFound(id),
                _ => DomainError::Internal(e.to_string()),
            })
    }
}
```

---

## 4. Configuration & Secrets

- **Configuration** is read at startup from env vars, config files, or a
  config service. Never hardcode environment-specific values.
- **Secrets** (API keys, passwords, tokens) are never committed. Use env vars,
  secret managers, or encrypted vaults.
- **Type-safe config**. Parse config into a typed struct/class, not a raw map.

```typescript
// Good
const config = {
  port: parseInt(env.PORT ?? '3000', 10),
  db: { url: env.DATABASE_URL },
  logLevel: env.LOG_LEVEL ?? 'info',
} as const;
```

---

## 5. Testing Architecture

- **Unit tests** — Domain & Application layers. Fast, no I/O. Mock/stub
  infrastructure at domain boundaries.
- **Integration tests** — Infrastructure + Domain together. Use real DB
  (test containers or in-memory alternative).
- **E2E tests** — Full system. Sparse. Cover critical paths only.

```
┌─────────┐     ┌──────────────┐     ┌──────────┐
│  Unit   │ ──▶ │ Integration  │ ──▶ │   E2E    │
│  (fast) │     │ (medium)     │     │ (slow)   │
└─────────┘     └──────────────┘     └──────────┘
      ▲                                      │
      └──────────────────────────────────────┘
              Smoke test critical paths
```

---

## 6. Async & Concurrency

- Async for I/O. Synchronous for CPU-bound work.
- Prefer structured concurrency (tokio tasks, asyncio tasks, goroutines with
  errgroups). Avoid "fire and forget" unless the task is truly fire-and-forget
  (logging, metrics).
- Use bounded channels or backpressure for producer-consumer patterns.
- Never hold a lock across an await point / async boundary.

---

## 7. API Design (REST / GraphQL / RPC)

- Resources over actions. An API endpoint should read like a noun-verb pair:
  `GET /users/:id`, `POST /orders`.
- Consistent error response shape. Every error response has the same structure:
  ```json
  { "error": { "code": "USER_NOT_FOUND", "message": "User 42 not found" } }
  ```
- Versioning via header or prefix (`/v1/`). Prefer headers for header-based
  versioning (Accept header) or gracefully evolve without versioning for
  internal APIs.
- Pagination: cursor-based for lists. Offset-based only for small, static sets.

---

## 8. File & Directory Layout

```
project-root/
├── src/                 # source code
│   ├── domain/          # domain models, logic, ports
│   ├── application/     # use cases, services
│   ├── infrastructure/  # DB, external services, config
│   └── interface/       # API, CLI, event handlers
├── tests/               # test code (mirrors src/ layout)
├── reports/             # structured analysis and decision records
│   └── templates/       # reusable report templates
├── scripts/             # build, deploy, migration scripts
├── docs/                # architecture decisions, ADRs
├── .env.example         # documented env vars
├── README.md            # project overview
│
├── rules/               # (AI guide) conventions, architecture, testing
├── skills/              # (AI guide) language/framework-specific patterns
├── .opencode.md         # (AI guide) opencode configuration
├── AGENTS.md            # (AI guide) universal AI assistant instructions
└── CLAUDE.md            # (AI guide) Claude-specific configuration
```

Files under `rules/`, `skills/`, `.opencode.md`, `AGENTS.md`, and `CLAUDE.md`
are AI assistant guide files — see the `opencode-guide` repo for details. Add
them to `.gitignore` to prevent accidental commits to remotes.

---

*This file is a reference. Adapt layer boundaries and module groupings to
match the project's domain complexity.*
