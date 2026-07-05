# Tailwind CSS Skill

Loaded when the project uses Tailwind CSS. Supplements `rules/conventions.md`
with Tailwind-specific patterns.

**Also load**: `vite.md` (if Vite), `react.md` or `svelte.md` (framework).

---

## Project Setup

- **Install**: `npm add tailwindcss @tailwindcss/vite`
- **Config**: Add to `vite.config.ts`:
  ```typescript
  import tailwindcss from '@tailwindcss/vite';

  export default defineConfig({
    plugins: [tailwindcss()],
  });
  ```
- **CSS entry** (`src/index.css`):
  ```css
  @import "tailwindcss";
  ```
- **No `tailwind.config.js` needed** in Tailwind v4 — configuration is
  done via CSS `@theme` directives.

## Configuration (Tailwind v4)

```css
/* src/index.css */
@import "tailwindcss";

@theme {
  --color-primary: #007AFF;
  --color-surface: #F5F5F5;
  --font-family-sans: 'Inter', sans-serif;
  --breakpoint-xs: 24rem;
}
```

For v3 projects, use `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { primary: '#007AFF' },
    },
  },
};
```

## Code Patterns

### Utility-First Approach

```typescript
// Good — utility classes handle layout, spacing, typography
export function Card({ title, children }: CardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-600">{children}</p>
    </div>
  );
}
```

### Extracting Components (when patterns repeat)

```typescript
// Extract repeated utility groups into components, not CSS classes
function Badge({ variant }: { variant: 'success' | 'error' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
        variant === 'success' && 'bg-green-100 text-green-700',
        variant === 'error' && 'bg-red-100 text-red-700',
      )}
    />
  );
}
```

## Conventions

- **Utility classes first**. Extract a component or `@apply` directive
  only when the same 5+ utilities repeat in 3+ places.
- **`cn()` helper** for conditional classes (install `clsx` + `tailwind-merge`
  or use a tiny `cn` utility):

  ```typescript
  import { clsx } from 'clsx';
  import { twMerge } from 'tailwind-merge';

  export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
  }
  ```

- **No `@apply` in CSS** unless standardising a design token. `@apply`
  recreates the specificity problems Tailwind was designed to avoid.
- **Responsive**: Mobile-first. `sm:`, `md:`, `lg:`, `xl:` prefixes.
  Don't add `max-` breakpoints unless absolutely necessary.
- **Dark mode**: `dark:` variant (`dark:bg-gray-900`). Configure via
  `@variant dark (&:where(.dark, .dark *))` in CSS (v4) or
  `darkMode: 'class'` in config (v3).
- **Custom design tokens**: Add in `@theme` (v4) or `theme.extend` (v3).
  Avoid arbitrary values (`w-[300px]`) unless one-off — they defeat
  design consistency.
- **No Tailwind in JavaScript**: `className` strings only. Don't
  dynamically construct class names — use `cn()` with conditional logic.
- **Ordering**: Organise classes by category (layout → spacing → sizing →
  typography → visual). Prettier Tailwind plugin auto-sorts with
  `prettier-plugin-tailwindcss`.
- **Build**: Tailwind purges unused classes in production automatically.
  No extra configuration needed.
