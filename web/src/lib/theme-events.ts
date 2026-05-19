import type { ThemeId } from "./theme.svelte";

export const THEME_CHANGE = "openatlas-theme-change";

export function readThemeFromDocument(): ThemeId {
  if (typeof document === "undefined") return "dark";
  const t = document.documentElement.dataset.theme;
  if (t === "light" || t === "dim" || t === "dark") return t;
  return "dark";
}

export function onThemeChange(handler: (theme: ThemeId) => void): () => void {
  const listener = (ev: Event): void => {
    const detail = (ev as CustomEvent<ThemeId>).detail;
    handler(detail ?? readThemeFromDocument());
  };
  window.addEventListener(THEME_CHANGE, listener);
  return () => window.removeEventListener(THEME_CHANGE, listener);
}
