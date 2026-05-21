import { backOut, quintInOut } from "svelte/easing";

/** Shared motion tokens for mobile overlays (respect prefers-reduced-motion in CSS). */
export const MOTION_FAST_MS = 220;
export const MOTION_PANEL_MS = 280;
/** Settings accordion expand/collapse on compact layouts. */
export const MOTION_SETTINGS_FOLD_MS = 260;

/** Smooth ease-in-out for settings folds (close to `--ease` in app.css). */
export const appEase = quintInOut;

export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Height + opacity for settings section bodies. */
export function settingsFoldTransition() {
  if (prefersReducedMotion()) {
    return { duration: 0 };
  }
  const duration = MOTION_SETTINGS_FOLD_MS;
  return {
    slide: { duration, easing: appEase },
    fade: { duration: duration * 0.85, easing: appEase },
  };
}

export const fadePanel = {
  duration: MOTION_FAST_MS,
};

/** Backdrop drops instantly on close so the bottom nav stays tappable during sheet exit. */
export const fadePanelBackdrop = {
  duration: 0,
};

export const flyFromRight = {
  x: 16,
  duration: MOTION_PANEL_MS,
  easing: backOut,
  opacity: 0,
};

/** Full-width settings drill-down (detail pushes in from the right). */
export function settingsScreenFly(widthPx: number) {
  if (prefersReducedMotion()) {
    return { duration: 0 };
  }
  return {
    x: Math.max(widthPx, 280),
    duration: MOTION_PANEL_MS,
    easing: backOut,
    opacity: 1,
  };
}

export const flyFromBottom = {
  y: 18,
  duration: MOTION_PANEL_MS,
  easing: backOut,
  opacity: 0,
};

export const fadeSearch = {
  duration: MOTION_FAST_MS,
};
