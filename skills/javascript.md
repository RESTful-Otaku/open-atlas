# JavaScript Skill

Loaded when the project uses JavaScript (without TypeScript, or JS alongside
TS). Supplements `rules/conventions.md` with JS-specific patterns.

**Also load**: `node.md` (if server-side), `react.md` (if React frontend),
`bun.md` (if using Bun runtime), `vite.md` (if using Vite build tool).

---

## Project Setup

- **Init**: `npm init -y` or `pnpm init`
- **Lint**: `eslint --max-warnings 0`
- **Format**: `prettier --check .`
- **Test**: `vitest` or `jest` or `node --test`
- **Check**: `npx tsc --noEmit --allowJs --checkJs` (gradual types with JSDoc)

## Code Patterns

### Type Safety via JSDoc (when not using TypeScript)

```javascript
// @ts-check
// Use JSDoc annotations for type safety without a build step

/** @typedef {{ id: string, name: string }} User */

/**
 * @param {string} id
 * @returns {Promise<User|null>}
 */
async function findUser(id) {
  // ...
}
```

### Error Handling

```javascript
// Custom error classes
class AppError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

// Result pattern (plain JS)
class Ok {
  /** @param {T} value */
  constructor(value) { this.ok = true; this.value = value; }
}

class Err {
  /** @param {E} error */
  constructor(error) { this.ok = false; this.error = error; }
}
```

### Module Patterns

```javascript
// ES modules (preferred — use "type": "module" in package.json)
export function createUser(name) { /* ... */ }
export const MAX_RETRIES = 3;

// Named exports over default exports (better tree-shaking, refactoring)
// Prefer this
export { createUser, findUser };
// Over this
export default class UserService { /* ... */ }
```

## Conventions

- **ES modules**: `import`/`export` over CommonJS `require`/`module.exports`.
  Use `"type": "module"` in package.json.
- **`const` over `let` over `var`**: No `var`. Only `let` when rebinding.
- **Arrow functions**: `const fn = (x) => x + 1` over `function fn(x) { return x + 1 }`.
- **Template literals**: `` `Hello ${name}` `` over `'Hello ' + name`.
- **Optional chaining**: `user?.address?.city` over nested `&&`.
- **Nullish coalescing**: `value ?? defaultValue` over `value || defaultValue`
  (the latter treats `''`, `0`, `false` as absent).
- **No `==`**: Always `===` and `!==`.
- **Async/await**: Over `.then()` chains. `Promise.all()` for parallel.
- **Array methods**: `map`, `filter`, `reduce`, `find`, `some`, `every` over
  manual `for` loops.
- **No `with`**: Never use `with`.
- **No truthiness checks for empty/null**: `if (arr.length)` to test non-empty,
  `if (str)` to test non-empty string, `if (obj !== null)` for objects.
- **Tests**: Vitest or Node test runner. `describe`/`it`/`expect` style.
- **Doc comments**: JSDoc `/** */` for all public functions. Include `@param`
  and `@returns` types even in JS (enables editor intellisense).
