import type { Component } from "svelte";

type ViewModule = { default: Component };

const MAX_CACHED_VIEWS = 5;

const cache = new Map<string, Component>();
const loadOrder: string[] = [];

const LOADERS: Record<string, () => Promise<ViewModule>> = {
  "/": () => import("./views/GlobeHomeView.svelte"),
  "/map": () => import("./views/MapView.svelte"),
  "/hub": () => import("./views/HubView.svelte"),
  "/viz": () => import("./views/VizShowcaseView.svelte"),
  "/matrix/:id": () => import("./views/MatrixHostView.svelte"),
  "/entities": () => import("./views/EntitiesView.svelte"),
  "/legacy": () => import("./views/LegacyView.svelte"),
  "/health": () => import("./views/HealthView.svelte"),
  "/settings": () => import("./views/SettingsView.svelte"),
  "/events/:id": () => import("./views/EventDetailView.svelte"),
};


function loaderForPattern(pattern: string): () => Promise<ViewModule> {
  if (pattern.startsWith("/domain/")) {
    return () => import("./views/DomainView.svelte");
  }
  return LOADERS[pattern] ?? LOADERS["/"]!;
}

function touchCache(pattern: string, component: Component): Component {
  const i = loadOrder.indexOf(pattern);
  if (i >= 0) loadOrder.splice(i, 1);
  loadOrder.push(pattern);
  cache.set(pattern, component);
  while (loadOrder.length > MAX_CACHED_VIEWS) {
    const evict = loadOrder.shift();
    if (evict) cache.delete(evict);
  }
  return component;
}


export function peekCachedView(pattern: string): Component | undefined {
  return cache.get(pattern);
}

export async function loadViewForPattern(pattern: string): Promise<Component> {
  const hit = cache.get(pattern);
  if (hit) return touchCache(pattern, hit);
  const mod = await loaderForPattern(pattern)();
  return touchCache(pattern, mod.default);
}


export function prefetchView(pattern: string): void {
  if (cache.has(pattern)) return;
  const run = (): void => {
    void loadViewForPattern(pattern).catch(() => {

    });
  };
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 200);
  }
}

export function evictAllViewCache(): void {
  cache.clear();
  loadOrder.length = 0;
}
