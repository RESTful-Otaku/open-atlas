import { DOMAIN_CATALOG } from "./colors";

export interface RouteMatch {
  readonly pattern: string;
  readonly params: Readonly<Record<string, string>>;
  readonly path: string;
}

const DOMAIN_VIEW_PATHS = DOMAIN_CATALOG.map(
  (d) => `/domain/${d.id}` as const,
);


export const ROUTE_TABLE = [
  "/",
  "/hub",
  "/viz",
  "/matrix/:id",
  "/map",
  ...DOMAIN_VIEW_PATHS,
  "/entities",
  "/events/:id",
  "/health",
  "/settings",
  "/legacy",
] as const;

export type RoutePattern = (typeof ROUTE_TABLE)[number];


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


export function applyRoute(path: string): RouteMatch {
  const normalized = normalizePath(path);
  const next = matchPath(normalized);
  if (!sameMatch(router.match, next)) {
    router.match = next;
  }
  return next;
}


export function navigate(path: string): void {
  const normalized = normalizePath(path);
  const prev = router.match;
  const next = matchPath(normalized);
  if (currentHashPath() === next.path && sameMatch(prev, next)) return;
  const encoded = normalized
    .split("/")
    .map((seg) => (seg ? encodeURIComponent(seg) : seg))
    .join("/");
  const fragment = encoded === "/" ? "#/" : `#${encoded}`;
  if (window.location.hash !== fragment) {
    window.location.hash = fragment;
  }
  applyRoute(normalized);
}


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


export function installRouter(): () => void {
  if (disposeRouter) disposeRouter();

  const onChange = () => {
    syncRouterFromHash();
  };
  window.addEventListener("hashchange", onChange);
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
