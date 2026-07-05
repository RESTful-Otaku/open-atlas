# Svelte Skill

Loaded when the project uses Svelte (with or without SvelteKit). Supplements
`rules/conventions.md` with Svelte-specific patterns.

**Also load**: `typescript.md` for TypeScript configuration and patterns.
If targeting mobile, also load `capacitor.md`.

---

## Project Setup

- **Init**: `npx sv create <name>` (SvelteKit) or `npm create vite@latest` (SPA)
- **Dev**: `npm run dev`
- **Build**: `npm run build`
- **Check**: `svelte-check --tsconfig ./tsconfig.json`
- **Lint**: `eslint .`
- **Format**: `prettier --check .`

## SvelteKit Project Structure

```
src/
├── lib/
│   ├── components/    # reusable UI components
│   ├── server/        # server-only lib
│   └── types/         # shared types
├── routes/
│   ├── +page.svelte
│   ├── +layout.svelte
│   ├── +page.server.ts
│   └── api/
│       └── +server.ts
├── app.html
├── app.css
└── hooks.server.ts    # hooks
```

## Code Patterns

### Component Structure (Svelte 5 — runes syntax)

```svelte
<script lang="ts">
  let { title, items }: { title: string; items: Item[] } = $props();

  let expanded = $state(false);
  let selected = $state<Item | null>(null);

  function toggle() {
    expanded = !expanded;
  }
</script>

<button onclick={toggle}>
  {title} ({items.length})
</button>

{#if expanded}
  <ul>
    {#each items as item (item.id)}
      <li class:selected={item === selected} onclick={() => selected = item}>
        {item.name}
      </li>
    {/each}
  </ul>
{/if}
```

### Derived State

```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

### Effects (use sparingly)

```svelte
<script lang="ts">
  let user = $state<User | null>(null);
  
  $effect(() => {
    // runs when user changes
    if (user) {
      console.log('user changed to', user.name);
    }
  });
</script>
```

### Stores (Svelte 4 legacy — avoid in new code)

Prefer Svelte 5 `$state()` and `$derived()` over stores. If stores are needed
(shared state across modules):

```typescript
// src/lib/stores/user.ts
import { writable, derived } from 'svelte/store';
import type { User } from '$lib/types';

export const currentUser = writable<User | null>(null);
export const isLoggedIn = derived(currentUser, $u => $u !== null);
```

## Style Conventions

- **Scoped styles**: Use `<style>` per component. Avoid global styles unless
  it's `app.css`.
- **CSS variables**: For theming.
- **Class naming**: Utility classes from Tailwind, or BEM-like for hand-written
  CSS. Be consistent within a project.
- **No `:global` abuse**: Prefer CSS variables and composition over deep global
  overrides.

## Conventions

- **File naming**: `ComponentName.svelte` (PascalCase). Routes are SvelteKit
  naming (`+page.svelte`, `+layout.svelte`).
- **Props**: Define explicitly with `$props()`. No implicit `export let`.
- **Event handling**: Use `onclick` (lowercase, modern Svelte 5) not `on:click`.
- **TypeScript**: Always `<script lang="ts">`. No plain JS in `.svelte` files.
- **No business logic in components**: Extract to `.ts` modules.
- **Server vs client**: Keep server code in `+page.server.ts` / `+server.ts`.
  Client logic in component scripts.
- **Loading states**: Handle loading, error, and empty states in every
  component that fetches data.
