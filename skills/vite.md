# Vite Skill

Loaded when the project uses Vite as the build tool. Supplements
`rules/conventions.md` with Vite-specific patterns.

**Also load**: `react.md` (if React), `svelte.md` (if Svelte),
`typescript.md` or `javascript.md` depending on language.

---

## Project Setup

- **Init**: `npm create vite@latest <name> -- --template <template>`
- **Templates**: `vanilla-ts`, `react-ts`, `svelte-ts`, `vue-ts`, `lit-ts`
- **Dev**: `npm run dev`
- **Build**: `npm run build`
- **Preview**: `npm run preview`
- **Type check**: `tsc --noEmit`

## Config Patterns

### vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  build: {
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
});
```

### Path Aliases (tsconfig.json)

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "~/*": ["src/*"]
    }
  }
}
```

## Conventions

- **`vite-tsconfig-paths`** for path aliases (`~/components/Button`).
  Do not hardcode relative paths like `../../components/Button`.
- **Environment variables**: Vite exposes `import.meta.env.VITE_*` vars.
  Prefix with `VITE_`. Never expose secrets. Define custom env types in
  `src/vite-env.d.ts`:

  ```typescript
  /// <reference types="vite/client" />
  interface ImportMetaEnv {
    readonly VITE_API_URL: string;
  }
  ```

- **Separate build configs** for different environments
  (`vite.config.ts` base, `vite.config.prod.ts` overrides, composed via
  `vite merge` or conditional logic).
- **Manual chunks** for vendor code in production builds (see above).
  Improves caching — vendors change less often than app code.
- **No `process.env`**: Vite replaces Node-style env vars at build time
  for browser-targeted code. Use `import.meta.env` instead.
- **CSS**: Vite supports CSS modules (`*.module.css`), PostCSS, and
  Tailwind out of the box. PostCSS config in `postcss.config.js`.
- **Testing with Vitest**: Vite-native. Same config file. Use
  `@testing-library/react` + `jsdom` environment. Co-locate test files
  with components (`Button.test.tsx` next to `Button.tsx`).
- **Build output**: Defaults to `dist/`. Set `build.outDir` if needed.
  Use `.gitignore` to exclude it.
- **Legacy browser support**: Add `@vitejs/plugin-legacy` if you need
  ES5 support. Otherwise, target modern browsers only.
- **No `@vitejs/plugin-react-swc`** unless you need faster compile times
  in very large projects. The default esbuild-based plugin is sufficient
  for most.
