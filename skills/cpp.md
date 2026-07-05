# C/C++ Skill

Loaded when the project uses C or C++. Supplements `rules/conventions.md`
with C/C++-specific patterns.

---

## Project Setup

- **Build**: CMake (`cmake -B build && cmake --build build`)
- **Test**: `ctest --test-dir build` or `./build/tests`
- **Lint**: `clang-tidy src/**/*.cpp -- -std=c++23`
- **Format**: `clang-format -i src/**/*.cpp src/**/*.h`
- **Sanitizers**: `-fsanitize=address,undefined` in debug builds
- **Static analysis**: `clang-tidy --checks=*`

## CMake Template

```cmake
cmake_minimum_required(VERSION 3.28)
project(my_project LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Sanitizers for debug
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
    add_link_options(-fsanitize=address,undefined)
endif()

add_subdirectory(src)
add_subdirectory(tests)
```

## Code Patterns

### Error Handling — `std::expected`

```cpp
#include <expected>
#include <string>
#include <system_error>

enum class ParseError { Empty, InvalidFormat };

std::expected<int, ParseError> parse_int(std::string_view s) {
    if (s.empty()) return std::unexpected(ParseError::Empty);
    // ...
    return 42;
}
```

### Result Type (without C++23)

```cpp
// Use tl::expected until C++23 is widely available
#include <tl/expected.hpp>

tl::expected<User, Error> find_user(std::string_view id) {
    // ...
}
```

### Smart Pointers

```cpp
// Unique ownership
auto user = std::make_unique<User>("Alice");

// Shared ownership (use sparingly)
auto config = std::make_shared<Config>();

// Never: raw new/delete, owning raw pointers
```

## Conventions

- **`.cpp` / `.h`**: Implementation in `.cpp`, declarations in `.h`.
  Use `.hpp` for headers with templates if preferred. Be consistent.
- **`#pragma once`** over include guards.
- **`constexpr`** where possible. `consteval` for forced compile-time eval.
- **`auto`** for type inference when the type is obvious from context.
  No `auto` for non-obvious types (prefer explicit).
- **nullptr**: Use `std::optional<T>` for nullable values, not raw pointers.
- **Ranges**: Prefer `<ranges>` and `<algorithm>` over raw loops.
- **Exceptions**: Recoverable errors only. Not for control flow.
  In performance-critical paths: `std::expected` or error codes.
- **No C-style casts**: Use `static_cast`, `dynamic_cast`, `reinterpret_cast`.
- **`std::string_view`** over `const std::string&` for read-only parameters.
  `std::span<T>` over `const std::vector<T>&`.
- **RAII**: Every resource (memory, file handle, mutex) wrapped in a class.
  No manual `delete`.
