# Coding Conventions

Universal rules for writing code in any language. Language-specific
extensions live in `skills/`.

These conventions serve the seven tenets (see `.opencode.md`):
1. Correctness
2. Stability & resilience
3. Simplicity
4. Sensible abstractions
5. Testing & guard rails
6. System awareness
7. Prove it

When a convention below traces to a specific tenet, it's noted like so: `→ Tenet N`.

---

## 1. Naming (`→ Tenet 3`)

| Category | Convention | Examples |
|----------|-----------|----------|
| Variables, functions, methods | Language-idiomatic (snake_case, camelCase) | `get_user`, `parseInput` |
| Types, classes, enums, traits | PascalCase | `UserProfile`, `ParseError` |
| Constants | SCREAMING_SNAKE_CASE or `const` with idiomatic casing | `MAX_RETRY_COUNT` |
| Files | Match primary export (kebab-case for TS, snake_case for Rust/Python) | `auth-service.ts`, `user_repo.py` |
| Modules / packages | Short, lowercase, no underscores unless language requires | `auth`, `user_repo` |
| Private / internal | Prefix with `_` only if language convention demands it (Python) | `_internal` |
| Tests | `test_<thing>` or `<thing>_test` per language convention | `test_parse_user` |

**Rule of thumb**: Names should reveal intent. If you need a comment to explain
what a name means, rename it.

---

## 2. Imports (`→ Tenet 3`)

Order:
1. Standard library / built-ins
2. Third-party dependencies
3. Local / internal modules

Within each group, sort alphabetically. No unused imports. No wildcard imports
(`from x import *`, `use x::*`) unless the language ecosystem demands it
(e.g., prelude patterns).

```rust
// Rust — good
use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::db::Connection;
use crate::models::User;

// Rust — bad
use std::collections::HashMap;
use crate::db::Connection;
use serde::Deserialize;
```

```typescript
// TypeScript — good
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '~/db';
import { User } from '~/models';
```

```python
# Python — good
from __future__ import annotations

import os
import sys
from collections.abc import Callable
from dataclasses import dataclass

import pytest
import requests

from myapp.auth import login
from myapp.models import User
```

---

## 3. Error Handling (`→ Tenet 1, Tenet 2`)

### Universal Principles
- Handle every error path. No silently swallowed errors.
- Use the language's idiomatic error mechanism. Do not abuse exceptions for
  control flow.
- Prefer returning errors to panicking / throwing, unless the error is truly
  unrecoverable (configuration missing, hardware failure, programmer mistake).

### By Language
| Language | Mechanism | Notes |
|----------|-----------|-------|
| Rust | `Result<T, E>`, custom error enums, `thiserror`/`anyhow` | Avoid bare `.unwrap()`, `.expect()`. Use `.context()` or `.map_err()`. |
| TypeScript | Discriminated unions, `Result<T, E>` type, typed exceptions | Avoid throwing strings. Never use `any`. |
| Python | Custom exception hierarchy, early returns | Avoid bare `except:`. Catch specific exceptions. |
| Go | `error` interface, sentinel errors, `errors.Is()` | Always check errors. Use `fmt.Errorf("context: %w", err)`. |
| C++ | `std::expected<T, E>`, exceptions (truly exceptional only) | Avoid `throw` in hot paths. Mark `noexcept` where appropriate. |
| C# | Custom exception types, `Result<T>` pattern | Favour `Result<T>` for expected failures, exceptions for bugs. |
| Java | Custom checked exceptions for recoverable, `Optional` for nullable | Prefer sealed hierarchies, avoid generic `Exception` throws. |

### Examples

```typescript
// Good — discriminated union
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

function parseUser(input: unknown): Result<User, ParseError> {
  // ...
}
```

```go
// Good — sentinel error
var ErrNotFound = errors.New("user not found")

func GetUser(id string) (*User, error) {
    // ...
    return nil, fmt.Errorf("get user %s: %w", id, ErrNotFound)
}
```

---

## 4. Types (`→ Tenet 1`)

- **Prefer precise types**. Model the domain exactly. If a value can be one of
  N variants, use a sum type (enum, tagged union). If a value has constraints,
  encode them in the type (newtype, branded type).
- **No `any` / `interface{}` / `Object`** unless wrapping truly dynamic content
  (JSON parsing, plugin systems). Even then, narrow immediately after the
  boundary.
