/**
 * Tiny hash-based router.
 *
 * # Why hand-rolled?
 *
 * We only have a small, closed set of routes (see `VIEW_CATALOG`). A
 * library would add a dependency and its own mental model for minimal
 * gain. Hash routing also means the Vite static build needs no server
 * rewrite rules — a link-shared URL still routes correctly when the
 * dashboard is hosted under any path.
 *
 * # Contract
 *
 * A route is a pattern string with colon-prefixed parameter segments,
 * e.g. `/events/:id`. Exactly one pattern matches a given location; if
 * none matches we fall back to the first registered pattern (the
 * "home" route). This is intentionally fail-closed: an unknown URL
 * never renders a blank screen.
 *
 * The matcher is linear over `ROUTE_TABLE`. The table is bounded and
 * tiny, so this is O(routes) per navigation — well under any
 * user-perceivable budget.
 */

import { DOMAIN_CATALOG } from "./colors";

export interface RouteMatch {
  /** The matched pattern, e.g. `/events/:id`. */
  readonly pattern: string;
  /** Captured parameters, e.g. `{ id: "17" }`. */
  readonly params: Readonly<Record<string, string>>;
  /** Raw path after the hash, e.g. `/events/17`. */
  readonly path: string;
}

/** Per-domain “desk” paths — one concrete URL per `DOMAIN_CATALOG` id. */
const DOMAIN_VIEW_PATHS = DOMAIN_CATALOG.map(
  (d) => `/domain/${d.id}` as const,
);

/** Every route the shell knows about. Order matters — first is home. */
export const ROUTE_TABLE = [
  "/",
  "/hub",
  "/viz",
  "/matrix/:id",
  "/map",
  ...DOMAIN_VIEW_PATHS,
  "/entities",
  "/events/:id",
  "/settings",
  "/legacy",
] as const;

export type RoutePattern = (typeof ROUTE_TABLE)[number];

/**
 * Reactive current route. Components read this to decide what to
 * render. Writes go through {@link navigate}; direct assignment is
 * discouraged because the hash would drift from the state.
 */
export const router = $state<{ match: RouteMatch }>({
  match: matchPath(currentHashPath()),
});

let disposeRouter: (() => void) | null = null;

function sameMatch(a: RouteMatch, b: RouteMatch): boolean {
  if (a.pattern !== b.pattern || a.path !== b.path) return false;
  const aKeys = Object.keys(a.params);
  const bKeys = Object.keys(b.params);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a.params[k] !== b.params[k]) return false;
  }
  return true;
}

/** Apply `path` to reactive router state (does not touch `location.hash`). */
export function applyRoute(path: string): RouteMatch {
  const normalized = normalizePath(path);
  const next = matchPath(normalized);
  if (!sameMatch(router.match, next)) {
    router.match = next;
  }
  return next;
}

/**
 * Navigate to `path`, updating reactive state and the hash. State is
 * committed synchronously so the shell swaps views even if `hashchange`
 * is delayed or lost (e.g. dev HMR). Same-path navigation is a no-op.
 */
export function navigate(path: string): void {
  const normalized = normalizePath(path);
  const prev = router.match;
  const next = matchPath(normalized);
  if (currentHashPath() === next.path && sameMatch(prev, next)) return;
  const fragment = normalized === "/" ? "#/" : `#${normalized}`;
  if (window.location.hash !== fragment) {
    window.location.hash = fragment;
  }
  applyRoute(normalized);
}

/** Read the path portion of `window.location.hash`, without the `#`. */
function currentHashPath(): string {
  const raw = window.location.hash || "#/";
  const trimmed = raw.startsWith("#") ? raw.slice(1) : raw;
  return normalizePath(trimmed);
}

function normalizePath(path: string): string {
  if (!path || path === "#") return "/";
  const trimmed = path.startsWith("#") ? path.slice(1) : path;
  if (!trimmed.startsWith("/")) return `/${trimmed}`;
  return trimmed;
}

/**
 * Match `path` against every pattern in `ROUTE_TABLE` in order,
 * returning the first hit. If nothing matches we return the home
 * pattern; the UI never renders "404" — it silently falls home so a
 * stale bookmark still lands somewhere useful.
 */
export function matchPath(path: string): RouteMatch {
  for (const pattern of ROUTE_TABLE) {
    const params = tryMatch(pattern, path);
    if (params !== null) return { pattern, params, path };
  }
  return { pattern: ROUTE_TABLE[0], params: {}, path };
}

function tryMatch(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const patternSegments = splitSegments(pattern);
  const pathSegments = splitSegments(path);
  if (patternSegments.length !== pathSegments.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const p = patternSegments[i];
    const v = pathSegments[i];
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(v);
    } else if (p !== v) {
      return null;
    }
  }
  return params;
}

function splitSegments(path: string): string[] {
  if (path === "/" || path === "") return [""];
  return path.replace(/^\//, "").split("/");
}

function syncRouterFromHash(): void {
  applyRoute(currentHashPath());
}

/**
 * Wire up hashchange listening. Idempotent — safe to call from `main.ts`
 * and `Shell` onMount. Returns a teardown fn so tests can opt out.
 */
export function installRouter(): () => void {
  if (disposeRouter) disposeRouter();

  const onChange = () => {
    syncRouterFromHash();
  };
  window.addEventListener("hashchange", onChange);
  // Ensure the hash is canonical on first mount (e.g. "" → "/").
  if (!window.location.hash || window.location.hash === "#") {
    window.location.hash = "/";
  } else {
    onChange();
  }

  disposeRouter = () => {
    window.removeEventListener("hashchange", onChange);
    disposeRouter = null;
  };
  return disposeRouter;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeRouter?.();
  });
}
