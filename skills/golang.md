# Go Skill

Loaded when the project uses Go. Supplements `rules/conventions.md` with
Go-specific patterns.

---

## Project Setup

- **Init**: `go mod init <module>`
- **Build**: `go build ./...`
- **Test**: `go test ./... -v`
- **Lint**: `golangci-lint run`
- **Vet**: `go vet ./...`
- **Format**: `gofmt -s -w .` or `go fmt ./...`
- **Fmt check**: `gofmt -d .` or `test -z $(gofmt -l .)`

## Recommended Tools

```bash
# Install
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```

### .golangci.yml (minimal)

```yaml
linters:
  enable:
    - errcheck
    - gofmt
    - gosimple
    - govet
    - ineffassign
    - staticcheck
    - unused

linters-settings:
  errcheck:
    check-type-assertions: true
```

## Code Patterns

### Error Handling — Sentinel & Wrapped

```go
package user

import "errors"

var (
    ErrNotFound = errors.New("user not found")
    ErrInvalid  = errors.New("invalid user data")
)

type Service struct {
    repo Repository
}

func (s *Service) Get(id string) (*User, error) {
    user, err := s.repo.FindByID(id)
    if err != nil {
        return nil, fmt.Errorf("get user %s: %w", id, err)
    }
    return user, nil
}
```

### Result Type (when heavy error handling is needed)

```go
// Use sparingly — idiomatic Go uses multiple returns.
// This pattern helps when you need to accumulate errors.
type Result[T any] struct {
    Value T
    Err   error
}
```

### Interface Segregation

```go
// Keep interfaces small — 1-3 methods.

type UserRepository interface {
    FindByID(id string) (*User, error)
    Save(user *User) error
    Delete(id string) error
}

type EmailSender interface {
    Send(to, subject, body string) error
}
```

## Module Structure

```
internal/
├── domain/
│   ├── user.go         # User struct + business methods
│   └── errors.go       # sentinel errors
├── application/
│   └── user_service.go
├── infrastructure/
│   ├── postgres/
│   │   └── user_repo.go
│   └── config/
│       └── config.go
└── interface/
    └── api/
        └── handler.go

cmd/
└── server/
    └── main.go
```

## Testing

```go
package user_test

import (
    "testing"
)

func TestGet_ExistingUser_ReturnsUser(t *testing.T) {
    repo := NewInMemoryRepo()
    svc := NewService(repo)
    
    user, err := svc.Get("1")
    
    assert.NoError(t, err)
    assert.Equal(t, "Alice", user.Name)
}

func TestGet_NonExistentUser_ReturnsError(t *testing.T) {
    repo := NewInMemoryRepo()
    svc := NewService(repo)
    
    _, err := svc.Get("999")
    
    assert.ErrorIs(t, err, ErrNotFound)
}
```

## Conventions

- **Error handling**: Always check errors. Early return. Do not nest success
  path deeper than the error path.
- **Naming**: No hungarian notation. `UserID` not `strUserID`. Acronyms
  uppercase: `HTTPHandler`, `parseJSON`.
- **Files**: One primary type per file. Name the file after the type.
- **Zero values**: Design types so zero values are useful or invalid (not
  silently dangerous).
- **`init()`**: Avoid. Prefer explicit initialization.
- **Context**: Pass `context.Context` as the first parameter of any function
  that may block or make I/O calls.
- **Goroutines**: Use `errgroup` for parallel work. Never start a goroutine
  without knowing how it stops.
