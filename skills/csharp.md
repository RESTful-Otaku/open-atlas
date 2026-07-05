# C# Skill

Loaded when the project uses C# (.NET). Supplements `rules/conventions.md`
with C#-specific patterns.

---

## Project Setup

- **Init**: `dotnet new sln && dotnet new classlib -n App.Core`
- **Build**: `dotnet build`
- **Test**: `dotnet test`
- **Lint**: `dotnet format --verify-no-changes`
- **Format**: `dotnet format`
- **Analysis**: `dotnet list package --vulnerable`

## Code Patterns

### Error Handling — Result Type

```csharp
public readonly record struct Result<T>
{
    public T? Value { get; }
    public Error? Error { get; }
    public bool IsSuccess => Error is null;

    private Result(T value) { Value = value; Error = null; }
    private Result(Error error) { Value = default; Error = error; }

    public static Result<T> Success(T value) => new(value);
    public static Result<T> Failure(Error error) => new(error);
}

public readonly record struct Error(string Code, string Message);

// Usage
Result<User> GetUser(string id)
{
    if (string.IsNullOrEmpty(id))
        return Result<User>.Failure(new Error("INVALID_ID", "ID is required"));
    // ...
    return Result<User>.Success(user);
}
```

### Custom Exception Hierarchy

```csharp
public abstract class AppException : Exception
{
    public string Code { get; }
    protected AppException(string code, string message) : base(message)
        => Code = code;
}

public sealed class NotFoundException : AppException
{
    public NotFoundException(string resource, string id)
        : base("NOT_FOUND", $"{resource} '{id}' not found") { }
}

public sealed class ValidationException : AppException
{
    public IReadOnlyList<ValidationError> Errors { get; }
    public ValidationException(IEnumerable<ValidationError> errors)
        : base("VALIDATION_ERROR", "Validation failed")
        => Errors = errors.ToList().AsReadOnly();
}
```

## Conventions

- **File-scoped namespaces**: `namespace App.Core;` (no braces).
- **Primary constructors**: For simple classes with constructor injection.
- **`record`** for data types (immutable by default).
- **`readonly`** fields by default. Immutable structs.
- **Null safety**: Enable `<Nullable>enable</Nullable>`. Use `?` annotations.
- **LINQ**: Preferred over manual loops for querying collections. Be careful
  with multiple enumeration — materialize with `.ToList()`.
- **Async**: `async Task` / `async ValueTask`. Avoid `async void` (only for
  event handlers). Never block on async (no `.Result`, no `.Wait()`).
- **DI**: Constructor injection. Prefer `Microsoft.Extensions.DependencyInjection`.
- **No `throw Exception`**: Throw the most specific derived type.
