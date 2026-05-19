/**
 * UI theme (dark / dim / light). Persisted in localStorage and applied via
 * `data-theme` on `<html>` so CSS tokens and `color-scheme` stay in sync.
 */

export type ThemeId = "dark" | "dim" | "light";

const LS_KEY = "openatlas-theme";
const DEFAULT_THEME: ThemeId = "dark";

export const THEME_OPTIONS: ReadonlyArray<{
  id: ThemeId;
  label: string;
  description: string;
}> = [
  {
    id: "dark",
    label: "Dark",
    description: "Default operator console — high contrast on deep surfaces.",
  },
  {
    id: "dim",
    label: "Dim",
    description: "Softer mid-tones between dark and light; easier in bright rooms.",
  },
  {
    id: "light",
    label: "Light",
    description: "Daylight-friendly palette for presentations and print.",
  },
];

export function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const raw = window.localStorage.getItem(LS_KEY);
  if (raw === "dark" || raw === "dim" || raw === "light") return raw;
  return DEFAULT_THEME;
}

import { THEME_CHANGE } from "./theme-events";

export function applyTheme(theme: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme =
    theme === "light" ? "light" : "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      theme === "light" ? "#f4f4f5" : theme === "dim" ? "#141418" : "#0a0c10",
    );
  }
  window.dispatchEvent(
    new CustomEvent<ThemeId>(THEME_CHANGE, { detail: theme }),
  );
}

export function setTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(LS_KEY, theme);
  } catch {
    /* private mode */
  }
  applyTheme(theme);
}

/** Call once before mounting the app. */
export function initTheme(): ThemeId {
  const theme = readStoredTheme();
  applyTheme(theme);
  return theme;
}
