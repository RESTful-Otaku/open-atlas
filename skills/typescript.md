# TypeScript Skill

Loaded when the project uses TypeScript. Supplements `rules/conventions.md`
with TS-specific patterns.

**Related skills**: `svelte.md` (for SvelteKit projects), `capacitor.md`
(for mobile hybrid apps). Load those in addition when applicable.

---

## Project Setup

- **Init**: `npm create vite@latest` or `pnpm create`
- **Check**: `tsc --noEmit --strict`
- **Lint**: `eslint --max-warnings 0`
- **Format**: `prettier --check .`
- **Test**: `vitest` or `jest`
- **Build**: `tsc` or `vite build`

## Recommended Config

### `tsconfig.json` — Strict Mode

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022"
  }
}
```

### ESLint — Flat Config

```typescript
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/'] },
  { extends: [...tseslint.configs.strictTypeChecked] },
  {
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
    },
  },
);
```

## Code Patterns

### Discriminated Unions for State

```typescript
type AsyncState<T, E = Error> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: E };

// Usage — exhaustive match
function render(state: AsyncState<User>): string {
  switch (state.status) {
    case 'idle': return '';
    case 'loading': return 'Loading...';
    case 'success': return state.data.name;
    case 'error': return `Error: ${state.error.message}`;
  }
}
```

### Result Type (if not using neverthrow)

```typescript
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

export function err<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
```

### Branded Types

```typescript
type Brand<T, B> = T & { __brand: B };

type UserId = Brand<string, 'UserId'>;
type Email = Brand<string, 'Email'>;

function userId(s: string): UserId { return s as UserId; }
function email(s: string): Email { return s as Email; }
```

### Error Handling

```typescript
class AppError extends Error {
  readonly code: string;
  
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AppError';
  }
}

// Never throw raw objects/strings — always throw `AppError` or subclasses.
```

## Module Structure

```
src/
├── index.ts           # re-exports
├── types/             # shared types, branded types
├── domain/            # business logic
├── application/       # use cases, services
├── infrastructure/    # DB clients, HTTP clients, config
├── interface/         # API handlers, event handlers
└── lib/               # utility functions (no business logic)
```

## Svelte Specific

- Use SvelteKit for full-stack apps, Vite + Svelte for SPA.
- Components in `src/lib/components/`, routes in `src/routes/`.
- `+page.svelte` = page, `+layout.svelte` = layout, `+server.ts` = API endpoint.
- Use `$lib/` alias for components and utilities.

## Testing

```typescript
import { describe, it, expect } from 'vitest';

describe('parseUser', () => {
  it('returns user for valid input', () => {
    const result = parseUser({ name: 'Alice' });
    expect(result).toStrictEqual(ok({ name: 'Alice' }));
  });

  it('returns error for empty name', () => {
    const result = parseUser({ name: '' });
    expect(result).toStrictEqual(err(new ValidationError('name', 'required')));
  });
});
```

## Conventions

- **`type` vs `interface`**: Prefer `type` for unions, intersections, and
  utility types. Prefer `interface` for object shapes that may be extended.
  Be consistent within a project.
- **`const` over `let`**: Immutable by default. Only use `let` when rebinding
  is necessary.
- **Named exports**: Prefer named exports over default exports (better
  refactoring, tree-shaking, and IDE support).
- **Async/await** over raw `.then()` chains. Parallel work: `Promise.all()`.
- **Null checks**: Use `??` (nullish coalescing) and `?.` (optional chaining)
  over `||` and `&&` for existence checks.
