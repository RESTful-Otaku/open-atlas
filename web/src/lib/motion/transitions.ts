import { backOut, quintInOut } from "svelte/easing";

/** Shared motion tokens for mobile overlays (respect prefers-reduced-motion in CSS). */
export const MOTION_FAST_MS = 220;
export const MOTION_PANEL_MS = 280;
/** Settings accordion expand/collapse on compact layouts. */
export const MOTION_SETTINGS_FOLD_MS = 260;
/** Settings drill-down track slide (list ↔ section). */
export const MOTION_SETTINGS_TRACK_MS = 320;
/** Subtle overshoot for premium mobile panel slides. */
export const settingsTrackEase = backOut;

/** Smooth ease-in-out for settings folds (close to `--ease` in app.css). */
export const appEase = quintInOut;

export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type SettingsFoldTransitionOptions = {
  /** Desktop/web accordion — slightly longer with subtle ease-out overshoot. */
  desktop?: boolean;
};

/** Height + opacity for settings section bodies. */
export function settingsFoldTransition(
  options: SettingsFoldTransitionOptions = {},
): { slide: { duration: number; easing: (t: number) => number }; fade: { duration: number; easing: (t: number) => number } } {
  if (prefersReducedMotion()) {
    return {
      slide: { duration: 0, easing: appEase },
      fade: { duration: 0, easing: appEase },
    };
  }
  const duration = options.desktop ? MOTION_SETTINGS_FOLD_MS + 40 : MOTION_SETTINGS_FOLD_MS;
  const easing = options.desktop ? backOut : appEase;
  return {
    slide: { duration, easing },
    fade: { duration: Math.round(duration * 0.82), easing: appEase },
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
