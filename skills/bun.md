# Bun Skill

Loaded when the project uses Bun as the JavaScript/TypeScript runtime or
package manager. Supplements `rules/conventions.md` with Bun-specific
patterns.

**Also load**: `javascript.md` or `typescript.md` depending on language.

---

## Project Setup

- **Init**: `bun init`
- **Run**: `bun run src/main.ts`
- **Watch**: `bun --watch src/main.ts`
- **Test**: `bun test`
- **Type check**: `bun run tsc --noEmit` (via bunx)
- **Lint**: `bunx eslint .`
- **Format**: `bunx prettier --check .`
- **Package add**: `bun add <pkg>`
- **Package remove**: `bun remove <pkg>`
- **Script run**: `bun run <script>` (faster than npm)
- **Bunx**: `bunx <pkg>` (drop-in for `npx`)

## Bun vs Node — Key Differences

| Feature | Bun | Node |
|---------|-----|------|
| Package manager | Built-in (faster than npm/pnpm) | External (npm/pnpm/yarn) |
| TypeScript | Runs `.ts` directly — no build step | Needs `tsx` or compile step |
| Test runner | `bun test` (Jest-compatible API) | `node --test` or Vitest |
| SQLite | Built-in `bun:sqlite` | Third-party `better-sqlite3` |
| File I/O | Bun-native `Bun.file()` | `fs/promises` |
| Transpiler | Built-in | External (swc, esbuild) |

## Code Patterns

### Bun File I/O

```typescript
import { Bun } from 'bun';

// Read
const file = Bun.file('data.json');
const data = await file.json();

// Write
await Bun.write('output.txt', 'hello');

// Stream
const stream = file.stream();
```

### Bun SQLite (built-in)

```typescript
import { Database } from 'bun:sqlite';

const db = new Database('app.db');
db.run('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT)');

const query = db.prepare('SELECT * FROM users WHERE id = ?');
const user = query.get('user_1');
```

### HTTP Server

```typescript
// Built-in — no Express needed for simple APIs
Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/users' && req.method === 'GET') {
      return Response.json([{ id: '1', name: 'Alice' }]);
    }
    return new Response('Not found', { status: 404 });
  },
});
```

## Conventions

- **TypeScript by default**: Bun runs TS natively. Use `.ts` over `.js`.
  JSDoc types are unnecessary when TS is first-class.
- **`Bun.file()`** over `fs/promises` for file I/O — it's Bun-native,
  faster, and simpler.
- **`bun:sqlite`** over external SQLite libraries when Bun is the target
  runtime. Fall back to `better-sqlite3` only for Node compatibility.
- **`bun test`** over Vitest — it's built-in and Jest-compatible. Use
  Vitest only if you need Node compatibility.
- **`bunx`** over `npx` — it's faster. Same syntax.
- **Scripts**: Use `bun run` in `package.json` scripts (e.g.,
  `"start": "bun run src/main.ts"`).
- **No build step for dev**: In development, Bun runs TS directly. Use
  `bun build` only for production bundles.
- **Lockfile**: Commit `bun.lock` (bun's lockfile format). Remove
  `package-lock.json` and `yarn.lock`.
- **Docker**: Use the official `oven/bun` image. `bun install --frozen-lockfile`
  for reproducible builds.
- **Testing**: `bun test` supports Jest globals (`describe`, `it`, `expect`).
  Use `--coverage` for coverage reports.

```typescript
// bun test — Jest-compatible API
import { describe, it, expect, beforeAll } from 'bun:test';

describe('findUser', () => {
  it('returns user for valid id', async () => {
    const user = await findUser('1');
    expect(user?.name).toBe('Alice');
  });
});
```
