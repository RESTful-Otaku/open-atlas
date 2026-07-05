# React Skill

Loaded when the project uses React (web). Supplements `rules/conventions.md`
with React-specific patterns.

**Also load**: `typescript.md` (if using TS), `vite.md` (build tool),
`tailwind.md` (if using Tailwind CSS), `javascript.md` (if plain JS).

---

## Project Setup

- **Init**: `npm create vite@latest -- --template react-ts`
- **Dev**: `npm run dev`
- **Build**: `npm run build`
- **Lint**: `eslint .`
- **Type check**: `tsc --noEmit`

## Project Structure

```
src/
├── main.tsx              # entry point, rendering
├── app.tsx               # root component, routing
├── pages/                # route-level components
├── components/           # shared UI components
├── hooks/                # custom hooks
├── lib/                  # utilities, API clients, config
├── types/                # shared types
└── styles/               # global styles, CSS modules
```

## Code Patterns

### Component Structure — Functional + Hooks

```typescript
import { useState, useCallback } from 'react';
import type { User } from '~/types';

interface UserProfileProps {
  userId: string;
}

export function UserProfile({ userId }: UserProfileProps) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    try {
      const data = await fetchUser(userId);
      setUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [userId]);

  // ...render
}
```

### Data Fetching Pattern

```typescript
// Custom hook for data fetching
function useFetch<T>(url: string): {
  data: T | null;
  error: Error | null;
  loading: boolean;
} {
  const [state, setState] = useState<AsyncState<T>>({
    status: 'idle',
  });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', error });
      });

    return () => { cancelled = true; };
  }, [url]);

  return state;
}
```

### Error Boundary

```typescript
import { Component } from 'react';
import type { ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <div>Something went wrong</div>;
    }
    return this.props.children;
  }
}
```

## Conventions

- **Functional components + hooks** over class components. Only use class
  components for error boundaries (they have no hook equivalent yet).
- **TypeScript**: Always `.tsx`. No plain JS in React projects unless
  absolutely necessary.
- **Props interface**: `ComponentNameProps` convention. Co-located with
  the component.
- **Named exports**: `export function Button()` over `export default Button`.
  Better refactoring and tree-shaking.
- **No `index.tsx` barrel files** in component directories — prefer
  explicit imports.
- **Custom hooks**: Files named `use<Thing>.ts`. Hooks should start with
  `use`. Keep them focused — one hook, one responsibility.
- **State management**:
  - Local state: `useState`/`useReducer`.
  - Shared state: React Context for low-frequency updates.
  - Global state: Zustand or Jotai over Redux for new projects.
  - Server state: TanStack Query (React Query) over manual
    `useEffect`+`fetch`.
- **No `useEffect` for derived state**: Use `useMemo` or compute during
  render.
- **No inline arrow functions in JSX props** (causes re-renders):
  ```typescript
  // Avoid
  <button onClick={() => doThing(id)} />

  // Prefer
  const handleClick = useCallback(() => doThing(id), [id]);
  <button onClick={handleClick} />
  ```
- **Testing**: Vitest + React Testing Library. Test behaviour, not
  implementation. Prefer `screen.getByRole` over `screen.getByTestId`.
- **Styling**: Tailwind CSS preferred. CSS modules for complex components
  that need scoping.
