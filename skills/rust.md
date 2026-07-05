# Rust Skill

Loaded when the project uses Rust. Supplements `rules/conventions.md` with
Rust-specific patterns.

---

## Project Setup

- **Start**: `cargo init --lib` or `cargo new <name>`
- **Add deps**: `cargo add <crate>`
- **Build**: `cargo build`
- **Check**: `cargo check` (faster, no codegen)
- **Test**: `cargo test`
- **Lint**: `cargo clippy -- -D warnings`
- **Format**: `cargo fmt`
- **Docs**: `cargo doc --no-deps --open`

## Recommended Crates (when applicable)

| Concern | Crate |
|---------|-------|
| Error handling | `thiserror` (lib), `anyhow` (app/bin) |
| Async runtime | `tokio` |
| Serialization | `serde` + `serde_json` |
| HTTP server | `axum` or `actix-web` |
| HTTP client | `reqwest` |
| Database | `sqlx` (async, compile-time checks) or `diesel` |
| ORM | `sea-orm` or `diesel` |
| CLI | `clap` |
| Logging | `tracing` |
| Testing | `assert_matches`, `googletest` (for better assertions) |
| Date/time | `chrono` or `time` |
| UUID | `uuid` |
| Validation | `validator` |
| Config | `dotenvy` + custom typed config |

## Code Patterns

### Error Handling

```rust
use std::fmt;

#[derive(Debug)]
pub enum DomainError {
    NotFound { id: String },
    Validation { field: String, reason: String },
    Internal(String),
}

impl fmt::Display for DomainError { /* ... */ }
impl std::error::Error for DomainError {}

// With thiserror:
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DomainError {
    #[error("{0} not found")]
    NotFound(String),
    #[error("{field}: {reason}")]
    Validation { field: String, reason: String },
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}
```

### Result Type

```rust
// Prefer a module-level type alias
pub type Result<T> = std::result::Result<T, DomainError>;
```

### Module Structure

```
src/
├── lib.rs          # public API, re-exports
├── domain/
│   ├── mod.rs
│   ├── models.rs
│   ├── ports.rs    # trait definitions (interfaces)
│   └── error.rs
├── application/
│   ├── mod.rs
│   └── use_cases.rs
├── infrastructure/
│   ├── mod.rs
│   ├── persistence/
│   └── http/
└── interface/
    ├── mod.rs
    └── api/
```

### Testing

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_empty_input_returns_error() {
        let result = parse("");
        assert!(result.is_err());
        assert!(matches!(result, Err(ParseError::Empty)));
    }

    #[rstest]
    #[case("valid", Ok("valid"))]
    #[case("", Err(ParseError::Empty))]
    fn test_parse(#[case] input: &str, #[case] expected: Result<&str, ParseError>) {
        assert_eq!(parse(input).map(|s| s.as_str()), expected);
    }
}
```

## Conventions

- **Ownership**: Prefer `&str` over `&String`, `&[T]` over `&Vec<T>`.
- **Derives**: Always derive `Debug`. Derive `Clone`, `Copy`, `PartialEq`,
  `Eq` where semantically correct.
- **`unsafe`**: Never use without a safety comment documenting the invariant.
  Prefer safe abstractions.
- **`unwrap()`/`expect()`**: Only in tests and when the error is truly
  impossible (infallible conversion, known-valid input at a closed boundary).
- **Clippy**: Pedantic mode is fine but prefer default lint set for most
  projects.
- **Feature gates**: Use `#[cfg(test)]` for test-only code, not `#[cfg(debug)]`.
- **Module visibility**: `pub(crate)` by default, `pub` only if the module is
  part of the public API.
