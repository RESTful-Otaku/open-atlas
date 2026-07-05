# Java Skill

Loaded when the project uses Java. Supplements `rules/conventions.md` with
Java-specific patterns.

---

## Project Setup

- **Init**: `mvn archetype:generate` or Gradle init
- **Build**: `mvn clean verify` / `gradle build`
- **Test**: `mvn test` / `gradle test`
- **Lint**: `mvn checkstyle:check`
- **Format**: `mvn spotless:check` / `gradle spotlessCheck`
- **Vulnerabilities**: `mvn dependency-check:check`
- **Modern Java**: Use Java 21+ (LTS) for new projects

## Code Patterns

### Error Handling — Sealed Exception Hierarchy

```java
public abstract class AppException extends RuntimeException {
    private final String code;

    protected AppException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() { return code; }
}

public final class NotFoundException extends AppException {
    public NotFoundException(String resource, String id) {
        super("NOT_FOUND", resource + " '" + id + "' not found");
    }
}

public final class ValidationException extends AppException {
    private final List<String> errors;

    public ValidationException(List<String> errors) {
        super("VALIDATION_ERROR", "Validation failed");
        this.errors = List.copyOf(errors);
    }

    public List<String> getErrors() { return errors; }
}
```

### Result Type (sealed interface)

```java
public sealed interface Result<T, E extends Exception>
    permits Result.Success, Result.Failure {

    record Success<T, E extends Exception>(T value) implements Result<T, E> {}
    record Failure<T, E extends Exception>(E error) implements Result<T, E> {}

    static <T, E extends Exception> Result<T, E> success(T value) {
        return new Success<>(value);
    }

    static <T, E extends Exception> Result<T, E> failure(E error) {
        return new Failure<>(error);
    }
}

// Usage
Result<User, AppException> findUser(String id) {
    if (id == null || id.isBlank())
        return Result.failure(new ValidationException(List.of("ID is required")));
    // ...
    return Result.success(user);
}
```

### Records for Data

```java
public record User(String id, String name, String email) {}
```

## Conventions

- **Project layout**: Maven standard (`src/main/java`, `src/test/java`).
- **Records**: Use `record` for immutable data carriers. No Lombok in new code.
- **Sealed types**: Use `sealed` interfaces/classes for hierarchies with known
  variants (domain events, command results).
- **Pattern matching**: Use `switch` expressions with pattern matching
  (Java 21+) over chains of `instanceof`.
- **`Optional`**: For return types that may be empty. Never for fields or
  method parameters.
- **Streams**: Preferred over explicit loops for collection operations.
  Avoid `parallelStream()` unless benchmarked.
- **Null safety**: Annotate with `@Nullable` / `@NonNull` (spotbugs or checker).
  Enable `-Werror` for null warnings.
- **Constructors**: Use records or `@Data` classes. No manual getters/setters.
- **No checked exception abuse**: Only declare checked exceptions that the
  caller can reasonably recover from.
- **Module path**: Use `module-info.java` for new libraries (JPMS).