- **Use type inference** where it improves readability. Explicit annotation
  where it serves as documentation.
- **Newtypes** for distinct domain concepts, even if the underlying
  representation is the same (e.g., `Email` vs `Url`, both `String`).

```rust
// Good — newtype
struct Email(String);
struct Url(String);

fn send_email(to: &Email) { /* ... */ }
// send_email(&Url("...".into()))  // type error ✓
```

```typescript
// Good — branded type
type Email = string & { __brand: 'Email' };
function email(s: string): Email { return s as Email; }
```

---

## 5. Functions & Control Flow (`→ Tenet 3`)

- **Single responsibility**. Each function does one thing. If a function needs
  "and" or "or" in its description ("parse and validate"), split it.
- **Small**. Hard limit of 30 lines. Prefer 5-15.
- **Pure when possible**. No side effects unless the function's purpose is
  side effects (I/O, logging, state mutation).
- **Early returns** over nested else chains. Flat is better than nested.
- **Guard clauses** at the top for preconditions.

```typescript
// Good
function processOrder(order: Order): Result<Receipt, ProcessError> {
  if (!order.isPaid) return err(ProcessError.NotPaid);
  if (order.items.length === 0) return err(ProcessError.Empty);
  // main logic at same indent level
  return ok(createReceipt(order));
}
```

```python
# Good
def process_order(order: Order) -> Result[Receipt, ProcessError]:
    if not order.is_paid:
        return Err(ProcessError.NotPaid)
    if not order.items:
        return Err(ProcessError.Empty)
    return Ok(create_receipt(order))
```

---

## 6. Logging & Observability (`→ Tenet 2`)

- **Structured logging** over string formatting. Use structured output (JSON,
  key-value pairs) that can be parsed by log aggregators.
- **Level discipline**:
  - `ERROR` — Something is broken and needs human attention.
  - `WARN` — Something unexpected happened but the system recovered.
  - `INFO` — Major lifecycle events (startup, shutdown, config reload).
  - `DEBUG` — Development-only detail. Should be off in production by default.
  - `TRACE` — Everything else. Off in production.
- **Include context**. Every log line should answer: *What happened? Where?
  What request/transaction?* Attach request IDs, user IDs, correlation IDs.
- **No logging in hot paths** (tight loops, high-frequency calls). Use metrics
  (counters, histograms) instead.
- **No PII or secrets**. Never log passwords, tokens, session keys, or
  personal data. If needed for debugging, hash or mask them.
- **Use existing tracing infrastructure** (OpenTelemetry, structured context
  propagation) rather than manual log injection. `tracing` in Rust, `structlog`
  in Python, `pino` in TypeScript.
- **Metrics** for: request rate, error rate, latency (p50/p95/p99), resource
  usage (CPU, memory, connections). Dashboards over log spelunking.
- **Health endpoints**. Every service should expose `/health` (liveness) and
  `/ready` (readiness) endpoints.

## 7. Comments (`→ Tenet 3`)

- **Only explain why**, never what or how. The code should make the *what* and
  *how* obvious.
