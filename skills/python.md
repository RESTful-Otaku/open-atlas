# Python Skill

Loaded when the project uses Python. Supplements `rules/conventions.md` with
Python-specific patterns.

---

## Project Setup

- **Init**: `uv init --lib` or `poetry new`
- **Env**: `uv venv` or `python -m venv .venv`
- **Lint**: `ruff check .`
- **Format**: `ruff format .`
- **Type check**: `mypy --strict .` or `pyright`
- **Test**: `pytest -v`
- **Build**: `uv build` or `python -m build`

## Recommended Dependencies

```toml
[project]
dependencies = [
    "pydantic>=2",      # validation + settings
    "rich",              # pretty CLI output
]

[project.optional-dependencies]
dev = [
    "ruff",
    "mypy",
    "pytest",
    "pytest-cov",
]
```

## Code Patterns

### Error Handling — Custom Exception Hierarchy

```python
class AppError(Exception):
    """Base error for the application."""
    code: str = "APP_ERROR"

class NotFoundError(AppError):
    code = "NOT_FOUND"

class ValidationError(AppError):
    code = "VALIDATION_ERROR"

class AuthError(AppError):
    code = "AUTH_ERROR"
```

### Result Type Pattern (using @overload)

```python
from __future__ import annotations
from dataclasses import dataclass
from typing import TypeVar, Generic

T = TypeVar("T")
E = TypeVar("E", bound=Exception)

@dataclass(frozen=True)
class Ok(Generic[T]):
    value: T

@dataclass(frozen=True)
class Err(Generic[E]):
    error: E

type Result[T, E] = Ok[T] | Err[E]
```

### Pydantic Models

```python
from pydantic import BaseModel, EmailStr, field_validator

class User(BaseModel):
    id: str
    name: str
    email: EmailStr
    
    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name must not be empty")
        return v.strip()
```

## Module Structure

```
src/
├── __init__.py
├── main.py              # entry point
├── domain/
│   ├── __init__.py
│   ├── models.py
│   └── errors.py
├── application/
│   ├── __init__.py
│   └── services.py
├── infrastructure/
│   ├── __init__.py
│   ├── database/
│   └── http/
└── interface/
    ├── __init__.py
    └── api/
```

## Testing

```python
import pytest
from src.domain.models import User

class TestUser:
    def test_create_valid_user(self):
        user = User(id="1", name="Alice", email="alice@example.com")
        assert user.name == "Alice"
    
    def test_create_user_empty_name_raises(self):
        with pytest.raises(ValueError, match="must not be empty"):
            User(id="1", name="", email="alice@example.com")
    
    @pytest.mark.parametrize("name,expected", [
        ("Alice", "Alice"),
        (" Bob ", "Bob"),
    ])
    def test_user_name_stripped(self, name: str, expected: str):
        user = User(id="1", name=name, email="alice@example.com")
        assert user.name == expected
```

## Conventions

- **`__init__.py`**: Minimal. Only re-exports. No logic.
- **Imports**: `from __future__ import annotations` at top for forward references.
- **`typing` over `typing_extensions`**: Use the standard library where possible.
  Prefer `|` union syntax (`str | None` over `Optional[str]`).
- **Dataclasses**: Use `@dataclass(frozen=True, slots=True)` for simple data
  containers. Use Pydantic when validation/coercion is needed.
- **Generators**: Prefer generator functions (`yield`) over building lists for
  streaming/lazy computation.
- **F-strings**: Use f-strings exclusively. No `.format()` or `%` formatting.
- **Type hints everywhere**: Function arguments and return values must always
  be annotated. Variables typed where inference isn't obvious.
