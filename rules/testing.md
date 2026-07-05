# Testing & Quality Assurance

Testing philosophy, patterns, and standards for every project.

---

## 1. Testing Philosophy

- **Tests are code**. They deserve the same care as production code: clear
  naming, proper structure, no duplication.
- **Test behaviour, not implementation**. A test should pass or fail based on
  what the code does, not how it does it. Refactoring should not break tests.
- **One assertion per test concept**. If a test has multiple concerns, split
  it. Parametrized tests are different — they test the same concept with
  different inputs.
- **Red-Green-Refactor** when adding new behaviour: write a failing test,
  make it pass, then clean up.

---

## 2. Test Pyramid

| Layer | Speed | Scope | Count |
|-------|-------|-------|-------|
| Unit | ms | Single function/class | Many (80%) |
| Integration | s | Module + infrastructure | Some (15%) |
| E2E | min | Full system | Few (5%) |

### Unit Tests
- Test pure logic: domain models, validation, transformation, computation.
- Mock or stub at module boundaries. Prefer stubs (fixed responses) over mocks
  (behaviour verification).
- No network calls, no database, no filesystem.

### Integration Tests
- Test one module + its real dependencies (database, file system, external API
  via test doubles or test containers).
- One integration test file per module.
- Use test containers for databases where possible (postgres, redis, etc.).

### E2E Tests
- Test critical user journeys only: signup → login → do thing → logout.
- Full system: real services, real database, real API calls (in a test
  environment).
- Fragile by nature. Keep the count low.

---

## 3. Test Structure

### Pattern: Arrange-Act-Assert (AAA)

```
// Arrange — set up inputs, state, expectations
// Act     — execute the behaviour under test
// Assert  — verify the result matches expectations
```

```
# Good — clear AAA with blank-line separation
def test_discount_for_loyalty_members():
    user = User(plan=Plan.LOYALTY, purchase_count=50)
    cart = Cart(items=[Item(price=100)])
    
    total = apply_discount(user, cart)
    
    assert total == 80  # 20% loyalty discount
```

```
// Good — AAA in Rust
#[test]
fn test_order_total_with_discount() {
    let order = Order::new(vec![Item::new(100)]);
    let coupon = Coupon::new(10.0, CouponType::Percent);
    
    let total = order.apply_coupon(&coupon);
    
    assert_eq!(total.expect("coupon should apply"), 90.0);
}
```

### Pattern: Property-Based / Fuzz Testing

For functions with complex inputs or many edge cases, supplement example-based
tests with property-based or fuzz testing. Define invariants that must hold
for *all* inputs, then let the tool find counterexamples.

```rust
// Rust — proptest
use proptest::prelude::*;

proptest! {
    #[test]
    fn parse_never_crashes(input in ".*") {
        // The property: parse() should never panic, regardless of input
        let _ = parse(&input);
    }
}
```

```python
# Python — hypothesis
from hypothesis import given, strategies as st

@given(st.text())
def test_parse_never_raises(input: str):
    result = parse(input)
    # The property: parse() always returns a Result, never throws
    assert isinstance(result, Result)
```

```go
// Go — go-fuzz or testing/quick
func FuzzParse(f *testing.F) {
    f.Add("valid input")
    f.Add("")
    f.Fuzz(func(t *testing.T, input string) {
        _, err := Parse(input)
        // The property: Parse() never panics for any input
        // Error is acceptable, panic is not
    })
}
```

**When to add fuzz testing:**
- Functions that parse untrusted input (JSON, user input, file formats)
- Functions with complex branching logic
- Functions with numeric or boundary-sensitive logic
- After a bug fix: add the failing input to the fuzz corpus

### Pattern: Table-Driven / Parametrized Tests

Prefer this for testing multiple input-output pairs for the same behaviour:

```python
@pytest.mark.parametrize("input,expected", [
    ("", 0),
    ("hello", 5),
    ("héllo", 5),    # unicode chars count as 1
    ("hello\nworld", 10),
])
def test_string_length(input: str, expected: int):
    assert string_length(input) == expected
```

```go
// Go table-driven test
func TestParseUser(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        wantErr bool
        want    *User
    }{
        {"valid", `{"name":"Alice"}`, false, &User{Name: "Alice"}},
        {"empty name", `{"name":""}`, true, nil},
        {"invalid json", `not json`, true, nil},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := ParseUser(tt.input)
            if (err != nil) != tt.wantErr {
                t.Errorf("ParseUser() error = %v, wantErr %v", err, tt.wantErr)
            }
            if !reflect.DeepEqual(got, tt.want) {
                t.Errorf("ParseUser() = %v, want %v", got, tt.want)
            }
        })
    }
}
```

---

## 4. Naming

| Language | Convention | Example |
|----------|-----------|---------|
| Rust | `#[test] fn test_<scenario>_<outcome>()` | `fn test_empty_input_returns_error()` |
| Python | `def test_<scenario>_<outcome>()` | `def test_empty_input_returns_error()` |
| TypeScript | `describe('<fn>')` / `it('<scenario> <outcome>')` | `it('returns error for empty input')` |
| Go | `func Test<Fn>_<Scenario>(t *testing.T)` | `func TestParse_EmptyInput(t *testing.T)` |
| C# | `[Fact] void <Fn>_<Scenario>_<Outcome>()` | `void Parse_EmptyInput_ReturnsError()` |

---

## 5. Coverage

- Target: 80% line coverage minimum. 90%+ for critical business logic.
- Coverage is a signal, not a target. Do not write meaningless tests to pad
  coverage.
- Use coverage tools to find untested paths, not to enforce a number.
- Every `if`, `match` arm, `switch` case, and error path should be tested.

---

## 6. Linting & Static Analysis

Run these before every commit. Treat warnings as errors.

| Language | Command |
|----------|---------|
| Rust | `cargo clippy -- -D warnings` |
| TypeScript | `eslint --max-warnings 0` |
| Python | `ruff check --fix` then `ruff format --check` |
| Go | `golangci-lint run` |
| C/C++ | `clang-tidy` (via CMake) |
| C# | `dotnet format --verify-no-changes` |
| Java | `mvn checkstyle:check spotless:check` |

---

## 7. Type Checking

| Language | Command |
|----------|---------|
| Rust | `cargo check` (faster than full build) |
| TypeScript | `tsc --noEmit --strict` |
| Python | `mypy --strict` or `pyright` |
| Go | `go vet` |

---

## 8. Benchmarking

When a change claims to improve performance:

1. Measure the current baseline: time, memory, allocations.
2. Apply the change.
3. Measure the new value.
4. Report both. Include the environment (CPU, RAM, OS).

```rust
// Rust criterion benchmark
fn bench_parse(c: &mut Criterion) {
    c.bench_function("parse 10k entries", |b| {
        b.iter(|| parse_entries(black_box(&TEST_DATA)))
    });
}
```

```go
// Go benchmark
func BenchmarkParse(b *testing.B) {
    for i := 0; i < b.N; i++ {
        Parse(TEST_DATA)
    }
}
```

---

## 9. Continuous Integration

Every PR should run:

1. Lint
2. Type check
3. Unit tests
4. Integration tests
5. Build
6. Coverage report
7. (Optional) E2E smoke tests

Speed matters. Keep CI under 10 minutes. Use test splitting for large suites.

---

*Copy this file into any project. Adjust the lint/check commands to match
the actual toolchain.*