- Doc comments for public APIs in languages that support them (Rust `///`,
  TypeScript `/** */`, Python docstrings, Go `//`.
- TODO comments: `// TODO(username): reason — what's needed`.
- No commented-out code. Delete it. Git history preserves it.

```rust
/// Good — explains why
/// We use a bloom filter here because lookups must be O(1) and
/// false positives are acceptable for this pre-check.
let filter = BloomFilter::new(100_000, 0.01);

/// Bad — explains what
/// Creates a new bloom filter with 100000 items and 0.01 false positive rate.
let filter = BloomFilter::new(100_000, 0.01);
```

---

## 8. Formatting (`→ Tenet 3`)

- Use the language's standard formatter. Do not configure custom rules.
  - Rust: `rustfmt` (default config)
  - TypeScript: `prettier` (default config, 2-space indent)
  - Python: `ruff format` (default config)
  - Go: `gofmt` / `go fmt`
  - C++: `clang-format` (Google or LLVM style, project-configured)
  - C#: `dotnet format`
  - Java: `spotless` (Google Java Style)
- Do not argue about formatting. The formatter wins.

---

## 9. Exports & Module Structure (`→ Tenet 4`)

- **Minimal public surface**. Make everything private by default. Export only
  what other modules need.
- One primary concept per file. If a file contains multiple types, they should
  be closely related.
- Barrel files (re-exports) are acceptable for public API convenience, but keep
  them explicit.

```typescript
// index.ts — OK
export { UserService } from './user-service';
export type { User, CreateUserInput } from './user-types';
```

---

## 10. Testing (`→ Tenet 5`)

See `rules/testing.md` for full detail. Summary:
- Every public function must be tested. Tests live adjacent to source.
- Table-driven / parametrized for multiple input-output pairs.
- Name: `test_<scenario>_<expected_outcome>`.

---

## 11. Stability & Resilience (`→ Tenet 2`)

- **Prefer deterministic behaviour**. Non-deterministic code (random, timing,
  concurrency) should be isolated behind controlled abstractions and explicitly
  documented.
- **Guard against failure at every boundary**. I/O, deserialisation, untrusted
  input, and external API calls must be wrapped in error handling. Assume
  everything outside your module will fail.
- **Resource limits**. Bound memory, CPU, and I/O usage. Use timeouts for all
  external calls. Use circuit breakers for repeated failures.
- **Graceful degradation**. When a dependency fails, degrade functionality
  rather than crashing. Log the failure, serve stale data if acceptable, or
  return a clear error message.
- **Fail-closed, not fail-open**. Security and consistency critical paths
  should deny access by default. Audit logs on failure.
- **Defensive copies**. Copy data at trust boundaries. Do not assume the caller
  will not mutate.

## 12. Sensible Abstractions (`→ Tenet 4`)

- **Every abstraction must justify its existence**. A function, class, trait,
  or module extracted solely because "we might need it later" is tech debt.
- **Three strikes, refactor**. Don't abstract the first time you see a pattern.
  On the third occurrence, consider extracting. Earlier extraction is
  premature.
- **Prefer duplication over the wrong abstraction**. It's easier to deduplicate
  real patterns than to change a wrong abstraction that everything depends on.
- **Interfaces at the right level**. An interface should abstract over what
  varies. If nothing varies behind a trait/interface, it's indirection without
  purpose.

## 13. System-Level Awareness (`→ Tenet 6`)

- **Consider callers**. Before changing a function's signature or behaviour,
  check who calls it and what they depend on.
- **Implicit contracts**. A function that returns `null`/`None`/`nil` sometimes
  but not always has an implicit contract that callers must handle. Make it
  explicit in the return type.
- **Future refactor cost**. A design that makes sense today but forces a
  large refactor tomorrow is a bad design. Prefer one that can evolve
  incrementally.
- **No local optimisations at global cost**. A clever optimisation in one
  function that forces every caller into a worse API or tighter coupling is
  not worth it.

## 14. Documentation

- **README must answer**: What is this? How do I run it? How do I test it?
  What are the key commands? What environment vars are needed?
- **README is the front door**. If it's missing, outdated, or wrong, the
  project looks abandoned. Keep it current with every significant change.
- **API docs** for public interfaces. Language-appropriate doc comments
  (Rust `///`, TypeScript `/** */`, Python docstrings, Go `//`). Include
  examples in doc comments.
- **No README for internal modules** — the code + type signatures + tests are
  the documentation. Add a module-level doc comment only for non-obvious
  design decisions.
- **Architecture Decision Records** (ADRs) in `docs/adrs/` for significant
  decisions. Use the template at `reports/templates/architecture-decision.md`.
- **CHANGELOG** follows [Keep a Changelog](https://keepachangelog.com/).
  Every release gets a new version section.
- **CONTRIBUTING.md** for multi-contributor projects: how to set up, how to
  submit changes, code review expectations, coding standards summary.

## 15. Data Structures & Algorithms

When choosing between options:
- **Arrays/lists** by default. Only use maps/sets when you need key-based
  lookups or uniqueness.
- **Prefer immutable/persistent data structures** where the language supports
  them ergonomically (Rust's `Vec`/`HashMap` are fine — ownership provides
  safety).
- For parsing, **combinator parsers** (nom, combine, pyparsing) over hand-
  written recursive descent, unless performance dictates otherwise.
- **Async** only where I/O is involved. Do not make CPU-bound work async.
- **Prefer iterators/streams** over explicit loops. Familiarity with map,
  filter, reduce, flat_map makes code more declarative.

---

*This file is a convention reference. Copy it into any project and adjust
language-specific sections to match the actual stack.*
