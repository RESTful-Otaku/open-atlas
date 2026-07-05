# Node.js Skill

Loaded when the project uses Node.js. Supplements `rules/conventions.md`
with Node-specific patterns.

**Also load**: `javascript.md` (for JS conventions), `typescript.md`
(if using TypeScript), `bun.md` (comparison), `vite.md` (if using Vite).

---

## Project Setup

- **Init**: `npm init -y`
- **Run**: `node --watch src/main.js` (Node 22+)
- **Test**: `node --test` (built-in) or `vitest`
- **Type check**: `tsc --noEmit` (if JSDoc types or TS)
- **Lint**: `eslint .`
- **Format**: `prettier --check .`

## Runtime Configuration

### package.json essentials

```json
{
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "start": "node src/main.js",
    "dev": "node --watch src/main.js",
    "test": "node --test",
    "lint": "eslint . && prettier --check ."
  }
}
```

## Code Patterns

### File Structure

```
src/
├── main.js             # entry point
├── app.js              # Express/Fastify app setup
├── domain/             # business logic
├── application/        # use cases
├── infrastructure/     # DB, external services, config
└── interface/          # HTTP handlers, middleware

tests/
├── unit/
└── integration/
```

### Express App Pattern

```javascript
import express from 'express';

const app = express();
app.use(express.json());

// Error handling middleware — one at the end
app.use((err, req, res, _next) => {
  const status = err.status ?? 500;
  res.status(status).json({
    error: { code: err.code ?? 'INTERNAL', message: err.message },
  });
});

export { app };
```

### Async Handler Wrapper

```javascript
/** Wrap async route handlers to catch errors */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
```

## Conventions

- **ESM only**: `"type": "module"`. Use `import`/`export`, not `require`.
- **Top-level await**: Available in ESM — use it for startup logic
  (connect DB, load config).
- **`node:` protocol**: `import { readFile } from 'node:fs/promises'` not
  `import { readFile } from 'fs'`. Explicit about built-ins.
- **Process exit**: `process.exit(1)` only in the main entry point, never
  in library code. Throw and let the entry point handle it.
- **Environment**: `process.env` at startup only, never at runtime.
  Parse into a typed config object at bootstrap.
- **Error handling**: Always attach `.catch()` to promises. Unhandled
  rejections crash Node 15+. Use `process.on('unhandledRejection')` as a
  last resort at the entry point.
- **Streams**: Prefer web `ReadableStream`/`WritableStream` in new code.
  Legacy Node streams for backward compatibility.
- **Cluster/worker**: Only when you need CPU-bound parallelism. For I/O,
  the event loop handles it. Use `node:cluster` or `piscina`.
- **Test**: Node built-in `node:test` + `node:assert` for simple projects.
  Vitest for complex ones.
- **No `npm start` in production**: Use a process manager (PM2) or container
  orchestrator.
