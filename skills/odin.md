# Odin Skill

Loaded when the project uses Odin. Supplements `rules/conventions.md` with
Odin-specific patterns.

---

## Project Setup

- **Init**: `odin init <name>`
- **Build**: `odin build src/ -out:bin/<name>`
- **Run**: `odin run src/`
- **Test**: `odin test src/`
- **Format**: `odin fmt src/`
- **Vet**: `odin vet src/`
- **Docs**: `odin doc src/`

## Project Structure

```
project/
├── src/
│   ├── main.odin        # entry point
│   ├── core/            # core types, shared logic
│   │   ├── types.odin
│   │   └── errors.odin
│   ├── domain/
│   ├── application/
│   └── interface/
├── tests/               # test files (if separated)
├── build.odin           # build script (optional)
├── odin.json            # package config
└── Makefile
```

## Code Patterns

### Error Handling — Idiomatic

```odin
// Odin favours multiple return values with error checks
parse_int :: proc(s: string) -> (int, Error) {
    if len(s) == 0 {
        return 0, .EmptyInput
    }
    // ...
    return result, nil
}

// Usage — checked at call site
val, err := parse_int(input)
if err != nil {
    // handle
}
```

### Result Type Pattern

```odin
Result :: union($T: typeid, $E: typeid) #raw_union {
    ok: T,
    err: E,
}

// Usage
find_user :: proc(id: string) -> Result(User, Error) {
    // ...
    return Result(User, Error){ok = user}
}
```

### Allocator Pattern

```odin
// Allocators are threaded through, not global
create_user :: proc(allocator: mem.Allocator, name: string) -> (User, Error) {
    user := new(User, allocator)
    user.name = strings.clone(name, allocator)
    return user^, nil
}
```

## Conventions

- **Naming**: `snake_case` for everything (procedures, variables, types).
  All upper-case acronyms (e.g., `parse_json`, `make_http_request`). No
  hungarian notation.
- **Allocators**: Accept an explicit allocator parameter rather than using
  context.allocator implicitly in library code.
- **Errors**: Use bit-set enums or union types. No exceptions.
- **`package`**: One package per directory. Directory name matches package name.
- **`when`**: Use compile-time `when` statements over runtime `if` for
  platform-specific code.
- **Using**: `using` is acceptable in small scopes (procedures, short blocks).
  Avoid `using` in struct/union definitions at package scope — it leaks names.
- **No global state**: Prefer passing state explicitly. Avoid file-scoped
  variables except for true constants.
- **`#no_bounds_check`**: Only in hot paths with proven safety. Document why.
- **Tests**: Inline `@test` procedures alongside production code, or in
  separate `.odin` files in the same package.

```odin
@test
test_parse_int_empty_input :: proc(t: ^testing.T) {
    _, err := parse_int("")
    testing.expect(t, err != nil)
}
```
